-- FW-1: capture criterion-level post-interview observations and the existing
-- final human decision atomically. No worker or AI credential can write either.
-- Forward-only rollback: observations and decisions are append-only history.

create type public.interview_criterion_verdict as enum (
  'MATCHED',
  'WEAKER',
  'STRONGER',
  'NOT_ASKED'
);
create type public.interview_weakness_type as enum (
  'FALSE_CLAIM',
  'LEVEL_INSUFFICIENT',
  'AI_MISREAD'
);
create type public.interview_observation_source as enum (
  'FORM',
  'FREE_TEXT',
  'TRANSCRIPT'
);
create table public.interview_observation_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  scorecard_version_id uuid not null references public.scorecard_versions (id) on delete restrict,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  off_criteria_reason text
    check (off_criteria_reason is null or length(off_criteria_reason) <= 2000),
  supersedes_session_id uuid unique
    references public.interview_observation_sessions (id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.interview_observations (
  id uuid primary key default gen_random_uuid(),
  interview_observation_session_id uuid not null
    references public.interview_observation_sessions (id) on delete restrict,
  application_id uuid not null references public.applications (id) on delete restrict,
  criterion_id uuid not null references public.criteria (id) on delete restrict,
  criterion_lineage_id uuid not null,
  verdict public.interview_criterion_verdict not null,
  weakness_type public.interview_weakness_type,
  note text check (note is null or length(note) <= 1000),
  source public.interview_observation_source not null default 'FORM',
  ai_draft_accepted boolean,
  confirmed_at timestamptz,
  observer_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (interview_observation_session_id, criterion_id),
  check ((verdict = 'WEAKER') = (weakness_type is not null)),
  check (
    (
      source = 'FORM'
      and ai_draft_accepted is null
      and confirmed_at is not null
    )
    or (
      source <> 'FORM'
      and ai_draft_accepted is not null
      and (
        (ai_draft_accepted and confirmed_at is not null)
        or (not ai_draft_accepted and confirmed_at is null)
      )
    )
  )
);
alter table public.human_reviews
  add column observation_session_id uuid unique
    references public.interview_observation_sessions (id) on delete restrict;
create index interview_observation_sessions_application_created_idx
  on public.interview_observation_sessions (application_id, created_at desc);
create index interview_observations_application_criterion_idx
  on public.interview_observations (application_id, criterion_id);
create index interview_observations_lineage_idx
  on public.interview_observations (criterion_lineage_id);
create trigger interview_observation_sessions_prevent_update_or_delete
before update or delete on public.interview_observation_sessions
for each row execute function public.prevent_review_history_mutation();
create trigger interview_observations_prevent_update_or_delete
before update or delete on public.interview_observations
for each row execute function public.prevent_review_history_mutation();
alter table public.interview_observation_sessions enable row level security;
alter table public.interview_observations enable row level security;
create policy interview_observation_sessions_select_assigned
  on public.interview_observation_sessions for select to authenticated
  using (public.can_access_application(application_id));
create policy interview_observations_select_assigned
  on public.interview_observations for select to authenticated
  using (public.can_access_application(application_id));
grant select on public.interview_observation_sessions to authenticated;
grant select on public.interview_observations to authenticated;
revoke insert, update, delete on public.interview_observation_sessions
  from anon, authenticated, service_role;
revoke insert, update, delete on public.interview_observations
  from anon, authenticated, service_role;
create function public.record_post_interview_review(
  target_application_id uuid,
  target_scorecard_version_id uuid,
  observations jsonb,
  off_criteria_reason_value text,
  new_decision public.human_decision,
  new_reason_code text,
  new_reason_detail text,
  new_confidence public.review_confidence,
  new_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  target_hiring_manager_id uuid;
  target_workflow_state text;
  latest_progression public.interview_progression_reviews%rowtype;
  previous_session public.interview_observation_sessions%rowtype;
  previous_review public.human_reviews%rowtype;
  created_session_id uuid;
  created_review_id uuid;
  criterion_count integer;
  item jsonb;
  item_criterion_id uuid;
  item_lineage_id uuid;
  item_verdict public.interview_criterion_verdict;
  item_weakness public.interview_weakness_type;
  seen_criterion_ids uuid[] := '{}';
  normalized_off_criteria text := nullif(trim(coalesce(off_criteria_reason_value, '')), '');
  normalized_code text := trim(coalesce(new_reason_code, ''));
  normalized_detail text := trim(coalesce(new_reason_detail, ''));
  normalized_note text := nullif(trim(coalesce(new_note, '')), '');
  verdict_counts jsonb;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select job.id, job.hiring_manager_id, application.workflow_state
  into target_job_id, target_hiring_manager_id, target_workflow_state
  from public.applications application
  join public.jobs job on job.id = application.job_id
  where application.id = target_application_id
  for update of application, job;

  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'HIRING_MANAGER'::public.app_role
    and target_hiring_manager_id = actor
    and public.has_active_review_assignment(target_application_id, actor)
  ) then
    raise exception 'assigned Hiring Manager or Admin required' using errcode = '42501';
  end if;
  if target_workflow_state not in ('INTERVIEW_SELECTED', 'INTERVIEW_COMPLETED') then
    raise exception 'completed interview selection required' using errcode = '55000';
  end if;

  select * into latest_progression
  from public.interview_progression_reviews
  where application_id = target_application_id
  order by created_at desc, id desc
  limit 1;

  if latest_progression.id is null
     or latest_progression.outcome <> 'INTERVIEW'::public.interview_progression_outcome
     or latest_progression.scorecard_version_id <> target_scorecard_version_id then
    raise exception 'matching INTERVIEW progression outcome required' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.scorecard_versions scorecard
    where scorecard.id = target_scorecard_version_id
      and scorecard.job_id = target_job_id
      and scorecard.approved_at is not null
      and scorecard.status in (
        'APPROVED'::public.scorecard_status,
        'SUPERSEDED'::public.scorecard_status
      )
  ) then
    raise exception 'approved Review Framework version required' using errcode = '22023';
  end if;

  if normalized_code = ''
     or length(normalized_code) > 100
     or normalized_detail = ''
     or length(normalized_detail) > 2000 then
    raise exception 'reason code and detail are required' using errcode = '22023';
  end if;
  if normalized_note is not null and length(normalized_note) > 2000 then
    raise exception 'decision note is too long' using errcode = '22023';
  end if;
  if normalized_off_criteria is not null and length(normalized_off_criteria) > 2000 then
    raise exception 'off-criteria reason is too long' using errcode = '22023';
  end if;
  if jsonb_typeof(observations) <> 'array' then
    raise exception 'observations must be an array' using errcode = '22023';
  end if;

  select count(*) into criterion_count
  from public.criteria
  where scorecard_version_id = target_scorecard_version_id;

  if jsonb_array_length(observations) <> criterion_count then
    raise exception 'every approved criterion must be observed exactly once' using errcode = '22023';
  end if;

  select * into previous_session
  from public.interview_observation_sessions
  where application_id = target_application_id
  order by created_at desc, id desc
  limit 1
  for update;

  select * into previous_review
  from public.human_reviews
  where application_id = target_application_id
  order by created_at desc, id desc
  limit 1
  for update;

  insert into public.interview_observation_sessions (
    application_id,
    scorecard_version_id,
    reviewer_id,
    off_criteria_reason,
    supersedes_session_id
  ) values (
    target_application_id,
    target_scorecard_version_id,
    actor,
    normalized_off_criteria,
    previous_session.id
  )
  returning id into created_session_id;

  for item in select * from jsonb_array_elements(observations)
  loop
    if jsonb_typeof(item) <> 'object'
       or (select count(*) from jsonb_object_keys(item)) <> 4
       or not (item ?& array['criterion_id', 'verdict', 'weakness_type', 'note']) then
      raise exception 'observation contains unknown or missing keys' using errcode = '22023';
    end if;
    if jsonb_typeof(item->'criterion_id') <> 'string'
       or (item->>'criterion_id') !~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       or jsonb_typeof(item->'verdict') <> 'string'
       or item->>'verdict' not in ('MATCHED', 'WEAKER', 'STRONGER', 'NOT_ASKED')
       or (
         item->'weakness_type' <> 'null'::jsonb
         and (
           jsonb_typeof(item->'weakness_type') <> 'string'
           or item->>'weakness_type' not in (
             'FALSE_CLAIM',
             'LEVEL_INSUFFICIENT',
             'AI_MISREAD'
           )
         )
       )
       or (
         item->'note' <> 'null'::jsonb
         and (
           jsonb_typeof(item->'note') <> 'string'
           or length(trim(item->>'note')) > 1000
         )
       ) then
      raise exception 'invalid observation value' using errcode = '22023';
    end if;

    item_criterion_id := (item->>'criterion_id')::uuid;
    if item_criterion_id = any(seen_criterion_ids) then
      raise exception 'duplicate criterion observation' using errcode = '22023';
    end if;

    select lineage_id into item_lineage_id
    from public.criteria
    where id = item_criterion_id
      and scorecard_version_id = target_scorecard_version_id;
    if not found then
      raise exception 'unknown criterion observation' using errcode = '22023';
    end if;

    item_verdict := (item->>'verdict')::public.interview_criterion_verdict;
    item_weakness := case
      when item->'weakness_type' = 'null'::jsonb then null
      else (item->>'weakness_type')::public.interview_weakness_type
    end;
    if (item_verdict = 'WEAKER'::public.interview_criterion_verdict)
       is distinct from (item_weakness is not null) then
      raise exception 'WEAKER requires a weakness type and other verdicts forbid it'
        using errcode = '22023';
    end if;

    insert into public.interview_observations (
      interview_observation_session_id,
      application_id,
      criterion_id,
      criterion_lineage_id,
      verdict,
      weakness_type,
      note,
      source,
      ai_draft_accepted,
      confirmed_at,
      observer_id
    ) values (
      created_session_id,
      target_application_id,
      item_criterion_id,
      item_lineage_id,
      item_verdict,
      item_weakness,
      nullif(trim(coalesce(item->>'note', '')), ''),
      'FORM'::public.interview_observation_source,
      null,
      now(),
      actor
    );

    seen_criterion_ids := array_append(seen_criterion_ids, item_criterion_id);
  end loop;

  insert into public.human_reviews (
    application_id,
    scorecard_version_id,
    reviewer_id,
    decision,
    reason_code,
    reason_detail,
    confidence,
    note,
    observation_session_id,
    supersedes_review_id
  ) values (
    target_application_id,
    target_scorecard_version_id,
    actor,
    new_decision,
    normalized_code,
    normalized_detail,
    new_confidence,
    normalized_note,
    created_session_id,
    previous_review.id
  )
  returning id into created_review_id;

  update public.applications
  set workflow_state = 'INTERVIEW_COMPLETED'
  where id = target_application_id;

  select coalesce(jsonb_object_agg(verdict::text, verdict_count), '{}'::jsonb)
  into verdict_counts
  from (
    select verdict, count(*) as verdict_count
    from public.interview_observations
    where interview_observation_session_id = created_session_id
    group by verdict
  ) counts;

  perform public.append_safe_audit(
    case
      when previous_session.id is null then 'POST_INTERVIEW_REVIEW_RECORDED'
      else 'POST_INTERVIEW_REVIEW_CHANGED'
    end,
    'application',
    target_application_id,
    jsonb_build_object(
      'observation_session_id', created_session_id,
      'human_review_id', created_review_id,
      'actor_role', actor_role::text,
      'criterion_count', criterion_count,
      'verdict_counts', verdict_counts
    ),
    case
      when previous_session.id is null then null
      else jsonb_build_object('observation_session_id', previous_session.id)
    end,
    jsonb_build_object(
      'observation_session_id', created_session_id,
      'human_review_id', created_review_id,
      'decision', new_decision::text
    ),
    null,
    'post_interview_review',
    target_scorecard_version_id::text
  );

  perform public.append_safe_audit(
    case
      when previous_review.id is null then 'HUMAN_DECISION_CREATED'
      else 'HUMAN_DECISION_CHANGED'
    end,
    'application',
    target_application_id,
    jsonb_build_object(
      'review_id', created_review_id,
      'observation_session_id', created_session_id,
      'actor_role', actor_role::text,
      'reason_code', normalized_code
    ),
    case
      when previous_review.id is null then null
      else jsonb_build_object(
        'review_id', previous_review.id,
        'decision', previous_review.decision::text
      )
    end,
    jsonb_build_object(
      'review_id', created_review_id,
      'decision', new_decision::text,
      'confidence', new_confidence::text
    ),
    null,
    'human_review',
    target_scorecard_version_id::text
  );

  return created_review_id;
end;
$$;
-- The legacy decision RPC remains available only for the Admin operational
-- override. Hiring Managers must record criterion observations atomically.
create or replace function public.create_human_review(
  target_application_id uuid,
  target_scorecard_version_id uuid,
  new_decision public.human_decision,
  new_reason_code text,
  new_reason_detail text,
  new_confidence public.review_confidence,
  new_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  normalized_code text := trim(coalesce(new_reason_code, ''));
  normalized_detail text := trim(coalesce(new_reason_detail, ''));
  previous_review public.human_reviews%rowtype;
  created_review_id uuid;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role <> 'ADMIN'::public.app_role then
    raise exception 'post-interview observations are required for Hiring Manager decisions'
      using errcode = '42501';
  end if;
  select application.job_id into target_job_id
  from public.applications application
  where application.id = target_application_id
  for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if normalized_code = ''
     or normalized_detail = ''
     or length(normalized_code) > 100
     or length(normalized_detail) > 2000 then
    raise exception 'reason code and detail are required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.scorecard_versions scorecard
    where scorecard.id = target_scorecard_version_id
      and scorecard.job_id = target_job_id
      and scorecard.status = 'APPROVED'::public.scorecard_status
  ) then
    raise exception 'review requires the active approved scorecard for the application job'
      using errcode = '22023';
  end if;
  select * into previous_review
  from public.human_reviews
  where application_id = target_application_id
  order by created_at desc, id desc
  limit 1
  for update;
  insert into public.human_reviews (
    application_id,
    scorecard_version_id,
    reviewer_id,
    decision,
    reason_code,
    reason_detail,
    confidence,
    note,
    supersedes_review_id
  ) values (
    target_application_id,
    target_scorecard_version_id,
    actor,
    new_decision,
    normalized_code,
    normalized_detail,
    new_confidence,
    nullif(trim(coalesce(new_note, '')), ''),
    previous_review.id
  )
  returning id into created_review_id;
  perform public.append_safe_audit(
    case
      when previous_review.id is null then 'HUMAN_DECISION_CREATED'
      else 'HUMAN_DECISION_CHANGED'
    end,
    'application',
    target_application_id,
    jsonb_build_object(
      'review_id', created_review_id,
      'actor_role', actor_role::text,
      'reason_code', normalized_code
    ),
    case
      when previous_review.id is null then null
      else jsonb_build_object(
        'review_id', previous_review.id,
        'decision', previous_review.decision::text
      )
    end,
    jsonb_build_object(
      'review_id', created_review_id,
      'decision', new_decision::text,
      'confidence', new_confidence::text
    ),
    null,
    'human_review',
    target_scorecard_version_id::text
  );
  return created_review_id;
end;
$$;
revoke execute on function public.record_post_interview_review(
  uuid,
  uuid,
  jsonb,
  text,
  public.human_decision,
  text,
  text,
  public.review_confidence,
  text
) from public, anon, service_role;
grant execute on function public.record_post_interview_review(
  uuid,
  uuid,
  jsonb,
  text,
  public.human_decision,
  text,
  text,
  public.review_confidence,
  text
) to authenticated;

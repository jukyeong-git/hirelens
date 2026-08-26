-- FW-STT: let a post-interview observation carry where it came from.
--
-- `interview_observations` has always had `source` and `ai_draft_accepted`
-- columns with a check constraint tying them to `confirmed_at`, but
-- `record_post_interview_review` hardcoded every row to `source = 'FORM'` with
-- `confirmed_at = now()`, so speech-derived drafts had no way in.
--
-- The product rule this enables: a verdict the system drafted from a transcript
-- is stored, shown, and audited, but it only counts toward criterion
-- calibration once the interviewer explicitly accepts it. An unaccepted draft
-- lands with `confirmed_at = null`, and `criterion_calibration_summary` already
-- filters on `confirmed_at is not null`, so a draft can never move a criterion
-- into REVIEW_REQUIRED on its own.
--
-- The observation contract stays closed: an item carries either the original
-- four keys (which still mean a hand-filled form) or those four plus
-- `source` and `ai_draft_accepted`. Any other shape is rejected as before.
--
-- Forward-only rollback: observations remain append-only history.

create or replace function public.record_post_interview_review_unguarded(
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
  item_key_count integer;
  item_criterion_id uuid;
  item_lineage_id uuid;
  item_verdict public.interview_criterion_verdict;
  item_weakness public.interview_weakness_type;
  item_source public.interview_observation_source;
  item_draft_accepted boolean;
  item_confirmed_at timestamptz;
  seen_criterion_ids uuid[] := '{}';
  normalized_off_criteria text := nullif(trim(coalesce(off_criteria_reason_value, '')), '');
  normalized_code text := trim(coalesce(new_reason_code, ''));
  normalized_detail text := trim(coalesce(new_reason_detail, ''));
  normalized_note text := nullif(trim(coalesce(new_note, '')), '');
  verdict_counts jsonb;
  source_counts jsonb;
  unconfirmed_count integer;
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
    if jsonb_typeof(item) <> 'object' then
      raise exception 'observation contains unknown or missing keys' using errcode = '22023';
    end if;

    select count(*) into item_key_count from jsonb_object_keys(item);

    -- Four keys means a hand-filled form. Six means the caller also declared
    -- where the verdict came from; both provenance keys must travel together so
    -- a caller cannot name a source while leaving acceptance unstated.
    if not (item ?& array['criterion_id', 'verdict', 'weakness_type', 'note'])
       or (item_key_count = 6 and not (item ?& array['source', 'ai_draft_accepted']))
       or item_key_count not in (4, 6) then
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

    if item_key_count = 6 then
      if jsonb_typeof(item->'source') <> 'string'
         or item->>'source' not in ('FORM', 'FREE_TEXT', 'TRANSCRIPT') then
        raise exception 'invalid observation source' using errcode = '22023';
      end if;
      item_source := (item->>'source')::public.interview_observation_source;

      -- A hand-filled form has no draft to accept or reject; a drafted verdict
      -- must say which it is. This mirrors the table check constraint so the
      -- caller gets a named error instead of a constraint violation.
      if item_source = 'FORM'::public.interview_observation_source then
        if item->'ai_draft_accepted' <> 'null'::jsonb then
          raise exception 'a form observation cannot accept a draft' using errcode = '22023';
        end if;
        item_draft_accepted := null;
      else
        if jsonb_typeof(item->'ai_draft_accepted') <> 'boolean' then
          raise exception 'a drafted observation must state acceptance' using errcode = '22023';
        end if;
        item_draft_accepted := (item->>'ai_draft_accepted')::boolean;
      end if;
    else
      item_source := 'FORM'::public.interview_observation_source;
      item_draft_accepted := null;
    end if;

    -- The calibration gate. Only a verdict the interviewer stands behind is
    -- timestamped as confirmed, and only confirmed observations are counted by
    -- `criterion_calibration_summary`.
    item_confirmed_at := case
      when item_source = 'FORM'::public.interview_observation_source then now()
      when item_draft_accepted then now()
      else null
    end;

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
      item_source,
      item_draft_accepted,
      item_confirmed_at,
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

  -- Provenance is audited alongside the verdicts: a reader of the trail can
  -- tell how many verdicts the system drafted and how many went in unconfirmed.
  select coalesce(jsonb_object_agg(source::text, source_count), '{}'::jsonb)
  into source_counts
  from (
    select source, count(*) as source_count
    from public.interview_observations
    where interview_observation_session_id = created_session_id
    group by source
  ) counts;

  select count(*) into unconfirmed_count
  from public.interview_observations
  where interview_observation_session_id = created_session_id
    and confirmed_at is null;

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
      'verdict_counts', verdict_counts,
      'source_counts', source_counts,
      'unconfirmed_count', unconfirmed_count
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

-- `create or replace` preserves the grants the wrapper migration set, but state
-- them again so a fresh `db:reset` cannot leave the inner function reachable.
revoke all on function public.record_post_interview_review_unguarded(
  uuid, uuid, jsonb, text, public.human_decision, text, text,
  public.review_confidence, text
) from public, anon, authenticated, service_role;

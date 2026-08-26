-- Record per-item human confirmations and require all review items before the
-- Hiring Manager can submit the hiring request. Approval no longer collects a
-- free-text reason. Rollback requires a forward migration restoring the prior
-- approve_scorecard body and removing the confirmation columns/functions.

alter table public.scorecard_versions
  add column confirmed_job_description_issue_keys jsonb not null default '[]'::jsonb
    check (jsonb_typeof(confirmed_job_description_issue_keys) = 'array'),
  add column confirmed_evaluation_criterion_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(confirmed_evaluation_criterion_ids) = 'array');

create or replace function public.reset_scorecard_issue_confirmations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.content_revision is distinct from old.content_revision then
    new.confirmed_job_description_issue_keys := '[]'::jsonb;
    new.confirmed_evaluation_criterion_ids := '[]'::jsonb;
  end if;
  return new;
end;
$$;

create trigger reset_scorecard_issue_confirmations_on_content_change
before update of content_revision on public.scorecard_versions
for each row execute function public.reset_scorecard_issue_confirmations();

create or replace function public.confirm_scorecard_issue(
  target_scorecard_version_id uuid,
  expected_content_revision integer,
  issue_scope text,
  issue_key text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  target_hiring_manager_id uuid;
  target_status public.scorecard_status;
  target_content_revision integer;
  normalized_key text := trim(coalesce(issue_key, ''));
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select version.job_id, job.hiring_manager_id, version.status, version.content_revision
  into target_job_id, target_hiring_manager_id, target_status, target_content_revision
  from public.scorecard_versions version
  join public.jobs job on job.id = version.job_id
  where version.id = target_scorecard_version_id
  for update of version, job;

  if not found then
    raise exception 'scorecard version not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (actor_role = 'HIRING_MANAGER'::public.app_role and target_hiring_manager_id = actor) then
    raise exception 'not authorized to confirm scorecard issue' using errcode = '42501';
  end if;
  if target_status <> 'DRAFT'::public.scorecard_status then
    raise exception 'only draft scorecard issues can be confirmed' using errcode = '55000';
  end if;
  if target_content_revision is distinct from expected_content_revision then
    raise exception 'scorecard changed; reload before confirming' using errcode = '40001';
  end if;

  if issue_scope = 'JOB_DESCRIPTION' then
    if normalized_key !~ '^[0-9]+$'
       or normalized_key::integer >= jsonb_array_length(
         (select ambiguous_phrases from public.scorecard_versions where id = target_scorecard_version_id)
       ) then
      raise exception 'job description issue not found' using errcode = 'P0002';
    end if;
    update public.scorecard_versions
    set confirmed_job_description_issue_keys =
      confirmed_job_description_issue_keys || jsonb_build_array(normalized_key)
    where id = target_scorecard_version_id
      and not confirmed_job_description_issue_keys ? normalized_key;
  elsif issue_scope = 'EVALUATION_CRITERION' then
    if normalized_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not exists (
         select 1 from public.criteria
         where id = normalized_key::uuid
           and scorecard_version_id = target_scorecard_version_id
           and ambiguity_status <> 'CLEAR'::public.ambiguity_status
       ) then
      raise exception 'evaluation criterion issue not found' using errcode = 'P0002';
    end if;
    update public.scorecard_versions
    set confirmed_evaluation_criterion_ids =
      confirmed_evaluation_criterion_ids || jsonb_build_array(normalized_key)
    where id = target_scorecard_version_id
      and not confirmed_evaluation_criterion_ids ? normalized_key;
  else
    raise exception 'invalid issue scope' using errcode = '22023';
  end if;

  insert into public.audit_events (
    event_type, actor_type, actor_id, aggregate_type, aggregate_id,
    correlation_id, safe_metadata, before_data, after_data, reason,
    source, result, version_ref
  ) values (
    'SCORECARD_ISSUE_CONFIRMED', 'USER', actor, 'job', target_job_id,
    gen_random_uuid(),
    jsonb_build_object('actor_role', actor_role::text, 'issue_scope', issue_scope,
      'issue_key', normalized_key),
    null, jsonb_build_object('confirmed', true), null,
    'scorecard_issue_confirmation', 'SUCCESS', target_scorecard_version_id::text
  );
end;
$$;

revoke execute on function public.confirm_scorecard_issue(uuid, integer, text, text)
from public, anon;
grant execute on function public.confirm_scorecard_issue(uuid, integer, text, text)
to authenticated;

create or replace function public.approve_scorecard(
  target_scorecard_version_id uuid,
  expected_version_number integer,
  expected_status public.scorecard_status,
  expected_content_revision integer,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  target_version_number integer;
  target_status public.scorecard_status;
  target_content_revision integer;
  assigned_hiring_manager_id uuid;
  prior_approved_version_id uuid;
  prior_approved_status public.scorecard_status;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = actor;
  select scorecard.job_id, scorecard.version_number, scorecard.status,
         scorecard.content_revision, job.hiring_manager_id
  into target_job_id, target_version_number, target_status,
       target_content_revision, assigned_hiring_manager_id
  from public.scorecard_versions scorecard
  join public.jobs job on job.id = scorecard.job_id
  where scorecard.id = target_scorecard_version_id
  for update of scorecard, job;

  if not found then
    raise exception 'scorecard version not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (actor_role = 'HIRING_MANAGER'::public.app_role and assigned_hiring_manager_id = actor) then
    raise exception 'not authorized to approve scorecard' using errcode = '42501';
  end if;
  if target_version_number is distinct from expected_version_number
     or target_status is distinct from expected_status
     or target_content_revision is distinct from expected_content_revision then
    raise exception 'scorecard changed; reload before approving' using errcode = '40001';
  end if;
  if target_status <> 'DRAFT'::public.scorecard_status then
    raise exception 'only draft scorecards can be approved' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.scorecard_versions version,
         jsonb_array_elements(version.ambiguous_phrases) with ordinality entries(item, ordinal)
    where version.id = target_scorecard_version_id
      and entries.item->>'ambiguity_status' <> 'CLEAR'
      and not (version.confirmed_job_description_issue_keys ? ((entries.ordinal - 1)::text))
  ) then
    raise exception 'job description issues must be confirmed before approval' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.criteria criterion
    join public.scorecard_versions version on version.id = criterion.scorecard_version_id
    where version.id = target_scorecard_version_id
      and criterion.ambiguity_status <> 'CLEAR'::public.ambiguity_status
      and not (version.confirmed_evaluation_criterion_ids ? criterion.id::text)
  ) then
    raise exception 'evaluation criterion issues must be confirmed before approval' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.criteria criterion
    where criterion.scorecard_version_id = target_scorecard_version_id
      and criterion.ambiguity_status = 'HUMAN_ONLY'::public.ambiguity_status
      and (criterion.type <> 'INTERVIEW_ONLY'::public.criterion_type or criterion.resume_assessable)
  ) then
    raise exception 'HUMAN_ONLY criteria must be INTERVIEW_ONLY and not resume-assessable'
      using errcode = '22023';
  end if;

  select id, status into prior_approved_version_id, prior_approved_status
  from public.scorecard_versions
  where job_id = target_job_id and status = 'APPROVED'::public.scorecard_status
  for update;
  if prior_approved_version_id is not null then
    update public.scorecard_versions set status = 'SUPERSEDED'::public.scorecard_status
    where id = prior_approved_version_id;
  end if;
  update public.scorecard_versions
  set status = 'APPROVED'::public.scorecard_status, approved_by = actor, approved_at = now()
  where id = target_scorecard_version_id;
  update public.jobs set status = 'READY_FOR_INTAKE'::public.job_status where id = target_job_id;

  insert into public.audit_events (
    event_type, actor_type, actor_id, aggregate_type, aggregate_id,
    correlation_id, safe_metadata, before_data, after_data, reason,
    source, result, version_ref
  ) values (
    'SCORECARD_APPROVED', 'USER', actor, 'job', target_job_id, gen_random_uuid(),
    jsonb_build_object('actor_role', actor_role::text,
      'target_version_id', target_scorecard_version_id,
      'target_version_number', target_version_number,
      'content_revision', target_content_revision,
      'prior_approved_version_id', prior_approved_version_id),
    jsonb_build_object('target_version_id', target_scorecard_version_id,
      'target_status', target_status::text, 'active_version_id', prior_approved_version_id,
      'active_status', prior_approved_status::text),
    jsonb_build_object('approved_version_id', target_scorecard_version_id,
      'approved_status', 'APPROVED', 'superseded_version_id', prior_approved_version_id,
      'superseded_status', case when prior_approved_version_id is null then null else 'SUPERSEDED' end,
      'job_status', 'READY_FOR_INTAKE'),
    null, 'scorecard_approval', 'SUCCESS', target_scorecard_version_id::text
  );
end;
$$;

revoke execute on function public.approve_scorecard(
  uuid, integer, public.scorecard_status, integer, text
) from public, anon;
grant execute on function public.approve_scorecard(
  uuid, integer, public.scorecard_status, integer, text
) to authenticated;

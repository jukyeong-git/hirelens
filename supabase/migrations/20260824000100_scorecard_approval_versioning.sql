-- HL-023: human scorecard approval, immutable approved history, and revisions.
-- Rollback note: approval and revision audit events are append-only. If this
-- contract needs correction, revoke the RPCs and apply a forward migration;
-- do not delete approval history or mutate approved scorecards.

do $$
declare
  approval_constraint_name name;
begin
  select constraint_row.conname
  into approval_constraint_name
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.scorecard_versions'::regclass
    and constraint_row.contype = 'c'
    and pg_get_constraintdef(constraint_row.oid) like '%approved_by%'
    and pg_get_constraintdef(constraint_row.oid) like '%approved_at%'
  limit 1;

  if approval_constraint_name is null then
    raise exception 'scorecard approval metadata constraint not found';
  end if;

  execute format(
    'alter table public.scorecard_versions drop constraint %I',
    approval_constraint_name
  );
end;
$$;

alter table public.scorecard_versions
  add constraint scorecard_versions_approval_metadata_check check (
    (
      status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)
      and approved_by is not null
      and approved_at is not null
    )
    or (
      status not in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)
      and approved_by is null
      and approved_at is null
    )
  );

alter table public.scorecard_versions
  add column content_revision integer not null default 1
  check (content_revision > 0);

create unique index scorecard_versions_one_approved_per_job_idx
  on public.scorecard_versions (job_id)
  where status = 'APPROVED'::public.scorecard_status;

create unique index scorecard_versions_one_working_per_job_idx
  on public.scorecard_versions (job_id)
  where status in (
    'DRAFT'::public.scorecard_status,
    'PENDING_APPROVAL'::public.scorecard_status
  );

create or replace function public.protect_immutable_scorecard_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status) then
      raise exception 'approved scorecard versions are immutable' using errcode = '55000';
    end if;
    return old;
  end if;

  if old.status = 'SUPERSEDED'::public.scorecard_status then
    raise exception 'superseded scorecard versions are immutable' using errcode = '55000';
  end if;

  if old.status = 'APPROVED'::public.scorecard_status then
    if new.status <> 'SUPERSEDED'::public.scorecard_status
       or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'approved scorecard versions are immutable' using errcode = '55000';
    end if;
    return new;
  end if;

  if new.status = 'SUPERSEDED'::public.scorecard_status then
    raise exception 'only an approved scorecard can be superseded' using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger scorecard_versions_protect_immutable
before update or delete on public.scorecard_versions
for each row execute function public.protect_immutable_scorecard_version();

create or replace function public.protect_immutable_scorecard_criterion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_parent_status public.scorecard_status;
  target_parent_status public.scorecard_status;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into source_parent_status
    from public.scorecard_versions
    where id = old.scorecard_version_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select status into target_parent_status
    from public.scorecard_versions
    where id = new.scorecard_version_id;
  end if;

  if source_parent_status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)
     or target_parent_status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status) then
    raise exception 'approved scorecard criteria are immutable' using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger criteria_protect_immutable
before insert or update or delete on public.criteria
for each row execute function public.protect_immutable_scorecard_criterion();

create or replace function public.increment_scorecard_content_revision()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_id uuid := case when tg_op = 'DELETE' then old.scorecard_version_id else new.scorecard_version_id end;
begin
  update public.scorecard_versions
  set content_revision = content_revision + 1
  where id = parent_id
    and status in ('DRAFT'::public.scorecard_status, 'PENDING_APPROVAL'::public.scorecard_status);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger criteria_increment_scorecard_content_revision
after insert or update or delete on public.criteria
for each row execute function public.increment_scorecard_content_revision();

create or replace function public.protect_job_scorecard_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status and current_user <> 'postgres' then
    raise exception 'job scorecard status changes require a controlled workflow'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger jobs_protect_scorecard_status_transition
before update of status on public.jobs
for each row execute function public.protect_job_scorecard_status_transition();

alter function public.create_scorecard_draft(uuid, text, text, text, text, jsonb, jsonb)
  rename to create_initial_scorecard_draft_internal;

revoke execute on function public.create_initial_scorecard_draft_internal(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;

create function public.create_scorecard_draft(
  target_job_id uuid,
  source_job_description_hash text,
  prompt_version text,
  schema_version text,
  model_id text,
  ambiguous_phrases jsonb,
  draft_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_recruiter_id uuid;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select recruiter_id into target_recruiter_id
  from public.jobs
  where id = target_job_id
  for update;

  if target_recruiter_id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'RECRUITER'::public.app_role
       and target_recruiter_id = actor
     ) then
    raise exception 'not authorized to create scorecard draft' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.scorecard_versions where job_id = target_job_id
  ) then
    raise exception 'initial scorecard draft already exists' using errcode = '55000';
  end if;

  return public.create_initial_scorecard_draft_internal(
    target_job_id,
    source_job_description_hash,
    prompt_version,
    schema_version,
    model_id,
    ambiguous_phrases,
    draft_criteria
  );
end;
$$;

revoke execute on function public.create_scorecard_draft(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon;

grant execute on function public.create_scorecard_draft(
  uuid, text, text, text, text, jsonb, jsonb
) to authenticated;

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
  normalized_reason text := trim(coalesce(reason, ''));
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role
  from public.profiles
  where id = actor;

  select
    scorecard.job_id,
    scorecard.version_number,
    scorecard.status,
    scorecard.content_revision,
    job.hiring_manager_id
  into
    target_job_id,
    target_version_number,
    target_status,
    target_content_revision,
    assigned_hiring_manager_id
  from public.scorecard_versions scorecard
  join public.jobs job on job.id = scorecard.job_id
  where scorecard.id = target_scorecard_version_id
  for update of scorecard, job;

  if not found then
    raise exception 'scorecard version not found' using errcode = 'P0002';
  end if;

  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and assigned_hiring_manager_id = actor
     ) then
    raise exception 'not authorized to approve scorecard' using errcode = '42501';
  end if;

  if normalized_reason = '' then
    raise exception 'approval reason is required' using errcode = '22023';
  end if;

  if length(normalized_reason) > 1000 then
    raise exception 'approval reason is too long' using errcode = '22023';
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
    from public.criteria criterion
    where criterion.scorecard_version_id = target_scorecard_version_id
      and criterion.ambiguity_status = 'AMBIGUOUS'::public.ambiguity_status
  ) then
    raise exception 'ambiguous criteria must be resolved before approval' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.criteria criterion
    where criterion.scorecard_version_id = target_scorecard_version_id
      and criterion.ambiguity_status = 'HUMAN_ONLY'::public.ambiguity_status
      and (
        criterion.type <> 'INTERVIEW_ONLY'::public.criterion_type
        or criterion.resume_assessable
      )
  ) then
    raise exception 'HUMAN_ONLY criteria must be INTERVIEW_ONLY and not resume-assessable'
      using errcode = '22023';
  end if;

  select id, status
  into prior_approved_version_id, prior_approved_status
  from public.scorecard_versions
  where job_id = target_job_id
    and status = 'APPROVED'::public.scorecard_status
  for update;

  if prior_approved_version_id is not null then
    update public.scorecard_versions
    set status = 'SUPERSEDED'::public.scorecard_status
    where id = prior_approved_version_id;
  end if;

  update public.scorecard_versions
  set status = 'APPROVED'::public.scorecard_status,
      approved_by = actor,
      approved_at = now()
  where id = target_scorecard_version_id;

  update public.jobs
  set status = 'READY_FOR_INTAKE'::public.job_status
  where id = target_job_id;

  insert into public.audit_events (
    event_type,
    actor_type,
    actor_id,
    aggregate_type,
    aggregate_id,
    correlation_id,
    safe_metadata,
    before_data,
    after_data,
    reason,
    source,
    result,
    version_ref
  )
  values (
    'SCORECARD_APPROVED',
    'USER',
    actor,
    'job',
    target_job_id,
    gen_random_uuid(),
    jsonb_build_object(
      'actor_role', actor_role::text,
      'target_version_id', target_scorecard_version_id,
      'target_version_number', target_version_number,
      'content_revision', target_content_revision,
      'prior_approved_version_id', prior_approved_version_id
    ),
    jsonb_build_object(
      'target_version_id', target_scorecard_version_id,
      'target_status', target_status::text,
      'active_version_id', prior_approved_version_id,
      'active_status', prior_approved_status::text
    ),
    jsonb_build_object(
      'approved_version_id', target_scorecard_version_id,
      'approved_status', 'APPROVED',
      'superseded_version_id', prior_approved_version_id,
      'superseded_status', case when prior_approved_version_id is null then null else 'SUPERSEDED' end,
      'job_status', 'READY_FOR_INTAKE'
    ),
    normalized_reason,
    'scorecard_approval',
    'SUCCESS',
    target_scorecard_version_id::text
  );
end;
$$;

create or replace function public.create_scorecard_revision(
  source_scorecard_version_id uuid,
  expected_version_number integer,
  expected_status public.scorecard_status,
  reason text
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
  source_version_number integer;
  source_status public.scorecard_status;
  assigned_hiring_manager_id uuid;
  next_version_number integer;
  revision_id uuid;
  normalized_reason text := trim(coalesce(reason, ''));
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role
  from public.profiles
  where id = actor;

  select
    scorecard.job_id,
    scorecard.version_number,
    scorecard.status,
    job.hiring_manager_id
  into
    target_job_id,
    source_version_number,
    source_status,
    assigned_hiring_manager_id
  from public.scorecard_versions scorecard
  join public.jobs job on job.id = scorecard.job_id
  where scorecard.id = source_scorecard_version_id
  for update of scorecard, job;

  if not found then
    raise exception 'scorecard version not found' using errcode = 'P0002';
  end if;

  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and assigned_hiring_manager_id = actor
     ) then
    raise exception 'not authorized to create scorecard revision' using errcode = '42501';
  end if;

  if normalized_reason = '' then
    raise exception 'revision reason is required' using errcode = '22023';
  end if;

  if length(normalized_reason) > 1000 then
    raise exception 'revision reason is too long' using errcode = '22023';
  end if;

  if source_version_number is distinct from expected_version_number
     or source_status is distinct from expected_status then
    raise exception 'scorecard changed; reload before creating a revision' using errcode = '40001';
  end if;

  if source_status <> 'APPROVED'::public.scorecard_status then
    raise exception 'only the approved scorecard can be revised' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.scorecard_versions
    where job_id = target_job_id
      and status = 'DRAFT'::public.scorecard_status
  ) then
    raise exception 'a draft scorecard revision already exists' using errcode = '23505';
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version_number
  from public.scorecard_versions
  where job_id = target_job_id;

  insert into public.scorecard_versions (
    job_id,
    version_number,
    status,
    source_job_description_hash,
    prompt_version,
    schema_version,
    model_id,
    ambiguous_phrases,
    created_by
  )
  select
    job_id,
    next_version_number,
    'DRAFT'::public.scorecard_status,
    source_job_description_hash,
    prompt_version,
    schema_version,
    model_id,
    ambiguous_phrases,
    actor
  from public.scorecard_versions
  where id = source_scorecard_version_id
  returning id into revision_id;

  insert into public.criteria (
    scorecard_version_id,
    client_id,
    name,
    type,
    definition,
    accepted_evidence,
    alternative_evidence,
    resume_assessable,
    evidence_fields,
    source_phrase,
    ambiguity_note,
    ambiguity_status,
    suggested_interview_question,
    display_order
  )
  select
    revision_id,
    client_id,
    name,
    type,
    definition,
    accepted_evidence,
    alternative_evidence,
    resume_assessable,
    evidence_fields,
    source_phrase,
    ambiguity_note,
    ambiguity_status,
    suggested_interview_question,
    display_order
  from public.criteria
  where scorecard_version_id = source_scorecard_version_id;

  insert into public.audit_events (
    event_type,
    actor_type,
    actor_id,
    aggregate_type,
    aggregate_id,
    correlation_id,
    safe_metadata,
    before_data,
    after_data,
    reason,
    source,
    result,
    version_ref
  )
  values (
    'SCORECARD_REVISION_CREATED',
    'USER',
    actor,
    'job',
    target_job_id,
    gen_random_uuid(),
    jsonb_build_object(
      'actor_role', actor_role::text,
      'source_version_id', source_scorecard_version_id,
      'revision_version_id', revision_id,
      'source_version_number', source_version_number,
      'revision_version_number', next_version_number
    ),
    jsonb_build_object(
      'source_version_id', source_scorecard_version_id,
      'source_status', source_status::text
    ),
    jsonb_build_object(
      'source_version_id', source_scorecard_version_id,
      'source_status', source_status::text,
      'revision_version_id', revision_id,
      'revision_status', 'DRAFT'
    ),
    normalized_reason,
    'scorecard_revision',
    'SUCCESS',
    revision_id::text
  );

  return revision_id;
end;
$$;

revoke execute on function public.approve_scorecard(
  uuid,
  integer,
  public.scorecard_status,
  integer,
  text
) from public, anon;

revoke execute on function public.create_scorecard_revision(
  uuid,
  integer,
  public.scorecard_status,
  text
) from public, anon;

grant execute on function public.approve_scorecard(
  uuid,
  integer,
  public.scorecard_status,
  integer,
  text
) to authenticated;

grant execute on function public.create_scorecard_revision(
  uuid,
  integer,
  public.scorecard_status,
  text
) to authenticated;

revoke insert, update, delete on public.scorecard_versions, public.criteria
from anon, authenticated;

revoke create on schema public from public, anon, authenticated;

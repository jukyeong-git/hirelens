-- Preserve the Hiring Manager's internal hiring rationale without sending it
-- to the job-description drafting model or copying free text into audit data.
-- Rollback note: retain this business record; use a forward migration to
-- deprecate or redact it according to an approved retention policy.

alter table public.jobs
  add column hiring_need text not null default ''
  check (char_length(hiring_need) <= 4000);

comment on column public.jobs.hiring_need is
  'Human-authored internal hiring rationale and additional request; never sent to the job-description drafting model.';

create or replace function public.write_job_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  before_data jsonb;
  after_data jsonb;
begin
  if tg_op = 'UPDATE' then
    before_data := jsonb_build_object(
      'status', old.status::text,
      'recruiter_id', old.recruiter_id,
      'hiring_manager_id', old.hiring_manager_id,
      'has_hiring_need', length(trim(old.hiring_need)) > 0
    );
  end if;

  after_data := jsonb_build_object(
    'status', new.status::text,
    'recruiter_id', new.recruiter_id,
    'hiring_manager_id', new.hiring_manager_id,
    'has_hiring_need', length(trim(new.hiring_need)) > 0
  );

  insert into public.audit_events (
    event_type,
    actor_type,
    actor_id,
    aggregate_type,
    aggregate_id,
    safe_metadata,
    before_data,
    after_data,
    source,
    result
  )
  values (
    case when tg_op = 'INSERT' then 'JOB_CREATED' else 'JOB_UPDATED' end,
    case when actor is null then 'SYSTEM' else 'USER' end,
    actor,
    'job',
    new.id,
    jsonb_build_object(
      'title', new.title,
      'department', new.department,
      'has_hiring_need', length(trim(new.hiring_need)) > 0
    ),
    before_data,
    after_data,
    'database_trigger',
    'SUCCESS'
  );

  return new;
end;
$$;

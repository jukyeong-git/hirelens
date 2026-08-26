-- Let an assigned Hiring Manager or Admin edit requisition basic information
-- before intake begins. Raw descriptions stay out of audit payloads. A changed
-- description invalidates its prior ambiguity confirmations and advances the
-- draft Review Framework revision. Rollback requires a forward migration that
-- revokes and drops update_job_basic_info.

create or replace function public.update_job_basic_info(
  target_job_id uuid,
  expected_updated_at timestamptz,
  updated_title text,
  updated_department text,
  updated_hiring_need text,
  updated_job_description text,
  updated_recruiter_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  job_row public.jobs%rowtype;
  description_changed boolean;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and job_row.hiring_manager_id = actor
     ) then
    raise exception 'not authorized to update job basic info' using errcode = '42501';
  end if;
  if job_row.updated_at is distinct from expected_updated_at then
    raise exception 'job changed; reload before updating' using errcode = '40001';
  end if;
  if job_row.status in ('READY_FOR_INTAKE'::public.job_status, 'ARCHIVED'::public.job_status)
     or exists (
       select 1 from public.scorecard_versions
       where job_id = target_job_id and status = 'APPROVED'::public.scorecard_status
     ) then
    raise exception 'job basic info is immutable after hiring request' using errcode = '55000';
  end if;
  if length(trim(coalesce(updated_title, ''))) not between 1 and 120
     or length(trim(coalesce(updated_department, ''))) not between 1 and 120
     or length(trim(coalesce(updated_hiring_need, ''))) not between 1 and 4000
     or length(trim(coalesce(updated_job_description, ''))) not between 1 and 20000 then
    raise exception 'invalid job basic info' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = updated_recruiter_id and role = 'RECRUITER'::public.app_role
  ) then
    raise exception 'invalid recruiter' using errcode = '22023';
  end if;

  description_changed := job_row.raw_job_description is distinct from trim(updated_job_description);

  update public.jobs
  set title = trim(updated_title),
      department = trim(updated_department),
      hiring_need = trim(updated_hiring_need),
      raw_job_description = trim(updated_job_description),
      recruiter_id = updated_recruiter_id
  where id = target_job_id;

  if description_changed then
    update public.scorecard_versions
    set source_job_description_hash = encode(
          extensions.digest(trim(updated_job_description), 'sha256'),
          'hex'
        ),
        ambiguous_phrases = '[]'::jsonb,
        content_revision = content_revision + 1
    where job_id = target_job_id
      and status = 'DRAFT'::public.scorecard_status;
  end if;
end;
$$;

revoke execute on function public.update_job_basic_info(
  uuid, timestamptz, text, text, text, text, uuid
) from public, anon;
grant execute on function public.update_job_basic_info(
  uuid, timestamptz, text, text, text, text, uuid
) to authenticated;

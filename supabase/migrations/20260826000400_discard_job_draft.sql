-- Preserve audit history while removing an unused draft from active workflows.
-- The UI calls this operation "delete"; the database records it as ARCHIVED.

create or replace function public.discard_job_draft(
  target_job_id uuid,
  expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  job_row public.jobs%rowtype;
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
    raise exception 'not authorized to discard job draft' using errcode = '42501';
  end if;
  if job_row.updated_at is distinct from expected_updated_at then
    raise exception 'job changed; reload before discarding' using errcode = '40001';
  end if;
  if job_row.requisition_status <> 'DRAFT'::public.requisition_status
     or job_row.status not in (
       'DRAFT'::public.job_status,
       'SCORECARD_PENDING_APPROVAL'::public.job_status
     ) then
    raise exception 'only an unsubmitted draft can be discarded' using errcode = '55000';
  end if;
  if exists (select 1 from public.applications where job_id = target_job_id)
     or exists (select 1 from public.job_postings where job_id = target_job_id) then
    raise exception 'job with posting or applications cannot be discarded' using errcode = '55000';
  end if;

  update public.jobs
  set status = 'ARCHIVED'::public.job_status
  where id = target_job_id;

  insert into public.audit_events (
    event_type, actor_type, actor_id, aggregate_type, aggregate_id,
    safe_metadata, before_data, after_data, source, result
  ) values (
    'JOB_DRAFT_DISCARDED', 'USER', actor, 'job', target_job_id,
    jsonb_build_object('actor_role', actor_role::text),
    jsonb_build_object(
      'status', job_row.status::text,
      'requisition_status', job_row.requisition_status::text
    ),
    jsonb_build_object(
      'status', 'ARCHIVED',
      'requisition_status', job_row.requisition_status::text
    ),
    'discard_job_draft', 'SUCCESS'
  );
end;
$$;

revoke execute on function public.discard_job_draft(uuid, timestamptz) from public, anon;
grant execute on function public.discard_job_draft(uuid, timestamptz) to authenticated;

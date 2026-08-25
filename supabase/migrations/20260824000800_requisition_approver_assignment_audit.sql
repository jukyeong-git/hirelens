-- HL-025: retain who designated each business approver without exposing
-- candidate or scorecard data to the approver role.
-- Rollback note: audit rows and history are append-only. Correct with a
-- forward migration only; do not delete retained accountability records.

create or replace function public.assign_requisition_approver(target_job_id uuid, target_approver_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  job_row public.jobs%rowtype;
  actor_role public.app_role;
  approver_role public.app_role;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role <> 'HIRING_MANAGER'::public.app_role or job_row.hiring_manager_id <> actor then
    raise exception 'only the assigned hiring manager can assign a requisition approver' using errcode = '42501';
  end if;
  if job_row.requisition_status not in ('DRAFT'::public.requisition_status, 'RETURNED'::public.requisition_status) then
    raise exception 'requisition approver can only change in DRAFT or RETURNED' using errcode = '55000';
  end if;
  if target_approver_id = actor then
    raise exception 'self approval is prohibited' using errcode = '42501';
  end if;
  select role into approver_role from public.profiles where id = target_approver_id;
  if approver_role is distinct from 'REQUISITION_APPROVER'::public.app_role then
    raise exception 'designated user must be a requisition approver' using errcode = '22023';
  end if;

  update public.jobs set requisition_approver_id = target_approver_id where id = job_row.id;
  perform public.append_safe_audit(
    'REQUISITION_APPROVER_ASSIGNED',
    'job',
    job_row.id,
    jsonb_build_object('prior_approver_id', job_row.requisition_approver_id, 'new_approver_id', target_approver_id),
    jsonb_build_object('requisition_approver_id', job_row.requisition_approver_id),
    jsonb_build_object('requisition_approver_id', target_approver_id),
    null,
    'requisition_approval'
  );
end;
$$;

drop policy requisition_status_history_select_visible_job on public.requisition_status_history;

create policy requisition_status_history_select_visible_job on public.requisition_status_history
for select to authenticated
using (
  public.is_admin()
  or actor_id = auth.uid()
  or exists (
    select 1
    from public.jobs job
    where job.id = requisition_status_history.job_id
      and (
        job.recruiter_id = auth.uid()
        or job.hiring_manager_id = auth.uid()
        or job.requisition_approver_id = auth.uid()
      )
  )
);

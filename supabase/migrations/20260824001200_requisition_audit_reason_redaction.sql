-- HL-026 security correction: a free-text approval reason belongs only to the
-- business status history. Safe audit events retain the state transition but
-- must not copy arbitrary text into immutable audit storage.

create or replace function public.resolve_requisition_approval(
  target_job_id uuid,
  target_status public.requisition_status,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  job_row public.jobs%rowtype;
  actor_role public.app_role;
  normalized_reason text := trim(coalesce(decision_reason, ''));
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if job_row.hiring_manager_id = actor then
    raise exception 'self approval is prohibited' using errcode = '42501';
  end if;
  if actor_role <> 'REQUISITION_APPROVER'::public.app_role or job_row.requisition_approver_id <> actor then
    raise exception 'only the designated requisition approver can resolve a requisition' using errcode = '42501';
  end if;
  if job_row.requisition_status <> 'PENDING_APPROVAL'::public.requisition_status then
    raise exception 'only pending requisitions can be approved or returned' using errcode = '55000';
  end if;
  if target_status not in ('APPROVED'::public.requisition_status, 'RETURNED'::public.requisition_status) then
    raise exception 'requisition resolution must be APPROVED or RETURNED' using errcode = '22023';
  end if;
  if normalized_reason = '' or length(normalized_reason) > 1000 then
    raise exception 'approval or return reason is required and must be at most 1000 characters' using errcode = '22023';
  end if;

  update public.jobs
  set requisition_status = target_status,
      approval_reason = normalized_reason,
      approved_or_returned_at = now()
  where id = job_row.id;
  insert into public.requisition_status_history (job_id, actor_id, actor_role, prior_status, new_status, reason)
  values (job_row.id, actor, actor_role, job_row.requisition_status, target_status, normalized_reason);
  perform public.append_safe_audit(
    case when target_status = 'APPROVED'::public.requisition_status
      then 'REQUISITION_APPROVED' else 'REQUISITION_RETURNED' end,
    'job', job_row.id,
    jsonb_build_object('prior_status', job_row.requisition_status, 'new_status', target_status),
    jsonb_build_object('requisition_status', job_row.requisition_status),
    jsonb_build_object('requisition_status', target_status),
    null, 'requisition_approval'
  );
end;
$$;

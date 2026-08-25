-- HL-024: independent requisition business approval.
-- Rollback note: requisition history is append-only. Correct this contract with
-- a forward migration; do not delete or rewrite approval records.

create type public.requisition_status as enum ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RETURNED');

alter table public.jobs
  add column requisition_status public.requisition_status not null default 'DRAFT',
  add column requisition_approver_id uuid references public.profiles (id) on delete restrict,
  add column submitted_at timestamptz,
  add column approval_reason text,
  add column approved_or_returned_at timestamptz,
  add constraint jobs_requisition_approval_metadata_check check (
    (
      requisition_status = 'DRAFT'::public.requisition_status
      and submitted_at is null
      and approval_reason is null
      and approved_or_returned_at is null
    )
    or (
      requisition_status = 'PENDING_APPROVAL'::public.requisition_status
      and requisition_approver_id is not null
      and submitted_at is not null
      and approval_reason is null
      and approved_or_returned_at is null
    )
    or (
      requisition_status in ('APPROVED'::public.requisition_status, 'RETURNED'::public.requisition_status)
      and requisition_approver_id is not null
      and submitted_at is not null
      and approval_reason is not null
      and length(trim(approval_reason)) between 1 and 1000
      and approved_or_returned_at is not null
    )
  );

create index jobs_requisition_approver_status_idx
  on public.jobs (requisition_approver_id, requisition_status, updated_at desc)
  where requisition_approver_id is not null;

create table public.requisition_status_history (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  actor_role public.app_role not null,
  prior_status public.requisition_status not null,
  new_status public.requisition_status not null,
  reason text,
  created_at timestamptz not null default now(),
  check (prior_status <> new_status),
  check (
    (prior_status = 'DRAFT'::public.requisition_status and new_status = 'PENDING_APPROVAL'::public.requisition_status)
    or (prior_status = 'RETURNED'::public.requisition_status and new_status = 'PENDING_APPROVAL'::public.requisition_status)
    or (prior_status = 'PENDING_APPROVAL'::public.requisition_status and new_status = 'APPROVED'::public.requisition_status)
    or (prior_status = 'PENDING_APPROVAL'::public.requisition_status and new_status = 'RETURNED'::public.requisition_status)
  ),
  check (reason is null or length(trim(reason)) between 1 and 1000),
  check (
    (new_status in ('APPROVED'::public.requisition_status, 'RETURNED'::public.requisition_status))
    = (reason is not null)
  )
);

create index requisition_status_history_job_created_idx
  on public.requisition_status_history (job_id, created_at desc);
create index requisition_status_history_actor_created_idx
  on public.requisition_status_history (actor_id, created_at desc);

create function public.validate_requisition_approver_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approver_role public.app_role;
begin
  if new.requisition_approver_id is not null then
    select role into approver_role from public.profiles where id = new.requisition_approver_id;
    if approver_role is distinct from 'REQUISITION_APPROVER'::public.app_role then
      raise exception 'requisition_approver_id must reference a REQUISITION_APPROVER profile' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create function public.prevent_direct_requisition_workflow_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'postgres'
     and (
       old.requisition_status is distinct from new.requisition_status
       or old.requisition_approver_id is distinct from new.requisition_approver_id
       or old.submitted_at is distinct from new.submitted_at
       or old.approval_reason is distinct from new.approval_reason
       or old.approved_or_returned_at is distinct from new.approved_or_returned_at
     ) then
    raise exception 'requisition workflow fields require controlled RPCs' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.prevent_direct_requisition_workflow_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'postgres'
     and (
       new.requisition_status <> 'DRAFT'::public.requisition_status
       or new.requisition_approver_id is not null
       or new.submitted_at is not null
       or new.approval_reason is not null
       or new.approved_or_returned_at is not null
     ) then
    raise exception 'new requisitions must start as an unassigned DRAFT' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.prevent_requisition_status_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'requisition_status_history is append-only' using errcode = '55000';
end;
$$;

create trigger jobs_validate_requisition_approver
before insert or update of requisition_approver_id on public.jobs
for each row execute function public.validate_requisition_approver_assignment();

create trigger jobs_prevent_direct_requisition_workflow_update
before update on public.jobs
for each row execute function public.prevent_direct_requisition_workflow_update();

create trigger jobs_prevent_direct_requisition_workflow_insert
before insert on public.jobs
for each row execute function public.prevent_direct_requisition_workflow_insert();

create trigger requisition_status_history_prevent_update
before update on public.requisition_status_history
for each row execute function public.prevent_requisition_status_history_mutation();

create trigger requisition_status_history_prevent_delete
before delete on public.requisition_status_history
for each row execute function public.prevent_requisition_status_history_mutation();

alter table public.requisition_status_history enable row level security;

create policy jobs_select_designated_requisition_approver on public.jobs
for select to authenticated
using (requisition_approver_id = auth.uid());

create policy requisition_status_history_select_visible_job on public.requisition_status_history
for select to authenticated
using (
  public.is_admin()
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

grant select on public.requisition_status_history to authenticated;
revoke insert, update, delete on public.requisition_status_history from anon, authenticated, service_role;

create function public.assign_requisition_approver(target_job_id uuid, target_approver_id uuid)
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
end;
$$;

create function public.submit_requisition(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  job_row public.jobs%rowtype;
  actor_role public.app_role;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role <> 'HIRING_MANAGER'::public.app_role or job_row.hiring_manager_id <> actor then
    raise exception 'only the assigned hiring manager can submit a requisition' using errcode = '42501';
  end if;
  if job_row.requisition_status not in ('DRAFT'::public.requisition_status, 'RETURNED'::public.requisition_status) then
    raise exception 'only DRAFT or RETURNED requisitions can be submitted' using errcode = '55000';
  end if;
  if job_row.requisition_approver_id is null then
    raise exception 'a designated requisition approver is required before submission' using errcode = '22023';
  end if;
  update public.jobs
  set requisition_status = 'PENDING_APPROVAL'::public.requisition_status,
      submitted_at = now(), approval_reason = null, approved_or_returned_at = null
  where id = job_row.id;
  insert into public.requisition_status_history (job_id, actor_id, actor_role, prior_status, new_status)
  values (job_row.id, actor, actor_role, job_row.requisition_status, 'PENDING_APPROVAL'::public.requisition_status);
end;
$$;

create function public.resolve_requisition_approval(
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
  if actor_role <> 'REQUISITION_APPROVER'::public.app_role
     or job_row.requisition_approver_id <> actor then
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
end;
$$;

revoke all on function public.assign_requisition_approver(uuid, uuid), public.submit_requisition(uuid), public.resolve_requisition_approval(uuid, public.requisition_status, text) from public, anon, authenticated, service_role;
grant execute on function public.assign_requisition_approver(uuid, uuid), public.submit_requisition(uuid), public.resolve_requisition_approval(uuid, public.requisition_status, text) to authenticated;

-- HL-025: Hiring Manager owns requisition creation and criteria handoff.
-- Rollback note: restore the prior policy/function behavior with a forward
-- migration only; do not rewrite requisition or scorecard history.

drop policy jobs_insert_recruiter_or_admin on public.jobs;

create policy jobs_insert_assigned_hiring_manager on public.jobs
for insert to authenticated
with check (
  public.current_user_role() = 'HIRING_MANAGER'::public.app_role
  and hiring_manager_id = auth.uid()
);

create policy profiles_select_requisition_approvers_for_hiring_manager on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'HIRING_MANAGER'::public.app_role
  and role = 'REQUISITION_APPROVER'::public.app_role
);

create or replace function public.create_scorecard_draft(
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
  target_hiring_manager_id uuid;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select hiring_manager_id into target_hiring_manager_id
  from public.jobs
  where id = target_job_id
  for update;

  if target_hiring_manager_id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and target_hiring_manager_id = actor
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

create or replace function public.submit_requisition(target_job_id uuid)
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
  if not exists (
    select 1
    from public.scorecard_versions
    where job_id = job_row.id
      and status = 'APPROVED'::public.scorecard_status
  ) then
    raise exception 'an approved scorecard is required before requisition submission' using errcode = '55000';
  end if;

  update public.jobs
  set requisition_status = 'PENDING_APPROVAL'::public.requisition_status,
      submitted_at = now(), approval_reason = null, approved_or_returned_at = null
  where id = job_row.id;
  insert into public.requisition_status_history (job_id, actor_id, actor_role, prior_status, new_status)
  values (job_row.id, actor, actor_role, job_row.requisition_status, 'PENDING_APPROVAL'::public.requisition_status);
end;
$$;

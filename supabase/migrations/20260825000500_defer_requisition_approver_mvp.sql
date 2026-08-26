-- Defer the business Requisition Approver workflow from the MVP.
--
-- The requisition approval tables, enum, history, and legacy RPCs remain in
-- place for a future enterprise approval slice. The active MVP gate is the
-- human-approved Review Framework, which moves a Job to READY_FOR_INTAKE.
-- Posting therefore must not require the dormant requisition_status gate.

create or replace function public.publish_job_posting_internal(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  job_row public.jobs%rowtype;
  posting_row public.job_postings%rowtype;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not coalesce(actor_role = 'RECRUITER'::public.app_role and job_row.recruiter_id = actor, false) then
    raise exception 'only the assigned recruiter or an admin can publish a job posting' using errcode = '42501';
  end if;
  select * into posting_row from public.job_postings where job_id = job_row.id for update;
  if not found then raise exception 'job posting draft not found' using errcode = 'P0002'; end if;
  if posting_row.status <> 'DRAFT'::public.posting_status then
    raise exception 'only DRAFT postings can be published' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.scorecard_versions
    where job_id = job_row.id and status = 'APPROVED'::public.scorecard_status
  ) then
    raise exception 'an approved review framework is required before publishing' using errcode = '55000';
  end if;
  if not public.public_posting_content_is_complete(posting_row) then
    raise exception 'public posting content is incomplete' using errcode = '55000';
  end if;

  update public.job_postings
  set status = 'PUBLISHED'::public.posting_status, published_by = actor, published_at = now()
  where id = posting_row.id;
  insert into public.job_posting_status_history (
    job_posting_id, job_id, actor_id, actor_role, prior_status, new_status
  ) values (
    posting_row.id, job_row.id, actor, actor_role,
    'DRAFT'::public.posting_status, 'PUBLISHED'::public.posting_status
  );
  perform public.append_safe_audit(
    'POSTING_PUBLISHED', 'job_posting', posting_row.id,
    jsonb_build_object('job_id', job_row.id, 'prior_status', 'DRAFT', 'new_status', 'PUBLISHED'),
    jsonb_build_object('status', 'DRAFT'), jsonb_build_object('status', 'PUBLISHED'), null, 'job_posting'
  );
end;
$$;


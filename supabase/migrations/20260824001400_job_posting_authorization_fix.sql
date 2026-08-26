-- HL-027 forward security correction: SQL NULL comparisons must deny unknown
-- profiles rather than accidentally bypassing the posting operator check.
-- Rollback note: retain posting history and audit rows; correct forward only.

alter function public.create_job_posting_draft(uuid)
  rename to create_job_posting_draft_internal;
alter function public.publish_job_posting(uuid)
  rename to publish_job_posting_internal;
alter function public.close_job_posting(uuid)
  rename to close_job_posting_internal;

revoke all on function public.create_job_posting_draft_internal(uuid),
  public.publish_job_posting_internal(uuid), public.close_job_posting_internal(uuid)
from public, anon, authenticated, service_role;

create function public.create_job_posting_draft(target_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  assigned_recruiter uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select recruiter_id into assigned_recruiter from public.jobs where id = target_job_id;
  if assigned_recruiter is null then raise exception 'job not found' using errcode = 'P0002'; end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not coalesce(actor_role = 'RECRUITER'::public.app_role and assigned_recruiter = actor, false) then
    raise exception 'only the assigned recruiter or an admin can create a job posting draft' using errcode = '42501';
  end if;
  return public.create_job_posting_draft_internal(target_job_id);
end;
$$;

create function public.publish_job_posting(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  assigned_recruiter uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select recruiter_id into assigned_recruiter from public.jobs where id = target_job_id;
  if assigned_recruiter is null then raise exception 'job not found' using errcode = 'P0002'; end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not coalesce(actor_role = 'RECRUITER'::public.app_role and assigned_recruiter = actor, false) then
    raise exception 'only the assigned recruiter or an admin can publish a job posting' using errcode = '42501';
  end if;
  perform public.publish_job_posting_internal(target_job_id);
end;
$$;

create function public.close_job_posting(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  assigned_recruiter uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select recruiter_id into assigned_recruiter from public.jobs where id = target_job_id;
  if assigned_recruiter is null then raise exception 'job not found' using errcode = 'P0002'; end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not coalesce(actor_role = 'RECRUITER'::public.app_role and assigned_recruiter = actor, false) then
    raise exception 'only the assigned recruiter or an admin can close a job posting' using errcode = '42501';
  end if;
  perform public.close_job_posting_internal(target_job_id);
end;
$$;

revoke all on function public.create_job_posting_draft(uuid), public.publish_job_posting(uuid), public.close_job_posting(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.create_job_posting_draft(uuid), public.publish_job_posting(uuid), public.close_job_posting(uuid)
to authenticated;

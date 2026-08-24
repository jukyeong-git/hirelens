-- HL-028 security correction: public Career Site output is synthetic-demo only.
-- Rollback note: keep the classification and public audit rows; correct forward.

alter table public.jobs
  add column is_synthetic_demo boolean not null default false;

-- These are the repository's stable synthetic seed fixture and the existing
-- shared Alpha synthetic demo job. Do not infer synthetic status from title,
-- department, or free-text content.
update public.jobs
set is_synthetic_demo = true
where id in (
  '10000000-0000-0000-0000-000000000001'::uuid,
  '10000000-0000-0000-0000-000000000002'::uuid,
  '28cf3857-55b1-4255-be85-1fe71460ed56'::uuid
);

create or replace function public.publish_job_posting(target_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  assigned_recruiter uuid;
  synthetic_demo boolean;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select recruiter_id, is_synthetic_demo
    into assigned_recruiter, synthetic_demo
  from public.jobs
  where id = target_job_id;
  if assigned_recruiter is null then raise exception 'job not found' using errcode = 'P0002'; end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not coalesce(actor_role = 'RECRUITER'::public.app_role and assigned_recruiter = actor, false) then
    raise exception 'only the assigned recruiter or an admin can publish a job posting' using errcode = '42501';
  end if;
  if synthetic_demo is not true then
    raise exception 'only synthetic demo jobs can be published publicly' using errcode = '42501';
  end if;
  perform public.publish_job_posting_internal(target_job_id);
end;
$$;

drop function if exists public.get_public_job_posting(text);

create function public.get_public_job_posting(target_public_slug text)
returns table (
  public_slug text,
  title text,
  summary text,
  responsibilities text,
  requirements text,
  location text,
  employment_type text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    posting.public_slug,
    posting.public_title,
    posting.public_summary,
    posting.public_responsibilities,
    posting.public_requirements,
    posting.public_location,
    posting.public_employment_type
  from public.job_postings posting
  join public.jobs job on job.id = posting.job_id
  where posting.public_slug = lower(btrim(target_public_slug))
    and posting.status = 'PUBLISHED'::public.posting_status
    and job.is_synthetic_demo is true
    and public.public_posting_content_is_complete(posting);
$$;

drop function if exists public.list_public_job_postings();

create function public.list_public_job_postings()
returns table (
  public_slug text,
  title text,
  summary text,
  location text,
  employment_type text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    posting.public_slug,
    posting.public_title,
    posting.public_summary,
    posting.public_location,
    posting.public_employment_type
  from public.job_postings posting
  join public.jobs job on job.id = posting.job_id
  where posting.status = 'PUBLISHED'::public.posting_status
    and job.is_synthetic_demo is true
    and public.public_posting_content_is_complete(posting)
  order by posting.published_at desc, posting.public_slug asc;
$$;

-- Record the system-owned Alpha/demo backfill as a safe, non-PII audit event.
do $$
declare
  posting_row public.job_postings%rowtype;
begin
  for posting_row in
    select posting.*
    from public.job_postings posting
    join public.jobs job on job.id = posting.job_id
    where job.is_synthetic_demo is true
      and posting.status = 'PUBLISHED'::public.posting_status
      and posting.public_title is not null
      and not exists (
        select 1
        from public.audit_events audit
        where audit.aggregate_type = 'job_posting'
          and audit.aggregate_id = posting.id
          and audit.event_type = 'POSTING_CONTENT_BACKFILLED'
      )
  loop
    perform public.append_safe_audit(
      'POSTING_CONTENT_BACKFILLED',
      'job_posting',
      posting_row.id,
      jsonb_build_object('job_id', posting_row.job_id, 'public_slug', posting_row.public_slug),
      null,
      jsonb_build_object('content_source', 'synthetic_demo_migration'),
      null,
      'job_posting_migration'
    );
  end loop;
end;
$$;

revoke all on function public.get_public_job_posting(text),
  public.list_public_job_postings()
from public, service_role;
grant execute on function public.get_public_job_posting(text),
  public.list_public_job_postings()
to anon, authenticated;

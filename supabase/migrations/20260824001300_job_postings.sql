-- HL-027: a Job Posting is distinct from its requisition and Review Framework.
-- Rollback note: posting status history and audit events are append-only. Use a
-- forward migration to correct this contract; do not delete retained records.

create type public.posting_status as enum ('DRAFT', 'PUBLISHED', 'CLOSED');

create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete restrict,
  status public.posting_status not null default 'DRAFT',
  created_by uuid not null references public.profiles (id) on delete restrict,
  published_by uuid references public.profiles (id) on delete restrict,
  published_at timestamptz,
  closed_by uuid references public.profiles (id) on delete restrict,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_postings_status_metadata_check check (
    (status = 'DRAFT'::public.posting_status
      and published_by is null and published_at is null and closed_by is null and closed_at is null)
    or (status = 'PUBLISHED'::public.posting_status
      and published_by is not null and published_at is not null and closed_by is null and closed_at is null)
    or (status = 'CLOSED'::public.posting_status
      and published_by is not null and published_at is not null and closed_by is not null and closed_at is not null)
  )
);

create index job_postings_status_updated_at_idx
  on public.job_postings (status, updated_at desc);

create table public.job_posting_status_history (
  id uuid primary key default gen_random_uuid(),
  job_posting_id uuid not null references public.job_postings (id) on delete restrict,
  job_id uuid not null references public.jobs (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  actor_role public.app_role not null,
  prior_status public.posting_status,
  new_status public.posting_status not null,
  created_at timestamptz not null default now(),
  constraint job_posting_status_history_transition_check check (
    (prior_status is null and new_status = 'DRAFT'::public.posting_status)
    or (prior_status = 'DRAFT'::public.posting_status and new_status = 'PUBLISHED'::public.posting_status)
    or (prior_status = 'PUBLISHED'::public.posting_status and new_status = 'CLOSED'::public.posting_status)
  )
);

create index job_posting_status_history_job_created_idx
  on public.job_posting_status_history (job_id, created_at asc);

create function public.prevent_direct_job_posting_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'job postings require controlled RPCs' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create function public.prevent_job_posting_status_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'job_posting_status_history is append-only' using errcode = '55000';
end;
$$;

create trigger job_postings_set_updated_at
before update on public.job_postings
for each row execute function public.set_updated_at();

create trigger job_postings_prevent_direct_mutation
before insert or update or delete on public.job_postings
for each row execute function public.prevent_direct_job_posting_mutation();

create trigger job_posting_status_history_prevent_update
before update on public.job_posting_status_history
for each row execute function public.prevent_job_posting_status_history_mutation();

create trigger job_posting_status_history_prevent_delete
before delete on public.job_posting_status_history
for each row execute function public.prevent_job_posting_status_history_mutation();

alter table public.job_postings enable row level security;
alter table public.job_posting_status_history enable row level security;

create policy job_postings_select_internal on public.job_postings
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.jobs job
    where job.id = job_postings.job_id
      and (job.recruiter_id = auth.uid() or job.hiring_manager_id = auth.uid())
  )
);

create policy job_posting_status_history_select_internal on public.job_posting_status_history
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.jobs job
    where job.id = job_posting_status_history.job_id
      and (job.recruiter_id = auth.uid() or job.hiring_manager_id = auth.uid())
  )
);

grant select on public.job_postings, public.job_posting_status_history to authenticated;
revoke insert, update, delete on public.job_postings, public.job_posting_status_history
from anon, authenticated, service_role;

create function public.create_job_posting_draft(target_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  job_row public.jobs%rowtype;
  posting_id uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role <> 'ADMIN'::public.app_role
     and not (actor_role = 'RECRUITER'::public.app_role and job_row.recruiter_id = actor) then
    raise exception 'only the assigned recruiter or an admin can create a job posting draft' using errcode = '42501';
  end if;
  if exists (select 1 from public.job_postings where job_id = job_row.id) then
    raise exception 'a job can have only one posting' using errcode = '23505';
  end if;

  insert into public.job_postings (job_id, status, created_by)
  values (job_row.id, 'DRAFT'::public.posting_status, actor)
  returning id into posting_id;
  insert into public.job_posting_status_history (
    job_posting_id, job_id, actor_id, actor_role, prior_status, new_status
  ) values (
    posting_id, job_row.id, actor, actor_role, null, 'DRAFT'::public.posting_status
  );
  perform public.append_safe_audit(
    'POSTING_CREATED', 'job_posting', posting_id,
    jsonb_build_object('job_id', job_row.id, 'new_status', 'DRAFT'),
    null, jsonb_build_object('status', 'DRAFT'), null, 'job_posting'
  );
  return posting_id;
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
  job_row public.jobs%rowtype;
  posting_row public.job_postings%rowtype;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role <> 'ADMIN'::public.app_role
     and not (actor_role = 'RECRUITER'::public.app_role and job_row.recruiter_id = actor) then
    raise exception 'only the assigned recruiter or an admin can publish a job posting' using errcode = '42501';
  end if;
  select * into posting_row from public.job_postings where job_id = job_row.id for update;
  if not found then raise exception 'job posting draft not found' using errcode = 'P0002'; end if;
  if posting_row.status <> 'DRAFT'::public.posting_status then
    raise exception 'only DRAFT postings can be published' using errcode = '55000';
  end if;
  if job_row.requisition_status <> 'APPROVED'::public.requisition_status then
    raise exception 'an approved requisition is required before publishing' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.scorecard_versions
    where job_id = job_row.id and status = 'APPROVED'::public.scorecard_status
  ) then
    raise exception 'an approved review framework is required before publishing' using errcode = '55000';
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

create function public.close_job_posting(target_job_id uuid)
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
  if actor_role <> 'ADMIN'::public.app_role
     and not (actor_role = 'RECRUITER'::public.app_role and job_row.recruiter_id = actor) then
    raise exception 'only the assigned recruiter or an admin can close a job posting' using errcode = '42501';
  end if;
  select * into posting_row from public.job_postings where job_id = job_row.id for update;
  if not found then raise exception 'job posting not found' using errcode = 'P0002'; end if;
  if posting_row.status <> 'PUBLISHED'::public.posting_status then
    raise exception 'only PUBLISHED postings can be closed' using errcode = '55000';
  end if;

  update public.job_postings
  set status = 'CLOSED'::public.posting_status, closed_by = actor, closed_at = now()
  where id = posting_row.id;
  insert into public.job_posting_status_history (
    job_posting_id, job_id, actor_id, actor_role, prior_status, new_status
  ) values (
    posting_row.id, job_row.id, actor, actor_role,
    'PUBLISHED'::public.posting_status, 'CLOSED'::public.posting_status
  );
  perform public.append_safe_audit(
    'POSTING_CLOSED', 'job_posting', posting_row.id,
    jsonb_build_object('job_id', job_row.id, 'prior_status', 'PUBLISHED', 'new_status', 'CLOSED'),
    jsonb_build_object('status', 'PUBLISHED'), jsonb_build_object('status', 'CLOSED'), null, 'job_posting'
  );
end;
$$;

revoke all on function public.create_job_posting_draft(uuid), public.publish_job_posting(uuid), public.close_job_posting(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.create_job_posting_draft(uuid), public.publish_job_posting(uuid), public.close_job_posting(uuid)
to authenticated;

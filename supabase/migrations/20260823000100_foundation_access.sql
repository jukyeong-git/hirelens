-- HireLens Phase 1 foundation: profiles, assigned jobs, and append-only audit.
-- Rollback note: do not edit this migration after it is applied. Use a forward
-- migration for any schema or policy correction.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('ADMIN', 'RECRUITER', 'HIRING_MANAGER');
create type public.job_status as enum (
  'DRAFT',
  'SCORECARD_PENDING_APPROVAL',
  'READY_FOR_INTAKE',
  'ARCHIVED'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  role public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  department text not null check (length(trim(department)) > 0),
  raw_job_description text not null check (length(trim(raw_job_description)) > 0),
  status public.job_status not null default 'DRAFT',
  recruiter_id uuid not null references public.profiles (id),
  hiring_manager_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_type text not null check (actor_type in ('USER', 'SYSTEM')),
  actor_id uuid references public.profiles (id),
  aggregate_type text not null,
  aggregate_id uuid not null,
  correlation_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb,
  before_data jsonb,
  after_data jsonb,
  reason text,
  source text not null,
  result text not null,
  version_ref text,
  created_at timestamptz not null default now()
);

create index jobs_recruiter_id_idx on public.jobs (recruiter_id);
create index jobs_hiring_manager_id_idx on public.jobs (hiring_manager_id);
create index jobs_status_updated_at_idx on public.jobs (status, updated_at desc);
create index audit_events_aggregate_idx on public.audit_events (aggregate_type, aggregate_id, created_at);

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, auth
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.current_user_role() = 'ADMIN'::public.app_role, false)
$$;

create or replace function public.can_access_job(target_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.jobs
    where id = target_job_id
      and (
        public.is_admin()
        or recruiter_id = auth.uid()
        or hiring_manager_id = auth.uid()
      )
  )
$$;

create or replace function public.validate_job_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recruiter_role public.app_role;
  hiring_manager_role public.app_role;
begin
  select role into recruiter_role from public.profiles where id = new.recruiter_id;
  select role into hiring_manager_role from public.profiles where id = new.hiring_manager_id;

  if recruiter_role is distinct from 'RECRUITER'::public.app_role then
    raise exception 'recruiter_id must reference a RECRUITER profile';
  end if;

  if hiring_manager_role is distinct from 'HIRING_MANAGER'::public.app_role then
    raise exception 'hiring_manager_id must reference a HIRING_MANAGER profile';
  end if;

  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.write_job_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  before_data jsonb;
  after_data jsonb;
begin
  if tg_op = 'UPDATE' then
    before_data := jsonb_build_object(
      'status', old.status::text,
      'recruiter_id', old.recruiter_id,
      'hiring_manager_id', old.hiring_manager_id
    );
  end if;

  after_data := jsonb_build_object(
    'status', new.status::text,
    'recruiter_id', new.recruiter_id,
    'hiring_manager_id', new.hiring_manager_id
  );

  insert into public.audit_events (
    event_type,
    actor_type,
    actor_id,
    aggregate_type,
    aggregate_id,
    safe_metadata,
    before_data,
    after_data,
    source,
    result
  )
  values (
    case when tg_op = 'INSERT' then 'JOB_CREATED' else 'JOB_UPDATED' end,
    case when actor is null then 'SYSTEM' else 'USER' end,
    actor,
    'job',
    new.id,
    jsonb_build_object('title', new.title, 'department', new.department),
    before_data,
    after_data,
    'database_trigger',
    'SUCCESS'
  );

  return new;
end;
$$;

create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

create trigger jobs_validate_assignments
before insert or update on public.jobs
for each row execute function public.validate_job_assignments();

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create trigger jobs_write_audit
after insert or update on public.jobs
for each row execute function public.write_job_audit();

create trigger audit_events_prevent_update
before update on public.audit_events
for each row execute function public.prevent_audit_mutation();

create trigger audit_events_prevent_delete
before delete on public.audit_events
for each row execute function public.prevent_audit_mutation();

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy jobs_select_assigned on public.jobs
for select to authenticated
using (
  public.is_admin()
  or recruiter_id = auth.uid()
  or hiring_manager_id = auth.uid()
);

create policy jobs_insert_recruiter_or_admin on public.jobs
for insert to authenticated
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'RECRUITER'::public.app_role
    and recruiter_id = auth.uid()
  )
);

create policy jobs_update_recruiter_or_admin on public.jobs
for update to authenticated
using (public.is_admin() or recruiter_id = auth.uid())
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'RECRUITER'::public.app_role
    and recruiter_id = auth.uid()
  )
);

create policy audit_events_select_assigned on public.audit_events
for select to authenticated
using (
  public.is_admin()
  or (
    aggregate_type = 'job'
    and public.can_access_job(aggregate_id)
  )
);

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update on public.jobs to authenticated;
grant select on public.audit_events to authenticated;

grant all on public.profiles to service_role;
grant all on public.jobs to service_role;
grant select on public.audit_events to service_role;
revoke insert, update, delete on public.audit_events from anon, authenticated, service_role;

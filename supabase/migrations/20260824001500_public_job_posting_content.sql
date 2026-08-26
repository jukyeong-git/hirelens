-- HL-028: separate candidate-facing Job Posting content from the internal
-- requisition and expose only a narrow published projection.
-- Rollback note: public content and slug changes are intentionally forward-only
-- once used by a public URL. Retain published content and history; correct it
-- with a later migration rather than deleting public records.

alter table public.job_postings
  add column public_slug text default replace(gen_random_uuid()::text, '-', ''),
  add column public_title text,
  add column public_summary text,
  add column public_responsibilities text,
  add column public_requirements text,
  add column public_location text,
  add column public_employment_type text;

update public.job_postings
set public_slug = replace(gen_random_uuid()::text, '-', '')
where public_slug is null;

alter table public.job_postings
  alter column public_slug set not null;

create unique index job_postings_public_slug_uidx
  on public.job_postings (public_slug);

alter table public.job_postings
  add constraint job_postings_public_slug_format_check
  check (public_slug ~ '^[0-9a-f]{32}$'),
  add constraint job_postings_public_title_length_check
  check (public_title is null or char_length(btrim(public_title)) between 1 and 120),
  add constraint job_postings_public_summary_length_check
  check (public_summary is null or char_length(btrim(public_summary)) between 1 and 4000),
  add constraint job_postings_public_responsibilities_length_check
  check (public_responsibilities is null or char_length(btrim(public_responsibilities)) between 1 and 10000),
  add constraint job_postings_public_requirements_length_check
  check (public_requirements is null or char_length(btrim(public_requirements)) between 1 and 10000),
  add constraint job_postings_public_location_length_check
  check (public_location is null or char_length(btrim(public_location)) between 1 and 200),
  add constraint job_postings_public_employment_type_length_check
  check (public_employment_type is null or char_length(btrim(public_employment_type)) between 1 and 120);

create function public.prevent_job_posting_public_slug_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.public_slug is distinct from new.public_slug then
    raise exception 'public posting slug is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger job_postings_public_slug_immutable
before update on public.job_postings
for each row execute function public.prevent_job_posting_public_slug_change();

create function public.public_posting_content_is_complete(posting_row public.job_postings)
returns boolean
language sql
immutable
set search_path = public
as $$
  select posting_row.public_title is not null
    and posting_row.public_summary is not null
    and posting_row.public_responsibilities is not null
    and posting_row.public_requirements is not null
    and posting_row.public_location is not null
    and posting_row.public_employment_type is not null
    and char_length(btrim(posting_row.public_title)) > 0
    and char_length(btrim(posting_row.public_summary)) > 0
    and char_length(btrim(posting_row.public_responsibilities)) > 0
    and char_length(btrim(posting_row.public_requirements)) > 0
    and char_length(btrim(posting_row.public_location)) > 0
    and char_length(btrim(posting_row.public_employment_type)) > 0;
$$;

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
  if job_row.requisition_status <> 'APPROVED'::public.requisition_status then
    raise exception 'an approved requisition is required before publishing' using errcode = '55000';
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

create function public.update_job_posting_content(
  target_job_id uuid,
  target_public_title text,
  target_public_summary text,
  target_public_responsibilities text,
  target_public_requirements text,
  target_public_location text,
  target_public_employment_type text
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
  posting_row public.job_postings%rowtype;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not coalesce(actor_role = 'RECRUITER'::public.app_role and job_row.recruiter_id = actor, false) then
    raise exception 'only the assigned recruiter or an admin can update public posting content' using errcode = '42501';
  end if;
  select * into posting_row from public.job_postings where job_id = job_row.id for update;
  if not found then raise exception 'job posting not found' using errcode = 'P0002'; end if;
  if posting_row.status = 'CLOSED'::public.posting_status then
    raise exception 'closed postings cannot be edited' using errcode = '55000';
  end if;
  if nullif(btrim(target_public_title), '') is null
     or nullif(btrim(target_public_summary), '') is null
     or nullif(btrim(target_public_responsibilities), '') is null
     or nullif(btrim(target_public_requirements), '') is null
     or nullif(btrim(target_public_location), '') is null
     or nullif(btrim(target_public_employment_type), '') is null then
    raise exception 'public posting content is incomplete' using errcode = '22023';
  end if;
  if char_length(btrim(target_public_title)) > 120
     or char_length(btrim(target_public_summary)) > 4000
     or char_length(btrim(target_public_responsibilities)) > 10000
     or char_length(btrim(target_public_requirements)) > 10000
     or char_length(btrim(target_public_location)) > 200
     or char_length(btrim(target_public_employment_type)) > 120 then
    raise exception 'public posting content is too long' using errcode = '22023';
  end if;

  update public.job_postings
  set public_title = btrim(target_public_title),
      public_summary = btrim(target_public_summary),
      public_responsibilities = btrim(target_public_responsibilities),
      public_requirements = btrim(target_public_requirements),
      public_location = btrim(target_public_location),
      public_employment_type = btrim(target_public_employment_type)
  where id = posting_row.id;
  perform public.append_safe_audit(
    'POSTING_CONTENT_UPDATED', 'job_posting', posting_row.id,
    jsonb_build_object('job_id', job_row.id, 'public_slug', posting_row.public_slug),
    null, null, null, 'job_posting'
  );
end;
$$;

create function public.get_public_job_posting(target_public_slug text)
returns table (
  public_slug text,
  title text,
  summary text,
  responsibilities text,
  requirements text,
  location text,
  employment_type text,
  published_at timestamptz
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
    posting.public_employment_type,
    posting.published_at
  from public.job_postings posting
  where posting.public_slug = lower(btrim(target_public_slug))
    and posting.status = 'PUBLISHED'::public.posting_status;
$$;

revoke all on function public.public_posting_content_is_complete(public.job_postings)
from public, anon, authenticated, service_role;
revoke all on function public.update_job_posting_content(uuid, text, text, text, text, text, text)
from public, anon, service_role;
grant execute on function public.update_job_posting_content(uuid, text, text, text, text, text, text)
to authenticated;
revoke all on function public.get_public_job_posting(text)
from public, service_role;
grant execute on function public.get_public_job_posting(text)
to anon, authenticated;

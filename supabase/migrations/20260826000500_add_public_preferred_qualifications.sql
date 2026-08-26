-- Add candidate-facing preferred qualifications to Job Posting.
-- Rollback note: retain published content; remove only with a reviewed forward migration.

alter table public.job_postings
  add column public_preferred_qualifications text;

alter table public.job_postings
  add constraint job_postings_public_preferred_qualifications_length_check
  check (public_preferred_qualifications is null or char_length(btrim(public_preferred_qualifications)) between 1 and 10000);

-- Preserve existing synthetic postings when the new required public field is introduced.
update public.job_postings posting
set public_preferred_qualifications = coalesce(
  substring(job.raw_job_description from '우대 사항[[:space:]]*\n([\s\S]*)'),
  '관련 분야의 실무 경험이 있습니다.'
)
from public.jobs job
where job.id = posting.job_id
  and posting.public_preferred_qualifications is null;

create or replace function public.public_posting_content_is_complete(posting_row public.job_postings)
returns boolean language sql immutable set search_path = public as $$
  select posting_row.public_title is not null and posting_row.public_summary is not null
    and posting_row.public_responsibilities is not null and posting_row.public_requirements is not null
    and posting_row.public_preferred_qualifications is not null
    and posting_row.public_location is not null and posting_row.public_employment_type is not null
    and char_length(btrim(posting_row.public_title)) > 0
    and char_length(btrim(posting_row.public_summary)) > 0
    and char_length(btrim(posting_row.public_responsibilities)) > 0
    and char_length(btrim(posting_row.public_requirements)) > 0
    and char_length(btrim(posting_row.public_preferred_qualifications)) > 0
    and char_length(btrim(posting_row.public_location)) > 0
    and char_length(btrim(posting_row.public_employment_type)) > 0;
$$;

drop function if exists public.update_job_posting_content(uuid, text, text, text, text, text, text);
create function public.update_job_posting_content(
  target_job_id uuid, target_public_title text, target_public_summary text,
  target_public_responsibilities text, target_public_requirements text,
  target_public_preferred_qualifications text, target_public_location text,
  target_public_employment_type text
) returns void language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); actor_role public.app_role; job_row public.jobs%rowtype; posting_row public.job_postings%rowtype;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into job_row from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role is distinct from 'ADMIN'::public.app_role and not coalesce(actor_role = 'RECRUITER'::public.app_role and job_row.recruiter_id = actor, false) then
    raise exception 'only the assigned recruiter or an admin can update public posting content' using errcode = '42501';
  end if;
  select * into posting_row from public.job_postings where job_id = job_row.id for update;
  if not found then raise exception 'job posting not found' using errcode = 'P0002'; end if;
  if posting_row.status = 'CLOSED'::public.posting_status then raise exception 'closed postings cannot be edited' using errcode = '55000'; end if;
  if array_position(array[
    nullif(btrim(target_public_title), ''), nullif(btrim(target_public_summary), ''),
    nullif(btrim(target_public_responsibilities), ''), nullif(btrim(target_public_requirements), ''),
    nullif(btrim(target_public_preferred_qualifications), ''), nullif(btrim(target_public_location), ''),
    nullif(btrim(target_public_employment_type), '')
  ], null) is not null then raise exception 'public posting content is incomplete' using errcode = '22023'; end if;
  update public.job_postings set public_title=btrim(target_public_title), public_summary=btrim(target_public_summary),
    public_responsibilities=btrim(target_public_responsibilities), public_requirements=btrim(target_public_requirements),
    public_preferred_qualifications=btrim(target_public_preferred_qualifications), public_location=btrim(target_public_location),
    public_employment_type=btrim(target_public_employment_type) where id = posting_row.id;
  perform public.append_safe_audit('POSTING_CONTENT_UPDATED', 'job_posting', posting_row.id,
    jsonb_build_object('job_id', job_row.id, 'public_slug', posting_row.public_slug), null, null, null, 'job_posting');
end; $$;
revoke all on function public.update_job_posting_content(uuid, text, text, text, text, text, text, text) from public, anon, service_role;
grant execute on function public.update_job_posting_content(uuid, text, text, text, text, text, text, text) to authenticated;

drop function if exists public.get_public_job_posting(text);
create function public.get_public_job_posting(target_public_slug text)
returns table(public_slug text, title text, summary text, responsibilities text, requirements text, preferred_qualifications text, location text, employment_type text)
language sql security definer stable set search_path = public as $$
  select p.public_slug,p.public_title,p.public_summary,p.public_responsibilities,p.public_requirements,p.public_preferred_qualifications,p.public_location,p.public_employment_type
  from public.job_postings p join public.jobs j on j.id=p.job_id
  where p.public_slug=lower(btrim(target_public_slug)) and p.status='PUBLISHED'::public.posting_status and j.is_synthetic_demo is true and public.public_posting_content_is_complete(p);
$$;
revoke all on function public.get_public_job_posting(text) from public, service_role;
grant execute on function public.get_public_job_posting(text) to anon, authenticated;

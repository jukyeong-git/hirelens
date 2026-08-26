-- HL-028 forward correction: provide a public Career Site index and ensure
-- legacy published rows without candidate-facing content remain private.
-- Rollback note: retain public content and stable slugs; correct forward only.

create or replace function public.get_public_job_posting(target_public_slug text)
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
    and posting.status = 'PUBLISHED'::public.posting_status
    and public.public_posting_content_is_complete(posting);
$$;

create function public.list_public_job_postings()
returns table (
  public_slug text,
  title text,
  summary text,
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
    posting.public_location,
    posting.public_employment_type,
    posting.published_at
  from public.job_postings posting
  where posting.status = 'PUBLISHED'::public.posting_status
    and public.public_posting_content_is_complete(posting)
  order by posting.published_at desc, posting.public_slug asc;
$$;

revoke all on function public.list_public_job_postings()
from public, service_role;
grant execute on function public.list_public_job_postings()
to anon, authenticated;

-- The shared Alpha demo already contains a synthetic published posting from
-- HL-027. Give it explicit candidate-facing copy without exposing its internal
-- requisition description. Environments without that fixture are unchanged.
update public.job_postings posting
set public_title = 'Senior Backend Engineer',
    public_summary = 'Build reliable backend services for the synthetic HireLens demo.',
    public_responsibilities = E'Design and operate reliable backend services.\nCollaborate with product and engineering teams on maintainable systems.',
    public_requirements = E'Backend development experience with TypeScript or a comparable language.\nExperience with PostgreSQL and production service operations.',
    public_location = 'Singapore · Hybrid',
    public_employment_type = 'Full-time'
where posting.status = 'PUBLISHED'::public.posting_status
  and posting.public_title is null
  and exists (
    select 1
    from public.jobs job
    where job.id = posting.job_id
      and job.title = 'Senior Backend Engineer'
      and job.department = 'Engineering'
  );

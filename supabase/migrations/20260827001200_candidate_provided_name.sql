-- Store a candidate-provided name separately from synthetic/demo labels.
-- Forward-fix rollback: remove the RPC first, then drop candidates.full_name only
-- after confirming no submitted names must be retained.

alter table public.candidates
  add column full_name text
  check (
    full_name is null
    or (
      length(trim(full_name)) between 1 and 100
      and full_name !~ '[[:cntrl:]]'
    )
  );

create function public.create_named_public_resume_submission(
  target_public_slug text,
  candidate_name text,
  candidate_id uuid,
  application_id uuid,
  resume_file_id uuid,
  original_filename text,
  mime_type text,
  byte_size integer,
  sha256 text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_candidate_name text := trim(candidate_name);
  reserved_storage_path text;
begin
  if normalized_candidate_name = ''
    or length(normalized_candidate_name) > 100
    or normalized_candidate_name ~ '[[:cntrl:]]' then
    raise exception 'candidate name must be between 1 and 100 visible characters'
      using errcode = '22023';
  end if;

  reserved_storage_path := public.create_public_resume_submission(
    target_public_slug,
    candidate_id,
    application_id,
    resume_file_id,
    original_filename,
    mime_type,
    byte_size,
    sha256
  );

  update public.candidates
  set full_name = normalized_candidate_name
  where id = candidate_id;

  return reserved_storage_path;
end;
$$;

revoke all on function public.create_named_public_resume_submission(
  text, text, uuid, uuid, uuid, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_named_public_resume_submission(
  text, text, uuid, uuid, uuid, text, text, integer, text
) to service_role;

comment on column public.candidates.full_name is
  'Candidate-provided direct identifier; excluded from AI prompts, logs, and notification metadata.';

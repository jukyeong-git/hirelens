-- Forward fix for HL-029: the first public submission function referenced an
-- undeclared path variable during the duplicate-object check.

create or replace function public.create_public_resume_submission(
  target_public_slug text,
  candidate_id uuid,
  application_id uuid,
  resume_file_id uuid,
  original_filename text,
  mime_type text,
  byte_size integer,
  sha256 text,
  synthetic_or_anonymized_attested boolean
)
returns text
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  posting_row public.job_postings%rowtype;
  target_job_id uuid;
  approved_scorecard_count integer;
  expected_path text;
  normalized_filename text := trim(coalesce(original_filename, ''));
  normalized_sha256 text := lower(trim(coalesce(sha256, '')));
begin
  perform public.require_server_service_role();

  select posting.*
  into posting_row
  from public.job_postings posting
  join public.jobs job on job.id = posting.job_id
  where posting.public_slug = trim(coalesce(target_public_slug, ''))
    and posting.status = 'PUBLISHED'::public.posting_status
    and job.is_synthetic_demo is true
    and public.is_public_job_posting_content_complete(posting)
  for update of posting, job;

  if not found then
    raise exception 'public posting is unavailable' using errcode = 'P0002';
  end if;

  target_job_id := posting_row.job_id;
  select count(*)::integer
  into approved_scorecard_count
  from public.scorecard_versions
  where job_id = target_job_id
    and status = 'APPROVED'::public.scorecard_status;

  if approved_scorecard_count <> 1 then
    raise exception 'public posting is not intake-ready' using errcode = '55000';
  end if;

  expected_path := format('%s/%s/%s.pdf', target_job_id, application_id, resume_file_id);
  if normalized_filename = '' or length(normalized_filename) > 255 or normalized_filename !~* '\\.pdf$' then
    raise exception 'original filename must be a PDF filename' using errcode = '22023';
  end if;
  if mime_type is distinct from 'application/pdf' then
    raise exception 'resume MIME type must be application/pdf' using errcode = '22023';
  end if;
  if byte_size is null or byte_size <= 0 or byte_size > 10485760 then
    raise exception 'resume byte size must be between 1 and 10485760' using errcode = '22023';
  end if;
  if normalized_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'resume SHA-256 must be a 64-character hexadecimal digest' using errcode = '22023';
  end if;
  if synthetic_or_anonymized_attested is not true then
    raise exception 'synthetic or anonymized attestation is required' using errcode = '22023';
  end if;
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'resumes'
      and object.name = expected_path
  ) then
    raise exception 'storage object already exists for reservation path' using errcode = '55000';
  end if;

  insert into public.candidates (id, demo_label)
  values (candidate_id, 'Synthetic public submission');
  insert into public.applications (id, candidate_id, job_id, source, workflow_state)
  values (application_id, candidate_id, target_job_id, 'PUBLIC_POSTING', 'NEW');
  insert into public.resume_files (
    id, application_id, storage_path, original_filename, mime_type, byte_size,
    sha256, intake_status, synthetic_or_anonymized_attested, attested_by, attested_at
  )
  values (
    resume_file_id, application_id, expected_path, normalized_filename, mime_type,
    byte_size, normalized_sha256, 'PENDING_UPLOAD', true, null, now()
  );
  perform public.append_safe_audit(
    'PUBLIC_RESUME_SUBMISSION_RESERVED',
    'application',
    application_id,
    jsonb_build_object(
      'resume_file_id', resume_file_id,
      'mime_type', mime_type,
      'byte_size', byte_size,
      'synthetic_or_anonymized_attested', true
    ),
    null,
    null,
    null,
    'public_submission'
  );
  return expected_path;
end;
$$;

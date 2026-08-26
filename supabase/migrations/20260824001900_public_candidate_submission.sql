-- HL-029 public synthetic candidate submission. This is a server-owned path:
-- no anonymous Storage policy or direct anonymous database write is granted.
-- Roll back only with a forward migration because audit events are append-only.

alter table public.resume_files
  alter column attested_by drop not null;

create or replace function public.require_server_service_role()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'server service role required' using errcode = '42501';
  end if;
end;
$$;

create function public.create_public_resume_submission(
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
      and object.name = storage_path
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

create function public.finalize_public_resume_submission(target_resume_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, storage, pgmq
as $$
declare
  resume public.resume_files%rowtype;
  target_job_id uuid;
  stored_size bigint;
  approved_scorecard_id uuid;
  target_run_id uuid;
begin
  perform public.require_server_service_role();

  select resume_file.*
  into resume
  from public.resume_files resume_file
  where resume_file.id = target_resume_file_id
  for update;

  if not found then
    raise exception 'public submission reservation not found' using errcode = 'P0002';
  end if;
  if resume.intake_status = 'UPLOADED'::public.resume_intake_status then
    return;
  end if;
  if resume.intake_status <> 'PENDING_UPLOAD'::public.resume_intake_status then
    raise exception 'public submission upload is not pending' using errcode = '55000';
  end if;

  select application.job_id
  into target_job_id
  from public.applications application
  where application.id = resume.application_id;

  select (object.metadata ->> 'size')::bigint
  into stored_size
  from storage.objects object
  where object.bucket_id = 'resumes'
    and object.name = resume.storage_path
    and object.metadata ->> 'size' ~ '^[0-9]+$'
  for update;

  if not found or stored_size <> resume.byte_size then
    raise exception 'uploaded public resume object does not match reservation' using errcode = '22023';
  end if;

  select id
  into approved_scorecard_id
  from public.scorecard_versions
  where job_id = target_job_id
    and status = 'APPROVED'::public.scorecard_status
  for share;

  if approved_scorecard_id is null then
    raise exception 'public posting is not intake-ready' using errcode = '55000';
  end if;

  update public.resume_files
  set intake_status = 'UPLOADED'::public.resume_intake_status
  where id = resume.id;

  insert into public.processing_runs (
    application_id, resume_file_id, scorecard_version_id, pipeline_version
  )
  values (
    resume.application_id, resume.id, approved_scorecard_id, 'pdf-v1'
  )
  on conflict (application_id, resume_file_id, scorecard_version_id, pipeline_version)
  do nothing
  returning id into target_run_id;

  if target_run_id is not null then
    perform public.enqueue_resume_processing_run(target_run_id);
  end if;

  perform public.append_safe_audit(
    'PUBLIC_RESUME_SUBMISSION_ACCEPTED',
    'application',
    resume.application_id,
    jsonb_build_object(
      'resume_file_id', resume.id,
      'mime_type', resume.mime_type,
      'byte_size', resume.byte_size
    ),
    null,
    null,
    null,
    'public_submission'
  );
end;
$$;

create function public.cancel_public_resume_submission(target_resume_file_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  resume public.resume_files%rowtype;
  target_candidate_id uuid;
begin
  perform public.require_server_service_role();

  select resume_file.*
  into resume
  from public.resume_files resume_file
  where resume_file.id = target_resume_file_id
  for update;

  if not found then
    return;
  end if;
  if resume.intake_status <> 'PENDING_UPLOAD'::public.resume_intake_status then
    raise exception 'only pending public submission reservations can be cancelled' using errcode = '55000';
  end if;
  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'resumes'
      and object.name = resume.storage_path
  ) then
    raise exception 'storage object must be deleted before cancelling public submission' using errcode = '55000';
  end if;

  select candidate_id
  into target_candidate_id
  from public.applications
  where id = resume.application_id;

  delete from public.resume_files where id = resume.id;
  delete from public.applications where id = resume.application_id;
  delete from public.candidates
  where id = target_candidate_id
    and not exists (
      select 1 from public.applications application where application.candidate_id = target_candidate_id
    );

  perform public.append_safe_audit(
    'PUBLIC_RESUME_SUBMISSION_CANCELLED',
    'application',
    resume.application_id,
    jsonb_build_object('resume_file_id', resume.id),
    null,
    null,
    null,
    'public_submission'
  );
end;
$$;

revoke all on function public.require_server_service_role() from public, anon, authenticated;
revoke all on function public.create_public_resume_submission(
  text, uuid, uuid, uuid, text, text, integer, text, boolean
), public.finalize_public_resume_submission(uuid), public.cancel_public_resume_submission(uuid)
from public, anon, authenticated;
grant execute on function public.create_public_resume_submission(
  text, uuid, uuid, uuid, text, text, integer, text, boolean
), public.finalize_public_resume_submission(uuid), public.cancel_public_resume_submission(uuid)
to service_role;

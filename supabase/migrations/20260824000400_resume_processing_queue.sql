-- Phase 3 PDF extraction queue. Roll back only with a forward migration: runs and
-- extracted resume pages are durable evidence-adjacent records.

create type public.processing_run_status as enum ('QUEUED', 'EXTRACTING', 'COMPLETED', 'NEEDS_OCR', 'FAILED');
create type public.processing_error_category as enum ('PDF_INVALID', 'PDF_ENCRYPTED', 'PDF_EXTRACTION_FAILED', 'STORAGE_UNAVAILABLE', 'STORAGE_DOWNLOAD_FAILED');

create table public.processing_runs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  resume_file_id uuid not null references public.resume_files (id) on delete restrict,
  scorecard_version_id uuid not null references public.scorecard_versions (id) on delete restrict,
  pipeline_version text not null check (length(trim(pipeline_version)) between 1 and 100),
  status public.processing_run_status not null default 'QUEUED',
  attempt_count smallint not null default 0 check (attempt_count between 0 and 2),
  error_category public.processing_error_category,
  queue_message_id bigint,
  extracting_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'EXTRACTING') = (extracting_at is not null)),
  check ((status in ('COMPLETED'::public.processing_run_status, 'NEEDS_OCR'::public.processing_run_status, 'FAILED'::public.processing_run_status)) = (completed_at is not null)),
  check ((status = 'FAILED'::public.processing_run_status) = (error_category is not null)),
  unique (application_id, resume_file_id, scorecard_version_id, pipeline_version)
);
create index processing_runs_application_created_idx on public.processing_runs (application_id, created_at desc);
create index processing_runs_status_created_idx on public.processing_runs (status, created_at);

create table public.resume_pages (
  id uuid primary key default gen_random_uuid(),
  resume_file_id uuid not null references public.resume_files (id) on delete restrict,
  processing_run_id uuid not null references public.processing_runs (id) on delete restrict,
  page_number integer not null check (page_number > 0),
  raw_text text not null,
  normalized_text text not null,
  raw_text_sha256 text not null check (raw_text_sha256 ~ '^[0-9a-f]{64}$'),
  normalized_text_sha256 text not null check (normalized_text_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (processing_run_id, page_number),
  unique (resume_file_id, page_number)
);
create index resume_pages_resume_file_page_idx on public.resume_pages (resume_file_id, page_number);

alter table public.processing_runs enable row level security;
alter table public.resume_pages enable row level security;
create policy processing_runs_select_assigned on public.processing_runs for select to authenticated using (public.can_access_application(application_id));
create policy resume_pages_select_assigned on public.resume_pages for select to authenticated using (
  exists (
    select 1 from public.resume_files resume_file
    join public.applications application on application.id = resume_file.application_id
    where resume_file.id = resume_pages.resume_file_id and public.can_access_application(application.id)
  )
);
grant select on public.processing_runs, public.resume_pages to authenticated;
revoke insert, update, delete on public.processing_runs, public.resume_pages from anon, authenticated, service_role;

create function public.require_worker_service_role() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'worker service role required' using errcode = '42501';
  end if;
end;
$$;

create function public.enqueue_resume_processing_run(target_run_id uuid) returns bigint language plpgsql security definer set search_path = public, pgmq as $$
declare message_id bigint;
begin
  select pgmq.send('resume_analysis', jsonb_build_object('processing_run_id', target_run_id)) into message_id;
  update public.processing_runs set queue_message_id = message_id where id = target_run_id;
  return message_id;
end;
$$;

create or replace function public.finalize_uploaded_resume(resume_file_id uuid) returns void language plpgsql security definer set search_path = public, auth, storage, pgmq as $$
declare actor uuid := auth.uid(); actor_role public.app_role; resume public.resume_files%rowtype; target_job_id uuid; stored_size bigint; approved_scorecard_id uuid; target_run_id uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select resume_file.* into resume from public.resume_files resume_file where resume_file.id = resume_file_id for update;
  if not found then raise exception 'resume reservation not found' using errcode = 'P0002'; end if;
  select job_id into target_job_id from public.applications where id = resume.application_id;
  if actor_role is distinct from 'ADMIN'::public.app_role and not (actor_role = 'RECRUITER'::public.app_role and public.can_access_job(target_job_id)) then raise exception 'not authorized to finalize uploaded resume' using errcode = '42501'; end if;
  if resume.intake_status = 'UPLOADED'::public.resume_intake_status then return; end if;
  if resume.intake_status <> 'PENDING_UPLOAD'::public.resume_intake_status then raise exception 'resume upload is not pending' using errcode = '55000'; end if;
  select (object.metadata ->> 'size')::bigint into stored_size from storage.objects object where object.bucket_id = 'resumes' and object.name = resume.storage_path and object.metadata ->> 'size' ~ '^[0-9]+$' for update;
  if not found then raise exception 'uploaded resume object was not found with a valid byte size' using errcode = 'P0002'; end if;
  if stored_size <> resume.byte_size then raise exception 'uploaded resume object byte size does not match reservation' using errcode = '22023'; end if;
  select id into approved_scorecard_id from public.scorecard_versions where job_id = target_job_id and status = 'APPROVED'::public.scorecard_status for share;
  if approved_scorecard_id is null then raise exception 'job requires an approved scorecard' using errcode = '55000'; end if;
  update public.resume_files set intake_status = 'UPLOADED'::public.resume_intake_status where id = resume_file_id;
  insert into public.processing_runs (application_id, resume_file_id, scorecard_version_id, pipeline_version)
  values (resume.application_id, resume.id, approved_scorecard_id, 'pdf-v1')
  on conflict (application_id, resume_file_id, scorecard_version_id, pipeline_version) do nothing
  returning id into target_run_id;
  if target_run_id is not null then perform public.enqueue_resume_processing_run(target_run_id); end if;
  perform public.append_safe_audit('RESUME_UPLOADED', 'application', resume.application_id, jsonb_build_object('resume_file_id', resume.id, 'mime_type', resume.mime_type, 'byte_size', resume.byte_size, 'sha256', resume.sha256), null, null, null, 'resume_intake');
end;
$$;

create function public.claim_resume_extraction_run(target_processing_run_id uuid)
returns table(processing_run_id uuid, resume_file_id uuid, storage_path text, attempt_count smallint)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_worker_service_role();
  return query
  with claimed as (
    update public.processing_runs run
    set status = 'EXTRACTING'::public.processing_run_status, attempt_count = run.attempt_count + 1,
      extracting_at = now(), error_category = null
    where run.id = target_processing_run_id and run.status = 'QUEUED'::public.processing_run_status and run.attempt_count < 2
    returning run.id, run.resume_file_id, run.attempt_count
  )
  select claimed.id, claimed.resume_file_id, resume.storage_path, claimed.attempt_count
  from claimed join public.resume_files resume on resume.id = claimed.resume_file_id;
end;
$$;

create function public.complete_resume_extraction(target_processing_run_id uuid, extracted_pages jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare run public.processing_runs%rowtype; page jsonb; expected_page integer := 1;
begin
  perform public.require_worker_service_role();
  select * into run from public.processing_runs where id = target_processing_run_id for update;
  if not found then raise exception 'processing run not found' using errcode = 'P0002'; end if;
  if run.status = 'COMPLETED'::public.processing_run_status then return; end if;
  if run.status <> 'EXTRACTING'::public.processing_run_status then raise exception 'processing run is not extracting' using errcode = '55000'; end if;
  if jsonb_typeof(extracted_pages) <> 'array' or jsonb_array_length(extracted_pages) = 0 then raise exception 'extracted pages are required' using errcode = '22023'; end if;
  for page in select value from jsonb_array_elements(extracted_pages) loop
    if (page ->> 'page_number') !~ '^[1-9][0-9]*$' or (page ->> 'page_number')::integer <> expected_page then raise exception 'page numbers must be contiguous' using errcode = '22023'; end if;
    if coalesce(page ->> 'raw_text_sha256', '') !~ '^[0-9a-f]{64}$' or coalesce(page ->> 'normalized_text_sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'page SHA-256 hashes are invalid' using errcode = '22023'; end if;
    insert into public.resume_pages (resume_file_id, processing_run_id, page_number, raw_text, normalized_text, raw_text_sha256, normalized_text_sha256)
    values (run.resume_file_id, run.id, (page ->> 'page_number')::integer, coalesce(page ->> 'raw_text', ''), coalesce(page ->> 'normalized_text', ''), page ->> 'raw_text_sha256', page ->> 'normalized_text_sha256');
    expected_page := expected_page + 1;
  end loop;
  update public.processing_runs set status = 'COMPLETED'::public.processing_run_status, extracting_at = null, completed_at = now(), error_category = null where id = run.id;
end;
$$;

create function public.mark_resume_extraction_needs_ocr(target_processing_run_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_worker_service_role();
  update public.processing_runs set status = 'NEEDS_OCR'::public.processing_run_status, extracting_at = null, completed_at = now(), error_category = null
  where id = target_processing_run_id and status = 'EXTRACTING'::public.processing_run_status;
  if not found then raise exception 'processing run is not extracting' using errcode = '55000'; end if;
end;
$$;

create function public.fail_resume_extraction(target_processing_run_id uuid, failure_category public.processing_error_category, is_retryable boolean)
returns void language plpgsql security definer set search_path = public, auth, pgmq as $$
declare run public.processing_runs%rowtype;
begin
  perform public.require_worker_service_role();
  select * into run from public.processing_runs where id = target_processing_run_id for update;
  if not found then raise exception 'processing run not found' using errcode = 'P0002'; end if;
  if run.status in ('COMPLETED'::public.processing_run_status, 'NEEDS_OCR'::public.processing_run_status, 'FAILED'::public.processing_run_status) then return; end if;
  if run.status <> 'EXTRACTING'::public.processing_run_status then raise exception 'processing run is not extracting' using errcode = '55000'; end if;
  if is_retryable and run.attempt_count < 2 then
    update public.processing_runs set status = 'QUEUED'::public.processing_run_status, extracting_at = null, error_category = failure_category where id = run.id;
    perform public.enqueue_resume_processing_run(run.id);
  else
    update public.processing_runs set status = 'FAILED'::public.processing_run_status, extracting_at = null, completed_at = now(), error_category = failure_category where id = run.id;
  end if;
end;
$$;

revoke all on function public.require_worker_service_role(), public.enqueue_resume_processing_run(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.claim_resume_extraction_run(uuid), public.complete_resume_extraction(uuid, jsonb), public.mark_resume_extraction_needs_ocr(uuid), public.fail_resume_extraction(uuid, public.processing_error_category, boolean) from public, anon, authenticated;
grant execute on function public.claim_resume_extraction_run(uuid), public.complete_resume_extraction(uuid, jsonb), public.mark_resume_extraction_needs_ocr(uuid), public.fail_resume_extraction(uuid, public.processing_error_category, boolean) to service_role;
revoke execute on function public.finalize_uploaded_resume(uuid) from public, anon;
grant execute on function public.finalize_uploaded_resume(uuid) to authenticated;

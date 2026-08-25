-- Phase 3 reservation/finalization intake. Roll back after application only by forward migration; audit is append-only.
create type public.resume_intake_status as enum ('PENDING_UPLOAD', 'UPLOADED');
create table public.resume_files (
  id uuid primary key, application_id uuid not null references public.applications (id) on delete restrict,
  storage_path text not null unique check (length(storage_path) <= 512),
  original_filename text not null check (length(trim(original_filename)) between 1 and 255),
  mime_type text not null check (mime_type = 'application/pdf'),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~* '^[0-9a-f]{64}$'),
  intake_status public.resume_intake_status not null default 'PENDING_UPLOAD',
  synthetic_or_anonymized_attested boolean not null check (synthetic_or_anonymized_attested),
  attested_by uuid not null references public.profiles (id) on delete restrict,
  attested_at timestamptz not null, created_at timestamptz not null default now()
);
create index resume_files_application_created_idx on public.resume_files (application_id, created_at desc);
create index resume_files_pending_path_idx on public.resume_files (storage_path) where intake_status = 'PENDING_UPLOAD';
alter table public.resume_files enable row level security;
create policy resume_files_select_assigned on public.resume_files for select to authenticated using (public.can_access_application(application_id));
grant select on public.resume_files to authenticated;
revoke insert, update, delete on public.resume_files from anon, authenticated, service_role;

create function public.can_manage_resume_upload_reservation(target_path text) returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and public.current_user_role() in ('ADMIN'::public.app_role, 'RECRUITER'::public.app_role) and exists (
    select 1 from public.resume_files resume join public.applications application on application.id = resume.application_id
    where resume.storage_path = target_path and resume.intake_status = 'PENDING_UPLOAD'::public.resume_intake_status and public.can_access_job(application.job_id))
$$;
create function public.can_select_resume_storage_object(target_path text) returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.resume_files resume join public.applications application on application.id = resume.application_id
    where resume.storage_path = target_path and public.can_access_job(application.job_id))
$$;
revoke execute on function public.can_manage_resume_upload_reservation(text), public.can_select_resume_storage_object(text) from public, anon;
grant execute on function public.can_manage_resume_upload_reservation(text), public.can_select_resume_storage_object(text) to authenticated;
create policy resumes_insert_pending_reservation on storage.objects for insert to authenticated with check (bucket_id = 'resumes' and public.can_manage_resume_upload_reservation(name));
create policy resumes_select_assigned_reservation on storage.objects for select to authenticated using (bucket_id = 'resumes' and public.can_select_resume_storage_object(name));
create policy resumes_delete_pending_reservation on storage.objects for delete to authenticated using (bucket_id = 'resumes' and public.can_manage_resume_upload_reservation(name));

create function public.create_resume_upload_reservation(target_job_id uuid, candidate_id uuid, application_id uuid, resume_file_id uuid, storage_path text, original_filename text, mime_type text, byte_size integer, sha256 text, synthetic_or_anonymized_attested boolean)
returns uuid language plpgsql security definer set search_path = public, auth, storage as $$
declare actor uuid := auth.uid(); actor_role public.app_role; target_job_status public.job_status; expected_path text; normalized_filename text := trim(coalesce(original_filename, '')); normalized_sha256 text := lower(trim(coalesce(sha256, '')));
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select status into target_job_status from public.jobs where id = target_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  if actor_role is distinct from 'ADMIN'::public.app_role and not (actor_role = 'RECRUITER'::public.app_role and public.can_access_job(target_job_id)) then raise exception 'not authorized to reserve resume upload' using errcode = '42501'; end if;
  if target_job_status <> 'READY_FOR_INTAKE'::public.job_status then raise exception 'job is not ready for intake' using errcode = '55000'; end if;
  if (select count(*) from public.scorecard_versions where job_id = target_job_id and status = 'APPROVED'::public.scorecard_status) <> 1 then raise exception 'job requires exactly one active approved scorecard' using errcode = '55000'; end if;
  expected_path := format('%s/%s/%s.pdf', target_job_id, application_id, resume_file_id);
  if storage_path is distinct from expected_path then raise exception 'storage path must match the opaque job/application/file path' using errcode = '22023'; end if;
  if normalized_filename = '' or length(normalized_filename) > 255 or normalized_filename !~* '\\.pdf$' then raise exception 'original filename must be a PDF filename' using errcode = '22023'; end if;
  if mime_type is distinct from 'application/pdf' then raise exception 'resume MIME type must be application/pdf' using errcode = '22023'; end if;
  if byte_size is null or byte_size <= 0 or byte_size > 10485760 then raise exception 'resume byte size must be between 1 and 10485760' using errcode = '22023'; end if;
  if normalized_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'resume SHA-256 must be a 64-character hexadecimal digest' using errcode = '22023'; end if;
  if synthetic_or_anonymized_attested is not true then raise exception 'synthetic or anonymized attestation is required' using errcode = '22023'; end if;
  if exists (select 1 from storage.objects object where object.bucket_id = 'resumes' and object.name = storage_path) then raise exception 'storage object already exists for reservation path' using errcode = '55000'; end if;
  insert into public.candidates (id, demo_label) values (candidate_id, format('Synthetic resume %s', resume_file_id));
  insert into public.applications (id, candidate_id, job_id, source, workflow_state) values (application_id, candidate_id, target_job_id, 'RESUME_UPLOAD', 'NEW');
  insert into public.resume_files (id, application_id, storage_path, original_filename, mime_type, byte_size, sha256, intake_status, synthetic_or_anonymized_attested, attested_by, attested_at) values (resume_file_id, application_id, storage_path, normalized_filename, mime_type, byte_size, normalized_sha256, 'PENDING_UPLOAD', true, actor, now());
  perform public.append_safe_audit('RESUME_UPLOAD_RESERVED', 'application', application_id, jsonb_build_object('resume_file_id', resume_file_id, 'candidate_id', candidate_id, 'mime_type', mime_type, 'byte_size', byte_size, 'sha256', normalized_sha256, 'synthetic_or_anonymized_attested', true), null, null, null, 'resume_intake');
  return resume_file_id;
end;
$$;

create function public.finalize_uploaded_resume(resume_file_id uuid) returns void language plpgsql security definer set search_path = public, auth, storage as $$
declare actor uuid := auth.uid(); actor_role public.app_role; resume public.resume_files%rowtype; target_job_id uuid; stored_size bigint;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select resume_file.* into resume from public.resume_files resume_file where resume_file.id = resume_file_id for update;
  if not found then raise exception 'resume reservation not found' using errcode = 'P0002'; end if;
  select job_id into target_job_id from public.applications where id = resume.application_id;
  if actor_role is distinct from 'ADMIN'::public.app_role and not (actor_role = 'RECRUITER'::public.app_role and public.can_access_job(target_job_id)) then raise exception 'not authorized to finalize uploaded resume' using errcode = '42501'; end if;
  if resume.intake_status <> 'PENDING_UPLOAD'::public.resume_intake_status then raise exception 'resume upload is not pending' using errcode = '55000'; end if;
  select (object.metadata ->> 'size')::bigint into stored_size from storage.objects object where object.bucket_id = 'resumes' and object.name = resume.storage_path and object.metadata ->> 'size' ~ '^[0-9]+$' for update;
  if not found then raise exception 'uploaded resume object was not found with a valid byte size' using errcode = 'P0002'; end if;
  if stored_size <> resume.byte_size then raise exception 'uploaded resume object byte size does not match reservation' using errcode = '22023'; end if;
  update public.resume_files set intake_status = 'UPLOADED'::public.resume_intake_status where id = resume_file_id;
  perform public.append_safe_audit('RESUME_UPLOADED', 'application', resume.application_id, jsonb_build_object('resume_file_id', resume.id, 'mime_type', resume.mime_type, 'byte_size', resume.byte_size, 'sha256', resume.sha256), null, null, null, 'resume_intake');
end;
$$;

create function public.cancel_resume_upload_reservation(resume_file_id uuid) returns void language plpgsql security definer set search_path = public, auth, storage as $$
declare actor uuid := auth.uid(); actor_role public.app_role; resume public.resume_files%rowtype; target_job_id uuid; target_candidate_id uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select resume_file.* into resume from public.resume_files resume_file where resume_file.id = resume_file_id for update;
  if not found then raise exception 'resume reservation not found' using errcode = 'P0002'; end if;
  select job_id, candidate_id into target_job_id, target_candidate_id from public.applications where id = resume.application_id;
  if actor_role is distinct from 'ADMIN'::public.app_role and not (actor_role = 'RECRUITER'::public.app_role and public.can_access_job(target_job_id)) then raise exception 'not authorized to cancel resume upload reservation' using errcode = '42501'; end if;
  if resume.intake_status <> 'PENDING_UPLOAD'::public.resume_intake_status then raise exception 'only pending resume reservations can be cancelled' using errcode = '55000'; end if;
  if exists (select 1 from storage.objects object where object.bucket_id = 'resumes' and object.name = resume.storage_path) then raise exception 'storage object must be deleted before cancelling reservation' using errcode = '55000'; end if;
  delete from public.resume_files where id = resume.id; delete from public.applications where id = resume.application_id;
  delete from public.candidates where id = target_candidate_id and not exists (select 1 from public.applications where candidate_id = target_candidate_id);
  perform public.append_safe_audit('RESUME_UPLOAD_RESERVATION_CANCELLED', 'application', resume.application_id, jsonb_build_object('resume_file_id', resume.id, 'candidate_id', target_candidate_id), null, null, null, 'resume_intake');
end;
$$;

create policy audit_events_select_application_assigned on public.audit_events for select to authenticated using (aggregate_type = 'application' and public.can_access_application(aggregate_id));
revoke execute on function public.create_resume_upload_reservation(uuid, uuid, uuid, uuid, text, text, text, integer, text, boolean), public.finalize_uploaded_resume(uuid), public.cancel_resume_upload_reservation(uuid) from public, anon;
grant execute on function public.create_resume_upload_reservation(uuid, uuid, uuid, uuid, text, text, text, integer, text, boolean), public.finalize_uploaded_resume(uuid), public.cancel_resume_upload_reservation(uuid) to authenticated;

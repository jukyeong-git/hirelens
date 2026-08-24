begin;

-- This file is safe for hosted verification only when migration 026 is loaded
-- earlier in the same transaction. Every fixture mutation is rolled back.
select plan(45);

set local role postgres;

select ok(
  to_regprocedure(
    'public.create_resume_upload_reservation(uuid,uuid,uuid,uuid,text,text,text,integer,text,boolean)'
  ) is null,
  'The attestation-bearing internal reservation signature no longer exists'
);
select ok(
  to_regprocedure(
    'public.create_public_resume_submission(text,uuid,uuid,uuid,text,text,integer,text,boolean)'
  ) is null,
  'The attestation-bearing public reservation signature no longer exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_resume_upload_reservation(uuid,uuid,uuid,uuid,text,text,text,integer,text)',
    'EXECUTE'
  ),
  'Authenticated callers may reach the role-authorized internal reservation RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_resume_upload_reservation(uuid,uuid,uuid,uuid,text,text,text,integer,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot invoke the internal reservation RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_public_resume_submission(text,uuid,uuid,uuid,text,text,integer,text)',
    'EXECUTE'
  ),
  'The server service role may invoke the public reservation RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_public_resume_submission(text,uuid,uuid,uuid,text,text,integer,text)',
    'EXECUTE'
  ),
  'Authenticated browser callers cannot invoke the server-owned public RPC'
);
select is(
  (select public from storage.buckets where id = 'resumes'),
  false,
  'Resume Storage remains private'
);
select has_column(
  'public',
  'resume_files',
  'synthetic_or_anonymized_attested',
  'The historical attestation value column is preserved'
);
select has_column(
  'public',
  'resume_files',
  'attested_by',
  'The historical attestation actor column is preserved'
);
select has_column(
  'public',
  'resume_files',
  'attested_at',
  'The historical attestation timestamp column is preserved'
);
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'resume_files'
      and column_name = 'synthetic_or_anonymized_attested'
  ),
  'YES',
  'The historical attestation value is no longer mandatory for new rows'
);
select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'resume_files'
      and column_name = 'attested_at'
  ),
  'YES',
  'The historical attestation timestamp is no longer mandatory for new rows'
);
select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.resume_files'::regclass
      and conname = 'resume_files_synthetic_or_anonymized_attested_check'
  ),
  'The former mandatory-true attestation check is removed'
);
select ok(
  not exists (
    select 1
    from public.resume_files
    where synthetic_or_anonymized_attested is false
      and attested_by is null
      and attested_at is null
  ),
  'Transitional unclassified reservations are normalized to null'
);
select ok(
  not exists (
    select 1
    from public.resume_files
    where id = '60000000-0000-0000-0000-000000000001'
  )
  or (
    select synthetic_or_anonymized_attested is true
    from public.resume_files
    where id = '60000000-0000-0000-0000-000000000001'
  ),
  'A known historical synthetic attestation remains true when present'
);

insert into public.jobs (
  id, title, department, raw_job_description, recruiter_id, hiring_manager_id,
  is_synthetic_demo
) values (
  '10000000-0000-0000-0000-000000000026',
  'Rollback-only resume intake verification',
  'Quality Engineering',
  'Isolated fixture used only by the rollback-only intake policy test.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000261',
    '50000000-0000-0000-0000-000000000261',
    '60000000-0000-0000-0000-000000000261',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000261/60000000-0000-0000-0000-000000000261.pdf',
    'applicant.pdf', 'application/pdf', 1024, repeat('a', 64)
  ) $$,
  '55000',
  'job is not ready for intake',
  'Internal reservation retains the intake-ready Job gate'
);

set local role postgres;
insert into public.scorecard_versions (
  id, job_id, version_number, status, source_job_description_hash,
  prompt_version, schema_version, model_id, ambiguous_phrases,
  created_by, approved_by, approved_at
) values (
  '20000000-0000-0000-0000-000000000026',
  '10000000-0000-0000-0000-000000000026',
  1,
  'APPROVED',
  repeat('a', 64),
  'rollback-test',
  'rollback-test',
  'rollback-test',
  '[]'::jsonb,
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  now()
);
update public.jobs
set status = 'READY_FOR_INTAKE'
where id = '10000000-0000-0000-0000-000000000026';

insert into public.job_postings (
  id, job_id, status, created_by, published_by, published_at, public_slug,
  public_title, public_summary, public_responsibilities, public_requirements,
  public_location, public_employment_type
) values (
  '30000000-0000-0000-0000-000000000026',
  '10000000-0000-0000-0000-000000000026',
  'PUBLISHED',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000002',
  now(),
  'feedfacefeedfacefeedfacefeedface',
  'Backend Engineer',
  'Build reliable backend services for HireLens.',
  'Design APIs and improve service reliability.',
  'TypeScript and PostgreSQL experience.',
  'Singapore · Hybrid',
  'Full-time'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000261',
    '50000000-0000-0000-0000-000000000261',
    '60000000-0000-0000-0000-000000000261',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000261/60000000-0000-0000-0000-000000000261.pdf',
    'applicant.pdf', 'application/pdf', 1024, repeat('a', 64)
  ) $$,
  'Admin reserves a valid PDF without content-policy arguments'
);

set local role postgres;
select ok(
  (
    select synthetic_or_anonymized_attested is null
      and attested_by is null
      and attested_at is null
    from public.resume_files
    where id = '60000000-0000-0000-0000-000000000261'
  ),
  'A new internal reservation leaves legacy attestation metadata null'
);
select is(
  (
    select candidate.demo_label
    from public.candidates candidate
    where candidate.id = '40000000-0000-0000-0000-000000000261'
  ),
  'Application intake',
  'New internal candidates receive a neutral label'
);
select ok(
  (
    select storage_path =
      '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000261/60000000-0000-0000-0000-000000000261.pdf'
    from public.resume_files
    where id = '60000000-0000-0000-0000-000000000261'
  ),
  'Internal Storage path remains opaque and exact'
);
select ok(
  exists (
    select 1
    from public.audit_events
    where event_type = 'RESUME_UPLOAD_RESERVED'
      and aggregate_id = '50000000-0000-0000-0000-000000000261'
      and safe_metadata ->> 'mime_type' = 'application/pdf'
      and safe_metadata::text not like '%applicant.pdf%'
      and safe_metadata::text not like '%attest%'
      and safe_metadata::text not like '%classification%'
      and safe_metadata::text not like '%notice%'
  ),
  'Internal reservation audit is safe and excludes filename and content-policy metadata'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000271',
    '50000000-0000-0000-0000-000000000271',
    '60000000-0000-0000-0000-000000000271',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000271/60000000-0000-0000-0000-000000000271.pdf',
    'applicant.pdf', 'text/plain', 1024, repeat('b', 64)
  ) $$,
  '22023',
  'resume MIME type must be application/pdf',
  'Internal reservation retains PDF MIME validation'
);
select throws_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000272',
    '50000000-0000-0000-0000-000000000272',
    '60000000-0000-0000-0000-000000000272',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000272/60000000-0000-0000-0000-000000000272.pdf',
    'applicant.txt', 'application/pdf', 1024, repeat('b', 64)
  ) $$,
  '22023',
  'original filename must be a PDF filename',
  'Internal reservation retains PDF extension validation'
);
select throws_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000273',
    '50000000-0000-0000-0000-000000000273',
    '60000000-0000-0000-0000-000000000273',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000273/60000000-0000-0000-0000-000000000273.pdf',
    'applicant.pdf', 'application/pdf', 10485761, repeat('b', 64)
  ) $$,
  '22023',
  'resume byte size must be between 1 and 10485760',
  'Internal reservation retains the 10 MiB limit'
);
select throws_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000274',
    '50000000-0000-0000-0000-000000000274',
    '60000000-0000-0000-0000-000000000274',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000274/60000000-0000-0000-0000-000000000274.pdf',
    'applicant.pdf', 'application/pdf', 1024, 'not-a-hash'
  ) $$,
  '22023',
  'resume SHA-256 must be a 64-character hexadecimal digest',
  'Internal reservation retains SHA-256 validation'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, metadata)
    values (
      'resumes',
      '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000261/60000000-0000-0000-0000-000000000261.pdf',
      '{"size":1024}'::jsonb
    ) $$,
  'The authenticated uploader may write only the pending private reservation'
);
select lives_ok(
  $$ select public.finalize_uploaded_resume('60000000-0000-0000-0000-000000000261') $$,
  'Internal finalization queues the uploaded PDF'
);
select lives_ok(
  $$ select public.finalize_uploaded_resume('60000000-0000-0000-0000-000000000261') $$,
  'Internal finalization remains idempotent'
);
select is(
  (
    select count(*)::integer
    from public.processing_runs
    where resume_file_id = '60000000-0000-0000-0000-000000000261'
  ),
  1,
  'Repeated internal finalization creates one durable processing run'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000262',
    '50000000-0000-0000-0000-000000000262',
    '60000000-0000-0000-0000-000000000262',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000262/60000000-0000-0000-0000-000000000262.pdf',
    'resume.pdf', 'application/pdf', 2048, repeat('c', 64)
  ) $$,
  'Assigned Recruiter may reserve any valid PDF'
);
select throws_ok(
  $$ insert into public.resume_files (
    id, application_id, storage_path, original_filename, mime_type, byte_size, sha256
  ) values (
    '60000000-0000-0000-0000-000000000299',
    '50000000-0000-0000-0000-000000000262',
    'forged.pdf', 'forged.pdf', 'application/pdf', 1, repeat('d', 64)
  ) $$,
  '42501',
  'permission denied for table resume_files',
  'Authenticated callers cannot bypass the reservation RPC'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.create_resume_upload_reservation(
    '10000000-0000-0000-0000-000000000026',
    '40000000-0000-0000-0000-000000000263',
    '50000000-0000-0000-0000-000000000263',
    '60000000-0000-0000-0000-000000000263',
    '10000000-0000-0000-0000-000000000026/50000000-0000-0000-0000-000000000263/60000000-0000-0000-0000-000000000263.pdf',
    'resume.pdf', 'application/pdf', 1024, repeat('d', 64)
  ) $$,
  '42501',
  'not authorized to reserve resume upload',
  'Hiring Manager cannot reserve an internal upload'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is(
  (
    select count(*)::integer
    from public.resume_files
    where id = '60000000-0000-0000-0000-000000000261'
  ),
  0,
  'An unrelated manager cannot read private resume metadata'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.create_public_resume_submission(
    'feedfacefeedfacefeedfacefeedface',
    '40000000-0000-0000-0000-000000000264',
    '50000000-0000-0000-0000-000000000264',
    '60000000-0000-0000-0000-000000000264',
    'applicant.pdf', 'application/pdf', 1024, repeat('e', 64)
  ) $$,
  'Server-owned public intake reserves any valid PDF without policy arguments'
);

set local role postgres;
select ok(
  (
    select synthetic_or_anonymized_attested is null
      and attested_by is null
      and attested_at is null
    from public.resume_files
    where id = '60000000-0000-0000-0000-000000000264'
  ),
  'A new public reservation leaves legacy attestation metadata null'
);
select is(
  (
    select source
    from public.applications
    where id = '50000000-0000-0000-0000-000000000264'
  ),
  'PUBLIC_POSTING',
  'Public intake retains its internal source marker'
);
select is(
  (
    select demo_label
    from public.candidates
    where id = '40000000-0000-0000-0000-000000000264'
  ),
  'Public application',
  'New public candidates receive a neutral label'
);
select ok(
  exists (
    select 1
    from public.audit_events
    where event_type = 'PUBLIC_RESUME_SUBMISSION_RESERVED'
      and aggregate_id = '50000000-0000-0000-0000-000000000264'
      and safe_metadata::text not like '%applicant.pdf%'
      and safe_metadata::text not like '%attest%'
      and safe_metadata::text not like '%classification%'
      and safe_metadata::text not like '%notice%'
  ),
  'Public reservation audit excludes filename and content-policy metadata'
);
insert into storage.objects (bucket_id, name, metadata)
select 'resumes', storage_path, '{"size":1024}'::jsonb
from public.resume_files
where id = '60000000-0000-0000-0000-000000000264';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.finalize_public_resume_submission('60000000-0000-0000-0000-000000000264') $$,
  'Server finalizes the private public-submission object'
);
select lives_ok(
  $$ select public.finalize_public_resume_submission('60000000-0000-0000-0000-000000000264') $$,
  'Public finalization remains idempotent'
);

set local role postgres;
select is(
  (
    select count(*)::integer
    from public.processing_runs
    where resume_file_id = '60000000-0000-0000-0000-000000000264'
  ),
  1,
  'Repeated public finalization creates one durable processing run'
);
select is(
  (
    select count(*)::integer
    from public.human_reviews
    where application_id in (
      '50000000-0000-0000-0000-000000000261',
      '50000000-0000-0000-0000-000000000264'
    )
  ),
  0,
  'Resume intake and queueing never create a human hiring decision'
);
update public.job_postings
set status = 'CLOSED'::public.posting_status,
    closed_by = '00000000-0000-0000-0000-000000000002',
    closed_at = now()
where public_slug = 'feedfacefeedfacefeedfacefeedface';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ select public.create_public_resume_submission(
    'feedfacefeedfacefeedfacefeedface',
    '40000000-0000-0000-0000-000000000265',
    '50000000-0000-0000-0000-000000000265',
    '60000000-0000-0000-0000-000000000265',
    'resume.pdf', 'application/pdf', 1024, repeat('f', 64)
  ) $$,
  'P0002',
  'public posting is unavailable',
  'Closed public postings cannot reserve applications'
);

set local role anon;
select throws_ok(
  $$ select public.create_public_resume_submission(
    'feedfacefeedfacefeedfacefeedface',
    '40000000-0000-0000-0000-000000000266',
    '50000000-0000-0000-0000-000000000266',
    '60000000-0000-0000-0000-000000000266',
    'resume.pdf', 'application/pdf', 1024, repeat('f', 64)
  ) $$,
  '42501',
  'permission denied for function create_public_resume_submission',
  'Anonymous callers cannot invoke the server-owned public reservation RPC'
);
select is(
  (select count(*)::integer from public.resume_files),
  0,
  'Anonymous callers read no private resume metadata'
);

select * from finish();
rollback;

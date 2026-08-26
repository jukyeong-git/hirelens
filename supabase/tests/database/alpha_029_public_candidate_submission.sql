begin;

-- Alpha verification only. Every fixture mutation is rolled back.
select plan(16);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_public_resume_submission(text,uuid,uuid,uuid,text,text,integer,text)',
    'EXECUTE'
  ),
  'Anonymous callers cannot invoke the server-owned public submission RPC directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_public_resume_submission(text,uuid,uuid,uuid,text,text,integer,text)',
    'EXECUTE'
  ),
  'Only the server service role can invoke the public submission RPC'
);

set local role anon;
select throws_ok(
  $$ select public.create_public_resume_submission(
    'deadbeefdeadbeefdeadbeefdeadbeef',
    '40000000-0000-0000-0000-000000000029',
    '50000000-0000-0000-0000-000000000029',
    '60000000-0000-0000-0000-000000000029',
    'synthetic.pdf',
    'application/pdf',
    1024,
    repeat('a', 64)
  ) $$,
  '42501',
  'permission denied for function create_public_resume_submission',
  'Anonymous callers cannot create public application records through the database'
);
select throws_ok(
  $$ select count(*) from public.applications $$,
  '42501',
  'permission denied for table applications',
  'Anonymous callers cannot read internal applications'
);
select throws_ok(
  $$ select count(*) from public.resume_files $$,
  '42501',
  'permission denied for table resume_files',
  'Anonymous callers cannot read private resume metadata'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.create_public_resume_submission(
    'deadbeefdeadbeefdeadbeefdeadbeef',
    '40000000-0000-0000-0000-000000000029',
    '50000000-0000-0000-0000-000000000029',
    '60000000-0000-0000-0000-000000000029',
    'synthetic-public-resume.pdf',
    'application/pdf',
    1024,
    repeat('a', 64)
  ) $$,
  'Server-owned public submission reserves an opaque private resume path'
);
select is(
  (select source from public.applications where id = '50000000-0000-0000-0000-000000000029'),
  'PUBLIC_POSTING',
  'Public submission has a separate internal source marker'
);
select is(
  (select intake_status::text from public.resume_files where id = '60000000-0000-0000-0000-000000000029'),
  'PENDING_UPLOAD',
  'Public submission begins as a pending private upload'
);
select ok(
  (select synthetic_or_anonymized_attested is null
    and attested_by is null
    and attested_at is null
   from public.resume_files
   where id = '60000000-0000-0000-0000-000000000029'),
  'Public reservation leaves historical attestation metadata null'
);
select ok(
  (select storage_path ~ '^10000000-0000-0000-0000-000000000002/50000000-0000-0000-0000-000000000029/60000000-0000-0000-0000-000000000029\\.pdf$'
   from public.resume_files
   where id = '60000000-0000-0000-0000-000000000029'),
  'Server derives the opaque private Storage path from the target job and generated IDs'
);
set local role postgres;
insert into storage.objects (bucket_id, name, metadata)
select 'resumes', storage_path, '{"size":1024}'::jsonb
from public.resume_files
where id = '60000000-0000-0000-0000-000000000029';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.finalize_public_resume_submission('60000000-0000-0000-0000-000000000029') $$,
  'Server finalization accepts the stored public PDF'
);
select is(
  (select intake_status::text from public.resume_files where id = '60000000-0000-0000-0000-000000000029'),
  'UPLOADED',
  'Public finalization marks the private file uploaded'
);
select is(
  (select status::text from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000029'),
  'QUEUED',
  'Public finalization creates one queued processing run'
);
select is(
  (select count(*)::integer from public.human_reviews where application_id = '50000000-0000-0000-0000-000000000029'),
  0,
  'Public submission never creates a human decision'
);

set local role postgres;
update public.job_postings
set status = 'CLOSED'::public.posting_status
where public_slug = 'deadbeefdeadbeefdeadbeefdeadbeef';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ select public.create_public_resume_submission(
    'deadbeefdeadbeefdeadbeefdeadbeef',
    '40000000-0000-0000-0000-000000000030',
    '50000000-0000-0000-0000-000000000030',
    '60000000-0000-0000-0000-000000000030',
    'closed.pdf',
    'application/pdf',
    1024,
    repeat('b', 64)
  ) $$,
  'P0002',
  'public posting is unavailable',
  'Closed public postings cannot reserve a new application'
);
select is(
  (select count(*)::integer from public.applications where id = '50000000-0000-0000-0000-000000000030'),
  0,
  'Closed posting denial leaves no application row'
);

select * from finish();
rollback;

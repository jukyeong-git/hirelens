begin;
select plan(19);

set local role postgres;
update public.scorecard_versions set status = 'APPROVED', approved_by = '00000000-0000-0000-0000-000000000001', approved_at = now() where id = '20000000-0000-0000-0000-000000000001';
update public.jobs set status = 'READY_FOR_INTAKE' where id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
set local role authenticated;

select ok(has_function_privilege('authenticated', 'public.create_resume_upload_reservation(uuid,uuid,uuid,uuid,text,text,text,integer,text)', 'EXECUTE'), 'Authenticated users can request a reservation');
select ok(not has_function_privilege('anon', 'public.create_resume_upload_reservation(uuid,uuid,uuid,uuid,text,text,text,integer,text)', 'EXECUTE'), 'Anonymous users cannot request a reservation');
select is((select public from storage.buckets where id = 'resumes'), false, 'Resume bucket remains private');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select lives_ok($$
  select public.create_resume_upload_reservation('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000100','50000000-0000-0000-0000-000000000100','60000000-0000-0000-0000-000000000100','10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000100/60000000-0000-0000-0000-000000000100.pdf','resume.pdf','application/pdf',1024,repeat('a',64))
$$, 'Admin can reserve an opaque intake path');
select is((select intake_status::text from public.resume_files where id = '60000000-0000-0000-0000-000000000100'), 'PENDING_UPLOAD', 'Reservation is pending upload');
select ok((select synthetic_or_anonymized_attested is null and attested_by is null and attested_at is null from public.resume_files where id = '60000000-0000-0000-0000-000000000100'), 'Reservation leaves historical attestation metadata null');
select lives_ok($$
  select public.create_resume_upload_reservation('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000101','50000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000101','10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000101/60000000-0000-0000-0000-000000000101.pdf','resume.pdf','application/pdf',1024,repeat('a',64))
$$, 'Reservation requires no content-policy argument');
select throws_ok($$ insert into public.resume_files (id,application_id,storage_path,original_filename,mime_type,byte_size,sha256,synthetic_or_anonymized_attested,attested_by,attested_at) values ('60000000-0000-0000-0000-000000000199','50000000-0000-0000-0000-000000000100','forged.pdf','forged.pdf','application/pdf',1,repeat('a',64),true,auth.uid(),now()) $$, '42501', 'permission denied for table resume_files', 'Direct resume writes are denied');

select lives_ok($$ insert into storage.objects (bucket_id,name,metadata) values ('resumes','10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000100/60000000-0000-0000-0000-000000000100.pdf','{"size":1024}'::jsonb) $$, 'Only the pending reservation permits its storage upload');
select lives_ok($$ select public.finalize_uploaded_resume('60000000-0000-0000-0000-000000000100') $$, 'Admin can finalize an exact uploaded object');
select is((select intake_status::text from public.resume_files where id = '60000000-0000-0000-0000-000000000100'), 'UPLOADED', 'Finalization marks the file uploaded');
delete from storage.objects where bucket_id = 'resumes' and name = '10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000100/60000000-0000-0000-0000-000000000100.pdf';
select is((select count(*)::integer from storage.objects where bucket_id = 'resumes' and name = '10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000100/60000000-0000-0000-0000-000000000100.pdf'), 1, 'Uploaded objects cannot be deleted through pending-only policy');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok($$
  select public.create_resume_upload_reservation('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000102','50000000-0000-0000-0000-000000000102','60000000-0000-0000-0000-000000000102','10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000102/60000000-0000-0000-0000-000000000102.pdf','resume.pdf','application/pdf',2048,repeat('b',64))
$$, 'Assigned Recruiter can reserve upload');
select throws_ok($$ select public.finalize_uploaded_resume('60000000-0000-0000-0000-000000000102') $$, 'P0002', 'uploaded resume object was not found with a valid byte size', 'Finalization requires an uploaded object');
select lives_ok($$ select public.cancel_resume_upload_reservation('60000000-0000-0000-0000-000000000102') $$, 'Pending reservation without object can be cancelled');
select is((select count(*)::integer from public.resume_files where id = '60000000-0000-0000-0000-000000000102'), 0, 'Cancellation removes the pending reservation');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.create_resume_upload_reservation('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000103','50000000-0000-0000-0000-000000000103','60000000-0000-0000-0000-000000000103','10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000103/60000000-0000-0000-0000-000000000103.pdf','resume.pdf','application/pdf',1,repeat('c',64)) $$, '42501', 'not authorized to reserve resume upload', 'Hiring Manager cannot reserve upload');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.resume_files where id = '60000000-0000-0000-0000-000000000100'), 0, 'Cross-job manager cannot read resume metadata');

set local role anon;
select throws_ok($$ select public.finalize_uploaded_resume('60000000-0000-0000-0000-000000000100') $$, '42501', 'permission denied for function finalize_uploaded_resume', 'Anonymous callers cannot finalize upload');
select * from finish();
rollback;

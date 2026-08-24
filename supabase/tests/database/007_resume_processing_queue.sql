begin;
select plan(17);

set local role postgres;
update public.scorecard_versions set status = 'APPROVED', approved_by = '00000000-0000-0000-0000-000000000001', approved_at = now() where id = '20000000-0000-0000-0000-000000000001';
update public.jobs set status = 'READY_FOR_INTAKE' where id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select lives_ok($$
  select public.create_resume_upload_reservation('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000700','50000000-0000-0000-0000-000000000700','60000000-0000-0000-0000-000000000700','10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000700/60000000-0000-0000-0000-000000000700.pdf','synthetic.pdf','application/pdf',1024,repeat('a',64),true)
$$, 'Admin reserves a synthetic PDF');
insert into storage.objects (bucket_id, name, metadata) values ('resumes', '10000000-0000-0000-0000-000000000001/50000000-0000-0000-0000-000000000700/60000000-0000-0000-0000-000000000700.pdf', '{"size":1024}'::jsonb);
select lives_ok($$ select public.finalize_uploaded_resume('60000000-0000-0000-0000-000000000700') $$, 'Finalization queues a processing run');
select is((select status::text from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 'QUEUED', 'Run begins queued');
select is((select count(*)::integer from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 1, 'Finalization creates one run');
select lives_ok($$ select public.finalize_uploaded_resume('60000000-0000-0000-0000-000000000700') $$, 'Repeated finalization is idempotent');
select is((select count(*)::integer from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 1, 'Repeated finalization cannot duplicate the run');
select throws_ok($$ select public.claim_resume_extraction_run((select id from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700')) $$, '42501', 'worker service role required', 'Browser roles cannot claim processing');
select ok(not has_table_privilege('service_role', 'public.human_reviews', 'INSERT'), 'Worker service role cannot write human decisions');
select ok(not has_function_privilege('service_role', 'public.create_human_review(uuid,uuid,public.human_decision,text,text,public.review_confidence)', 'EXECUTE'), 'Worker service role cannot invoke human decision RPC');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select public.claim_resume_extraction_run((select id from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700')) $$, 'Service role claims the queued run');
select is((select status::text from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 'EXTRACTING', 'Claim transitions to extracting');
select is((select attempt_count::integer from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 1, 'Claim increments attempt count');
select lives_ok($$ select public.fail_resume_extraction((select id from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 'STORAGE_UNAVAILABLE', true) $$, 'First transient failure creates bounded retry');
select is((select status::text from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 'QUEUED', 'Retry returns the run to queued');
select lives_ok($$ select public.claim_resume_extraction_run((select id from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700')) $$, 'Service role claims the retry');
select lives_ok($$ select public.fail_resume_extraction((select id from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 'STORAGE_UNAVAILABLE', true) $$, 'Second transient failure is durable');
select is((select status::text from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 'FAILED', 'Two attempts is the maximum');
select is((select attempt_count::integer from public.processing_runs where resume_file_id = '60000000-0000-0000-0000-000000000700'), 2, 'No third attempt is scheduled');

select * from finish();
rollback;

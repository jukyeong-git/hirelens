begin;
select plan(20);

set local role postgres;
update public.scorecard_versions
set status = 'APPROVED', approved_by = '00000000-0000-0000-0000-000000000001', approved_at = now()
where id = '20000000-0000-0000-0000-000000000001'
  and status = 'DRAFT';
insert into public.candidates (id, demo_label)
values ('40000000-0000-0000-0000-000000000811', 'Synthetic interview gate');
insert into public.applications (id, candidate_id, job_id, source, workflow_state)
values ('50000000-0000-0000-0000-000000000811', '40000000-0000-0000-0000-000000000811', '10000000-0000-0000-0000-000000000001', 'TEST', 'NEW');
insert into public.candidates (id, demo_label)
values ('40000000-0000-0000-0000-000000000812', 'Synthetic admin override');
insert into public.applications (id, candidate_id, job_id, source, workflow_state)
values ('50000000-0000-0000-0000-000000000812', '40000000-0000-0000-0000-000000000812', '10000000-0000-0000-0000-000000000001', 'TEST', 'NEW');
insert into public.resume_files (
  id, application_id, storage_path, original_filename, mime_type, byte_size, sha256,
  intake_status, synthetic_or_anonymized_attested, attested_by, attested_at
) values (
  '60000000-0000-0000-0000-000000000811', '50000000-0000-0000-0000-000000000811',
  'opaque/interview.pdf', 'synthetic.pdf', 'application/pdf', 100, repeat('a', 64),
  'UPLOADED', true, '00000000-0000-0000-0000-000000000002', now()
);
insert into public.processing_runs (
  id, application_id, resume_file_id, scorecard_version_id, pipeline_version,
  status, attempt_count, error_category, completed_at
) values (
  '70000000-0000-0000-0000-000000000811', '50000000-0000-0000-0000-000000000811',
  '60000000-0000-0000-0000-000000000811', '20000000-0000-0000-0000-000000000001',
  'evidence-pipeline-v1', 'FAILED', 2, 'AI_PROVIDER_ERROR', now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.create_human_review('50000000-0000-0000-0000-000000000811', '20000000-0000-0000-0000-000000000001', 'PROCEED', 'INTERVIEW_COMPLETE', 'Bypass attempt.', 'MEDIUM', null) $$,
  '55000', 'final decision requires a prior INTERVIEW progression outcome',
  'Hiring Manager cannot bypass the interview gate through the final decision RPC'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.create_human_review('50000000-0000-0000-0000-000000000812', '20000000-0000-0000-0000-000000000001', 'HOLD', 'ADMIN_OVERRIDE', 'Admin operational override before interview.', 'MEDIUM', null) $$,
  'Admin can create a final decision before an INTERVIEW outcome'
);
select is(
  (select count(*)::integer from public.human_reviews where application_id = '50000000-0000-0000-0000-000000000812' and reviewer_id = '00000000-0000-0000-0000-000000000001'),
  1, 'Admin override creates exactly one human review'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.request_hiring_manager_review('50000000-0000-0000-0000-000000000811', null) $$,
  '42501', 'assigned Recruiter or Admin required',
  'Hiring Manager cannot self-route before Recruiter request'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.request_hiring_manager_review('50000000-0000-0000-0000-000000000811', 'Review the bounded failure and source manually.') $$,
  'assigned Recruiter can request Hiring Manager review'
);
select is(
  (select workflow_state from public.applications where id = '50000000-0000-0000-0000-000000000811'),
  'MANAGER_REVIEW_REQUESTED', 'request updates only the human workflow state'
);
select is(
  (select count(*)::integer from public.review_assignments where application_id = '50000000-0000-0000-0000-000000000811' and status = 'ACTIVE'),
  1, 'one active manager assignment exists'
);
select is(
  (select count(*)::integer from public.notifications where aggregate_id = '50000000-0000-0000-0000-000000000811' and event_type = 'REVIEW_ASSIGNMENT' and recipient_id = '00000000-0000-0000-0000-000000000003'),
  1, 'assigned Hiring Manager receives an in-app notification'
);
select lives_ok(
  $$ select public.request_hiring_manager_review('50000000-0000-0000-0000-000000000811', 'duplicate') $$,
  'duplicate request is idempotent'
);
select is(
  (select count(*)::integer from public.review_assignments where application_id = '50000000-0000-0000-0000-000000000811'),
  1, 'duplicate request creates no second assignment'
);
select throws_ok(
  $$ select public.record_interview_progression('50000000-0000-0000-0000-000000000811', '20000000-0000-0000-0000-000000000001', 'INTERVIEW', 'Recruiter cannot decide') $$,
  '42501', 'assigned Hiring Manager review request required',
  'Recruiter cannot record interview progression'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.record_interview_progression('50000000-0000-0000-0000-000000000811', '20000000-0000-0000-0000-000000000001', 'INTERVIEW', '') $$,
  '22023', 'interview progression reason is required',
  'reason is mandatory'
);
select lives_ok(
  $$ select public.record_interview_progression('50000000-0000-0000-0000-000000000811', '20000000-0000-0000-0000-000000000001', 'MORE_INFORMATION_REQUIRED', 'Clarify production ownership.') $$,
  'assigned Hiring Manager records a reasoned outcome'
);
select lives_ok(
  $$ select public.record_interview_progression('50000000-0000-0000-0000-000000000811', '20000000-0000-0000-0000-000000000001', 'INTERVIEW', 'Source review and follow-up support interview progression.') $$,
  'outcome change appends a new version'
);
select is(
  (select count(*)::integer from public.interview_progression_reviews where application_id = '50000000-0000-0000-0000-000000000811'),
  2, 'outcome history is append-only'
);
select lives_ok(
  $$ select public.create_human_review('50000000-0000-0000-0000-000000000811', '20000000-0000-0000-0000-000000000001', 'PROCEED', 'INTERVIEW_COMPLETE', 'Interview activity was reviewed by the assigned manager.', 'MEDIUM', null) $$,
  'Hiring Manager can record the separate final decision after INTERVIEW'
);
select is(
  (select workflow_state from public.applications where id = '50000000-0000-0000-0000-000000000811'),
  'INTERVIEW_SELECTED', 'human outcome updates the separate workflow state'
);
select throws_ok(
  $$ update public.interview_progression_reviews set reason = 'mutated' where application_id = '50000000-0000-0000-0000-000000000811' $$,
  '55000', 'interview_progression_reviews is append-only',
  'outcome history cannot be updated'
);
select is(
  (select count(*)::integer from public.human_reviews where application_id = '50000000-0000-0000-0000-000000000811'),
  1, 'only the explicit post-interview final-decision action creates a human review'
);
select ok(
  not has_function_privilege('service_role', 'public.record_interview_progression(uuid,uuid,public.interview_progression_outcome,text)', 'EXECUTE'),
  'worker service role cannot write interview outcomes'
);

select * from finish();
rollback;

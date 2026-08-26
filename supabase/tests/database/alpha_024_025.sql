begin;

select plan(18);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$
    insert into public.jobs (id, title, department, raw_job_description, recruiter_id, hiring_manager_id)
    values (
      '10000000-0000-0000-0000-000000000097',
      'Alpha verification synthetic requisition',
      'Engineering',
      'Synthetic role used only for rollback-only HL-024 and HL-025 verification.',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003'
    )
  $$,
  'Hiring Manager can create a synthetic requisition'
);

select lives_ok(
  $$ select public.assign_requisition_approver(
    '10000000-0000-0000-0000-000000000097',
    '00000000-0000-0000-0000-000000000005'
  ) $$,
  'Hiring Manager can designate the Requisition Approver'
);

select public.create_scorecard_draft(
  '10000000-0000-0000-0000-000000000097',
  repeat('a', 64), 'human-authored', 'review-framework-manual-v1', 'HUMAN_AUTHORED',
  '[]'::jsonb,
  '[{"client_id":"alpha-criterion-1","name":"API 운영 경험","type":"REQUIRED","definition":"운영 환경에서 API를 개발하고 개선한 경험","accepted_evidence":["운영 API 사례"],"alternative_evidence":[],"evidence_fields":[{"field_name":"api_case","description":"운영 API 사례"}],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
) as scorecard_version_id \gset

select throws_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000097') $$,
  '55000', 'an approved scorecard is required before requisition submission',
  'Requisition submission is blocked until the Review Framework is approved'
);

select id, content_revision from public.scorecard_versions
where job_id = '10000000-0000-0000-0000-000000000097'
\gset scorecard_

select lives_ok(
  format(
    $$ select public.approve_scorecard('%s', 1, 'DRAFT', %s, 'Review Framework manually reviewed') $$,
    :'scorecard_version_id', :'scorecard_content_revision'
  ),
  'Assigned Hiring Manager can approve the Review Framework'
);

select lives_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000097') $$,
  'Assigned Hiring Manager can submit the requisition after criteria approval'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select is(
  (select requisition_status::text from public.jobs where id = '10000000-0000-0000-0000-000000000097'),
  'PENDING_APPROVAL',
  'Designated approver sees the requisition pending approval'
);
select is(
  (select count(*)::integer from public.scorecard_versions
   where job_id = '10000000-0000-0000-0000-000000000097'),
  0,
  'Designated approver cannot read the requisition Review Framework'
);
select is(
  (select count(*)::integer from public.applications
   where job_id = '10000000-0000-0000-0000-000000000097'),
  0,
  'Designated approver cannot read requisition applications'
);
select is(
  (select count(*)::integer from public.resume_files
   where application_id in (
     select id from public.applications where job_id = '10000000-0000-0000-0000-000000000097'
   )),
  0,
  'Designated approver cannot read requisition resume files'
);

select throws_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000097', 'RETURNED', '') $$,
  '22023', 'approval or return reason is required and must be at most 1000 characters',
  'Requisition return requires a reason'
);

select lives_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000097', 'RETURNED', '보강이 필요한 채용 요청입니다.') $$,
  'Designated approver can return the requisition with a reason'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000097') $$,
  'Assigned Hiring Manager can resubmit a returned requisition'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000097', 'APPROVED', '채용 요청과 평가 기준을 승인합니다.') $$,
  'Designated approver can approve the resubmitted requisition'
);

select throws_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000097', 'RETURNED', 'Stale second resolution') $$,
  '55000', 'only pending requisitions can be approved or returned',
  'Stale approver resolution is denied after the requisition is already resolved'
);
select is(
  (select count(*)::integer from public.requisition_status_history
   where job_id = '10000000-0000-0000-0000-000000000097'),
  4,
  'Stale resolution does not append another status-history event'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000097', 'APPROVED', 'Admin cannot approve') $$,
  '42501', 'only the designated requisition approver can resolve a requisition',
  'Admin cannot approve the requisition through the Admin role'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000097', 'APPROVED', 'Recruiter cannot approve') $$,
  '42501', 'only the designated requisition approver can resolve a requisition',
  'Recruiter cannot approve the requisition'
);
select throws_ok(
  $$ select public.create_scorecard_draft(
    '10000000-0000-0000-0000-000000000097', repeat('b', 64), 'human-authored',
    'review-framework-manual-v1', 'HUMAN_AUTHORED', '[]'::jsonb, '[]'::jsonb
  ) $$,
  '42501', 'not authorized to create scorecard draft',
  'Recruiter cannot create a Review Framework draft'
);

select * from finish();
rollback;

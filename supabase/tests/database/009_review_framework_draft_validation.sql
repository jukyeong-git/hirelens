begin;

select plan(4);

set local role postgres;
insert into public.jobs (id, title, department, raw_job_description, recruiter_id, hiring_manager_id)
values (
  '10000000-0000-0000-0000-000000000098',
  'Validation-only synthetic requisition',
  'Engineering',
  'Synthetic role used only to test Review Framework draft validation.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
insert into public.jobs (id, title, department, raw_job_description, recruiter_id, hiring_manager_id)
values (
  '10000000-0000-0000-0000-000000000096',
  'Malformed-validation synthetic requisition',
  'Engineering',
  'Synthetic role used only to reject malformed Review Framework criteria.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$
    select public.create_scorecard_draft(
      '10000000-0000-0000-0000-000000000098',
      repeat('a', 64), 'human-authored', 'review-framework-manual-v1', 'HUMAN_AUTHORED',
      '[]'::jsonb,
      '[{"client_id":"manual-1","name":"API 설계","type":"REQUIRED","definition":"서비스 API를 설계하고 운영한 경험","accepted_evidence":["API 설계 또는 운영 사례"],"alternative_evidence":[],"evidence_fields":[{"field_name":"api_case","description":"설계 또는 운영 사례"}],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
    )
  $$,
  'Assigned Hiring Manager can create a valid Review Framework draft'
);

select throws_ok(
  $$
    select public.create_scorecard_draft(
      '10000000-0000-0000-0000-000000000096',
      repeat('a', 64), 'human-authored', 'review-framework-manual-v1', 'HUMAN_AUTHORED',
      '[]'::jsonb,
      '[{"client_id":"bad-1","name":"Bad","type":"REQUIRED","definition":"Bad","accepted_evidence":[],"alternative_evidence":[],"evidence_fields":[],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
    )
  $$,
  '22023', 'invalid Review Framework criterion',
  'RPC rejects resume-assessable criteria without accepted evidence'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$
    select public.create_scorecard_draft(
      '10000000-0000-0000-0000-000000000001',
      repeat('a', 64), 'human-authored', 'review-framework-manual-v1', 'HUMAN_AUTHORED',
      '[]'::jsonb,
      '[{"client_id":"denied-1","name":"Denied","type":"REQUIRED","definition":"Denied","accepted_evidence":["case"],"alternative_evidence":[],"evidence_fields":[],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
    )
  $$,
  '42501', 'not authorized to create scorecard draft',
  'Recruiter cannot create an initial Review Framework draft'
);

select isnt_empty(
  $$ select pg_get_functiondef('public.create_scorecard_draft(uuid,text,text,text,text,jsonb,jsonb)'::regprocedure) $$,
  'Draft RPC remains installed'
);

select * from finish();
rollback;

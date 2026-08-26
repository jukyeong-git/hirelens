begin;

select plan(9);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

insert into public.jobs (
  id, title, department, hiring_need, raw_job_description, recruiter_id, hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000096', 'Confirmation Gate Engineer', 'Engineering',
  'Synthetic test need', 'Build reliable backend services with strong leadership.',
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'
);

select public.create_scorecard_draft(
  '10000000-0000-0000-0000-000000000096', repeat('b', 64),
  'review-framework-manual-v1', 'review-framework-manual-v1', 'HUMAN_AUTHORED',
  '[{"source_phrase":"strong leadership","ambiguity_note":"Leadership scope is unclear","ambiguity_status":"AMBIGUOUS","suggested_interview_question":null}]'::jsonb,
  '[{"client_id":"criterion-confirm-1","name":"Leadership scope","type":"PREFERRED","definition":"Led a delivery scope","accepted_evidence":["Led delivery"],"alternative_evidence":[],"partial_evidence_guidance":null,"resume_assessable":true,"evidence_fields":[],"source_phrase":"strong leadership","ambiguity_note":"Scope needs confirmation","ambiguity_status":"AMBIGUOUS","suggested_interview_question":null,"display_order":0}]'::jsonb
);

select set_config(
  'hirelens.confirm_version_id',
  (select id::text from public.scorecard_versions where job_id = '10000000-0000-0000-0000-000000000096'),
  true
);
select set_config(
  'hirelens.confirm_criterion_id',
  (select id::text from public.criteria where scorecard_version_id = current_setting('hirelens.confirm_version_id')::uuid),
  true
);
select set_config(
  'hirelens.confirm_revision',
  (select content_revision::text from public.scorecard_versions
   where id = current_setting('hirelens.confirm_version_id')::uuid),
  true
);

select throws_ok(
  format($$select public.approve_scorecard(%L, 1, 'DRAFT', %s, null)$$,
    current_setting('hirelens.confirm_version_id'), current_setting('hirelens.confirm_revision')),
  '22023', 'job description issues must be confirmed before approval',
  'hiring request is blocked before confirmations'
);

select lives_ok(
  format($$select public.confirm_scorecard_issue(%L, %s, 'JOB_DESCRIPTION', '0')$$,
    current_setting('hirelens.confirm_version_id'), current_setting('hirelens.confirm_revision')),
  'assigned Hiring Manager can confirm a job-description issue'
);

select is(
  (select confirmed_job_description_issue_keys from public.scorecard_versions
   where id = current_setting('hirelens.confirm_version_id')::uuid),
  '["0"]'::jsonb,
  'job-description confirmation is persisted'
);

select throws_ok(
  format($$select public.approve_scorecard(%L, 1, 'DRAFT', %s, null)$$,
    current_setting('hirelens.confirm_version_id'), current_setting('hirelens.confirm_revision')),
  '22023', 'evaluation criterion issues must be confirmed before approval',
  'hiring request remains blocked until evaluation criteria are confirmed'
);

select lives_ok(
  format($$select public.confirm_scorecard_issue(%L, %s, 'EVALUATION_CRITERION', %L)$$,
    current_setting('hirelens.confirm_version_id'), current_setting('hirelens.confirm_revision'),
    current_setting('hirelens.confirm_criterion_id')),
  'assigned Hiring Manager can confirm an evaluation-criterion issue'
);

select ok(
  (select confirmed_evaluation_criterion_ids ? current_setting('hirelens.confirm_criterion_id')
   from public.scorecard_versions where id = current_setting('hirelens.confirm_version_id')::uuid),
  'evaluation-criterion confirmation is persisted'
);

select lives_ok(
  format($$select public.approve_scorecard(%L, 1, 'DRAFT', %s, null)$$,
    current_setting('hirelens.confirm_version_id'), current_setting('hirelens.confirm_revision')),
  'hiring request succeeds without a free-text approval reason after all confirmations'
);

select is(
  (select status::text from public.scorecard_versions
   where id = current_setting('hirelens.confirm_version_id')::uuid),
  'APPROVED',
  'hiring request approves and fixes the evaluation criteria'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format($$select public.confirm_scorecard_issue(%L, %s, 'JOB_DESCRIPTION', '0')$$,
    current_setting('hirelens.confirm_version_id'), current_setting('hirelens.confirm_revision')),
  '42501', null,
  'assigned Recruiter cannot confirm Hiring Manager issues'
);

select * from finish();
rollback;

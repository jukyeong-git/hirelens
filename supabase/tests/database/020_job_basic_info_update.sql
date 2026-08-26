begin;

select plan(8);

set local role postgres;
insert into public.jobs (
  id, title, department, hiring_need, raw_job_description, recruiter_id, hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000096', 'Original title', 'Engineering',
  'Original reason', 'Original description',
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select public.create_scorecard_draft(
  '10000000-0000-0000-0000-000000000096', repeat('a', 64),
  'test-prompt', 'test-schema', 'HUMAN_AUTHORED',
  '[{"source_phrase":"Original","ambiguity_note":"Needs confirmation","suggested_interview_question":"Clarify","ambiguity_status":"AMBIGUOUS"}]'::jsonb,
  '[{"client_id":"criterion-1","name":"Backend experience","type":"REQUIRED","definition":"Backend delivery experience","accepted_evidence":["Project delivery"],"alternative_evidence":[],"partial_evidence_guidance":null,"resume_assessable":true,"evidence_fields":[],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
);

select set_config(
  'hirelens.basic_info_version_id',
  (select id::text from public.scorecard_versions where job_id = '10000000-0000-0000-0000-000000000096'),
  true
);
select public.confirm_scorecard_issue(
  current_setting('hirelens.basic_info_version_id')::uuid,
  (select content_revision from public.scorecard_versions where id = current_setting('hirelens.basic_info_version_id')::uuid),
  'JOB_DESCRIPTION', '0'
);
select set_config(
  'hirelens.basic_info_updated_at',
  (select updated_at::text from public.jobs where id = '10000000-0000-0000-0000-000000000096'),
  true
);

select lives_ok(
  $$select public.update_job_basic_info(
    '10000000-0000-0000-0000-000000000096',
    current_setting('hirelens.basic_info_updated_at')::timestamptz,
    'Updated title', 'Platform', 'Updated reason', 'Updated description',
    '00000000-0000-0000-0000-000000000002'
  )$$,
  'assigned Hiring Manager can update basic information'
);

select is(
  (select title || '|' || department || '|' || hiring_need || '|' || raw_job_description
   from public.jobs where id = '10000000-0000-0000-0000-000000000096'),
  'Updated title|Platform|Updated reason|Updated description',
  'basic information is persisted together'
);

select is(
  (select source_job_description_hash from public.scorecard_versions
   where id = current_setting('hirelens.basic_info_version_id')::uuid),
  encode(extensions.digest('Updated description', 'sha256'), 'hex'),
  'changed description refreshes the draft source hash'
);

select is(
  (select ambiguous_phrases from public.scorecard_versions
   where id = current_setting('hirelens.basic_info_version_id')::uuid),
  '[]'::jsonb,
  'changed description clears stale description confirmation items'
);

select is(
  (select confirmed_job_description_issue_keys from public.scorecard_versions
   where id = current_setting('hirelens.basic_info_version_id')::uuid),
  '[]'::jsonb,
  'changed description clears prior confirmations'
);

select throws_ok(
  $$select public.update_job_basic_info(
    '10000000-0000-0000-0000-000000000096',
    current_setting('hirelens.basic_info_updated_at')::timestamptz - interval '1 second',
    'Stale title', 'Platform', 'Reason', 'Description',
    '00000000-0000-0000-0000-000000000002'
  )$$,
  '40001', null,
  'stale basic information update is rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.update_job_basic_info(
    '10000000-0000-0000-0000-000000000096',
    (select updated_at from public.jobs where id = '10000000-0000-0000-0000-000000000096'),
    'Recruiter edit', 'Platform', 'Reason', 'Description',
    '00000000-0000-0000-0000-000000000002'
  )$$,
  '42501', null,
  'Recruiter cannot update Hiring Manager basic information'
);

set local role postgres;
update public.scorecard_versions
set status = 'APPROVED'::public.scorecard_status,
    approved_by = '00000000-0000-0000-0000-000000000003',
    approved_at = now()
where id = current_setting('hirelens.basic_info_version_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.update_job_basic_info(
    '10000000-0000-0000-0000-000000000096',
    (select updated_at from public.jobs where id = '10000000-0000-0000-0000-000000000096'),
    'Late edit', 'Platform', 'Reason', 'Description',
    '00000000-0000-0000-0000-000000000002'
  )$$,
  '55000', null,
  'basic information is immutable after the hiring request'
);

select * from finish();
rollback;

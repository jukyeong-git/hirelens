begin;

select plan(8);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

insert into public.jobs (
  id, title, department, hiring_need, raw_job_description, recruiter_id, hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000097', 'Draft Update Engineer', 'Engineering',
  'Synthetic test need', 'Build reliable backend services.',
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'
);

select public.create_scorecard_draft(
  '10000000-0000-0000-0000-000000000097', repeat('a', 64),
  'review-framework-manual-v1', 'review-framework-manual-v1', 'HUMAN_AUTHORED', '[]'::jsonb,
  '[{"client_id":"criterion-1","name":"Backend experience","type":"REQUIRED","definition":"Backend delivery experience","accepted_evidence":["Project delivery"],"alternative_evidence":[],"partial_evidence_guidance":null,"resume_assessable":true,"evidence_fields":[],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
);

select set_config(
  'hirelens.update_version_id',
  (select id::text from public.scorecard_versions where job_id = '10000000-0000-0000-0000-000000000097'),
  true
);
select set_config(
  'hirelens.update_revision',
  (select content_revision::text from public.scorecard_versions where id = current_setting('hirelens.update_version_id')::uuid),
  true
);

select lives_ok(
  format(
    $$select public.update_scorecard_draft(%L, 1, 'DRAFT', %s, null, '[]'::jsonb,
      '[{"client_id":"criterion-1","name":"Production backend experience","type":"REQUIRED","definition":"Delivered backend services in production","accepted_evidence":["Production project delivery"],"alternative_evidence":[],"partial_evidence_guidance":"Scope is unclear","resume_assessable":true,"evidence_fields":[],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb)$$,
    current_setting('hirelens.update_version_id'), current_setting('hirelens.update_revision')
  ),
  'assigned Hiring Manager can update a saved draft'
);

select is(
  (select name from public.criteria where scorecard_version_id = current_setting('hirelens.update_version_id')::uuid),
  'Production backend experience',
  'draft criterion content is replaced'
);

select ok(
  (select content_revision > current_setting('hirelens.update_revision')::integer
   from public.scorecard_versions where id = current_setting('hirelens.update_version_id')::uuid),
  'draft content revision advances'
);

select ok(
  exists (select 1 from public.audit_events where event_type = 'SCORECARD_DRAFT_UPDATED'
    and version_ref = current_setting('hirelens.update_version_id')),
  'draft update appends an audit event'
);

select is(
  (select reason from public.audit_events where event_type = 'SCORECARD_DRAFT_UPDATED'
    and version_ref = current_setting('hirelens.update_version_id')
    order by created_at desc limit 1),
  null::text,
  'draft update audit event does not store a user-entered reason'
);

select throws_ok(
  format(
    $$select public.update_scorecard_draft(%L, 1, 'DRAFT', %s, null, '[]'::jsonb, '[]'::jsonb)$$,
    current_setting('hirelens.update_version_id'), current_setting('hirelens.update_revision')
  ),
  '40001', null,
  'stale draft update is rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format(
    $$select public.update_scorecard_draft(%L, 1, 'DRAFT', %s, null, '[]'::jsonb, '[]'::jsonb)$$,
    current_setting('hirelens.update_version_id'),
    (select content_revision from public.scorecard_versions where id = current_setting('hirelens.update_version_id')::uuid)
  ),
  '42501', null,
  'assigned Recruiter cannot update the Review Framework draft'
);

reset role;
update public.scorecard_versions
set status = 'APPROVED'::public.scorecard_status,
    approved_by = '00000000-0000-0000-0000-000000000003',
    approved_at = now()
where id = current_setting('hirelens.update_version_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  format(
    $$select public.update_scorecard_draft(%L, 1, 'APPROVED', %s, null, '[]'::jsonb, '[]'::jsonb)$$,
    current_setting('hirelens.update_version_id'),
    (select content_revision from public.scorecard_versions where id = current_setting('hirelens.update_version_id')::uuid)
  ),
  '55000', null,
  'approved Review Framework remains immutable'
);

select * from finish();
rollback;

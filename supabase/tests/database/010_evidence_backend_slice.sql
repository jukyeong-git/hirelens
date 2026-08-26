begin;
select plan(26);

set local role postgres;
update public.criteria
set partial_evidence_guidance = '직접 책임 범위는 확인되지만 운영 규모가 명시되지 않은 경우'
where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  and display_order = 1;
update public.scorecard_versions set status = 'APPROVED', approved_by = '00000000-0000-0000-0000-000000000001', approved_at = now() where id = '20000000-0000-0000-0000-000000000001' and status = 'DRAFT';
insert into public.candidates (id, demo_label) values ('40000000-0000-0000-0000-000000000801', 'Synthetic evidence fixture');
insert into public.applications (id, candidate_id, job_id, source, workflow_state) values ('50000000-0000-0000-0000-000000000801', '40000000-0000-0000-0000-000000000801', '10000000-0000-0000-0000-000000000001', 'TEST', 'NEW');
insert into public.resume_files (id, application_id, storage_path, original_filename, mime_type, byte_size, sha256, intake_status, synthetic_or_anonymized_attested, attested_by, attested_at) values ('60000000-0000-0000-0000-000000000801', '50000000-0000-0000-0000-000000000801', 'opaque/evidence.pdf', 'synthetic.pdf', 'application/pdf', 100, repeat('a', 64), 'UPLOADED', true, '00000000-0000-0000-0000-000000000001', now());
insert into public.processing_runs (id, application_id, resume_file_id, scorecard_version_id, pipeline_version) values ('70000000-0000-0000-0000-000000000801', '50000000-0000-0000-0000-000000000801', '60000000-0000-0000-0000-000000000801', '20000000-0000-0000-0000-000000000001', 'pdf-v1');

select is((select pipeline_version from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'), 'evidence-pipeline-v1', 'new runs use the versioned evidence pipeline');
select matches((select idempotency_key from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'), '^[0-9a-f]{64}$', 'run has a source-bound idempotency key');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.claim_evidence_processing_run('70000000-0000-0000-0000-000000000801', 300) $$, '42501', 'permission denied for function claim_evidence_processing_run', 'browser role cannot claim evidence work');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select public.claim_evidence_processing_run('70000000-0000-0000-0000-000000000801', 300) $$, 'worker claims evidence run');
select is((select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'), 'EXTRACTING', 'claim enters EXTRACTING');
select lives_ok($$
  select public.complete_resume_extraction_for_evidence('70000000-0000-0000-0000-000000000801', jsonb_build_array(jsonb_build_object('page_number', 1, 'raw_text', 'Built reliable backend services.', 'normalized_text', 'Built reliable backend services.', 'raw_text_sha256', repeat('b', 64), 'normalized_text_sha256', repeat('c', 64))), (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'))
$$, 'page extraction transitions to analysis');
select is((select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'), 'ANALYZING', 'extraction enters ANALYZING');
select ok(jsonb_array_length(public.load_evidence_analysis_context('70000000-0000-0000-0000-000000000801', (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801')) -> 'criteria') > 0, 'context loads human-approved criteria');
select ok(
  (public.load_evidence_analysis_context('70000000-0000-0000-0000-000000000801', (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801')) -> 'criteria' -> 0) ? 'name',
  'analysis context includes the approved criterion name'
);
select is(
  public.load_evidence_analysis_context('70000000-0000-0000-0000-000000000801', (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801')) -> 'criteria' -> 0 ->> 'partial_evidence_guidance',
  '직접 책임 범위는 확인되지만 운영 규모가 명시되지 않은 경우',
  'analysis context includes human-authored partial-evidence guidance'
);
select ok(
  jsonb_typeof(public.load_evidence_analysis_context('70000000-0000-0000-0000-000000000801', (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801')) -> 'criteria' -> 0 -> 'evidence_fields') = 'array',
  'analysis context includes named extraction fields'
);
select lives_ok($$ select public.mark_evidence_validating('70000000-0000-0000-0000-000000000801', 'evidence-extraction-prompt-v1', 'evidence-extraction-schema-v1', 'mock-model', 'resp_mock', 100, 20, 120, 300, 25, (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801')) $$, 'usage and contract metadata enter validation');
select throws_ok($$
  select public.persist_validated_evidence('70000000-0000-0000-0000-000000000801', (
    select jsonb_agg(jsonb_build_object(
      'criterion_id', criterion.id,
      'status', case when criterion.resume_assessable then 'SUPPORTED' else 'HUMAN_ONLY' end,
      'evidence', case when criterion.resume_assessable then jsonb_build_array(jsonb_build_object('page_number', 1, 'exact_quote', 'Built reliable backend services.', 'source_page_hash', repeat('c', 64), 'unexpected', true)) else '[]'::jsonb end,
      'interpretation', 'Synthetic validation test.', 'uncertainty', null, 'suggested_interview_question', null
    ) order by criterion.display_order) from public.criteria criterion where criterion.scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  ), (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'))
$$, '23514', 'new row for relation "evidence_items" violates check constraint "evidence_items_source_quote_hash_required"', 'missing quote hash cannot persist through the worker RPC');
select lives_ok($$
  select public.persist_validated_evidence('70000000-0000-0000-0000-000000000801', (
    select jsonb_agg(jsonb_build_object(
      'criterion_id', criterion.id,
      'status', case when criterion.resume_assessable then 'SUPPORTED' else 'HUMAN_ONLY' end,
      'evidence', case when criterion.resume_assessable then jsonb_build_array(jsonb_build_object('page_number', 1, 'exact_quote', 'Built reliable backend services.', 'source_quote_hash', encode(extensions.digest('Built reliable backend services.', 'sha256'), 'hex'), 'source_page_hash', repeat('c', 64))) else '[]'::jsonb end,
      'interpretation', case when criterion.resume_assessable then 'Direct evidence is stated.' else 'Human assessment is required.' end,
      'uncertainty', null, 'suggested_interview_question', null
    ) order by criterion.display_order) from public.criteria criterion where criterion.scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  ), (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'))
$$, 'validated exact quote persists transactionally');
select is((select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'), 'COMPLETED', 'validated run completes');
select is((select count(*)::integer from public.evidence_items where processing_run_id = '70000000-0000-0000-0000-000000000801'), (select count(*)::integer from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001'), 'one evidence result persists per criterion');
select lives_ok($$ select public.persist_validated_evidence('70000000-0000-0000-0000-000000000801', '[]'::jsonb, 'ffffffff-ffff-ffff-ffff-ffffffffffff') $$, 'duplicate completion is idempotent');
select is((select count(*)::integer from public.evidence_items where processing_run_id = '70000000-0000-0000-0000-000000000801'), (select count(*)::integer from public.criteria where scorecard_version_id = '20000000-0000-0000-0000-000000000001'), 'duplicate completion does not duplicate evidence');

set local role postgres;
update public.processing_runs
set status = 'ANALYZING', completed_at = null, attempt_count = 1,
  lease_token = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  lease_expires_at = now() + interval '5 minutes'
where id = '70000000-0000-0000-0000-000000000801';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select public.record_evidence_processing_failure('70000000-0000-0000-0000-000000000801', 'AI_RATE_LIMIT', true, false, 'AI_RATE_LIMIT', (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801')) $$, 'first transient failure schedules one retry');
select is((select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'), 'RETRY_PENDING', 'retry is explicit');
select lives_ok($$ select public.claim_evidence_processing_run('70000000-0000-0000-0000-000000000801', 300) $$, 'single retry is claimed');
select lives_ok($$ select public.record_evidence_processing_failure('70000000-0000-0000-0000-000000000801', 'AI_RATE_LIMIT', true, false, 'AI_RATE_LIMIT', (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000801')) $$, 'second failure exhausts attempts');
select is((select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000801'), 'FAILED', 'two total attempts is terminal');
select is((select count(*)::integer from public.notifications notification join public.profiles profile on profile.id = notification.recipient_id where notification.aggregate_id = '50000000-0000-0000-0000-000000000801' and notification.event_type = 'PROCESSING_FAILED' and profile.role = 'ADMIN'), (select count(*)::integer from public.profiles where role = 'ADMIN'), 'terminal failure notifies every Admin');
select is((select count(*)::integer from public.notifications notification join public.profiles profile on profile.id = notification.recipient_id where notification.aggregate_id = '50000000-0000-0000-0000-000000000801' and profile.role <> 'ADMIN'), 0, 'processing failure notification has no non-Admin recipient');
select ok(not has_table_privilege('service_role', 'public.human_reviews', 'INSERT') and not has_function_privilege('service_role', 'public.create_human_review(uuid,uuid,public.human_decision,text,text,public.review_confidence,text)', 'EXECUTE'), 'worker has no human decision path');

select * from finish();
rollback;

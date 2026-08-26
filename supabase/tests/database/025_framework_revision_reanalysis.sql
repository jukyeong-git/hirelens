begin;

select plan(16);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_framework_revision_draft(uuid,integer,uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated users may invoke the guarded revision-draft RPC'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.create_framework_revision_draft(uuid,integer,uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'worker credentials cannot create framework drafts'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.enqueue_framework_reanalysis(uuid,text)',
    'EXECUTE'
  ),
  'worker credentials cannot request framework reanalysis'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);

select is(
  public.criterion_revision_context(
    '10000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000021'
  )->>'finding_lineage_id',
  '22000000-0000-0000-0000-000000000021',
  'revision context is bound to the review-required finding'
);
select ok(
  jsonb_array_length(
    public.criterion_revision_context(
      '10000000-0000-0000-0000-000000000002',
      '22000000-0000-0000-0000-000000000021'
    )->'mismatch_quotes'
  ) > 0,
  'revision context includes confirmed mismatch excerpts without candidate identifiers'
);

select set_config(
  'hirelens.framework_revision_id',
  public.create_framework_revision_draft(
    '20000000-0000-0000-0000-000000000002',
    1,
    '22000000-0000-0000-0000-000000000021',
    'Tighten direct evidence after confirmed interview mismatch',
    'framework-revision-prompt-v1',
    'framework-revision-schema-v1',
    'synthetic-test-model',
    '[
      {"client_id":"seed-platform-criterion-1","name":"Platform operations ownership","type":"REQUIRED","definition":"Owned production platform operations","accepted_evidence":["Production responsibility and outcome"],"alternative_evidence":[],"excluded_evidence":["Technology mention without production responsibility"],"partial_evidence_guidance":"Tool use without responsibility is partial","resume_assessable":true,"evidence_fields":[{"field_name":"case","description":"Production responsibility and outcome"}],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0},
      {"client_id":"seed-platform-criterion-2","name":"Incident response ownership","type":"PREFERRED","definition":"Experience owning a production incident response.","accepted_evidence":["Production incident response example"],"alternative_evidence":[],"excluded_evidence":[],"partial_evidence_guidance":null,"resume_assessable":true,"evidence_fields":[{"field_name":"incident","description":"Production incident response example"}],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":1}
    ]'::jsonb
  )::text,
  true
);

select is(
  (select status::text || ':' || version_number::text
   from public.scorecard_versions
   where id = current_setting('hirelens.framework_revision_id')::uuid),
  'DRAFT:2',
  'AI-assisted revision is saved only as a new draft'
);
select is(
  (select prompt_version || ':' || schema_version
   from public.scorecard_versions
   where id = current_setting('hirelens.framework_revision_id')::uuid),
  'framework-revision-prompt-v1:framework-revision-schema-v1',
  'revision draft retains AI contract provenance'
);
select is(
  (select excluded_evidence->>0
   from public.criteria
   where scorecard_version_id = current_setting('hirelens.framework_revision_id')::uuid
     and lineage_id = '22000000-0000-0000-0000-000000000021'),
  'Technology mention without production responsibility',
  'explicit excluded evidence persists on the revised criterion'
);
select is(
  (select status::text from public.scorecard_versions
   where id = '20000000-0000-0000-0000-000000000002'),
  'APPROVED',
  'saving the proposal does not change the active approved version'
);

select set_config(
  'hirelens.human_review_count',
  (select count(*)::text from public.human_reviews
   where application_id in (
     select id from public.applications
     where job_id = '10000000-0000-0000-0000-000000000002'
   )),
  true
);
select set_config(
  'hirelens.progression_review_count',
  (select count(*)::text from public.interview_progression_reviews
   where application_id in (
     select id from public.applications
     where job_id = '10000000-0000-0000-0000-000000000002'
   )),
  true
);
select set_config(
  'hirelens.outcome_count',
  (select count(*)::text from public.interview_observation_sessions
   where application_id in (
     select id from public.applications
     where job_id = '10000000-0000-0000-0000-000000000002'
   )),
  true
);

select public.approve_scorecard(
  current_setting('hirelens.framework_revision_id')::uuid,
  2,
  'DRAFT',
  (select content_revision from public.scorecard_versions
   where id = current_setting('hirelens.framework_revision_id')::uuid),
  null
);

select lives_ok(
  $$select public.enqueue_framework_reanalysis(
    '10000000-0000-0000-0000-000000000002',
    'evidence-pipeline-v1'
  )$$,
  'assigned Hiring Manager can request approved-version reanalysis'
);
select is(
  (select count(*)::integer from public.processing_runs
   where scorecard_version_id = current_setting('hirelens.framework_revision_id')::uuid),
  (select count(*)::integer
   from public.resume_files file
   join public.applications application on application.id = file.application_id
   where application.job_id = '10000000-0000-0000-0000-000000000002'
     and file.intake_status = 'UPLOADED'),
  'reanalysis creates one version-bound run per uploaded resume'
);
select ok(
  not exists (
    select 1 from public.processing_runs run
    where run.scorecard_version_id = current_setting('hirelens.framework_revision_id')::uuid
      and not exists (
        select 1 from public.resume_pages page where page.processing_run_id = run.id
      )
  ),
  'reanalysis copies existing page-aware source text into each new run'
);
select ok(
  current_setting('hirelens.human_review_count')::integer = (
    select count(*) from public.human_reviews
    where application_id in (
      select id from public.applications
      where job_id = '10000000-0000-0000-0000-000000000002'
    )
  )
  and current_setting('hirelens.progression_review_count')::integer = (
    select count(*) from public.interview_progression_reviews
    where application_id in (
      select id from public.applications
      where job_id = '10000000-0000-0000-0000-000000000002'
    )
  )
  and current_setting('hirelens.outcome_count')::integer = (
    select count(*) from public.interview_observation_sessions
    where application_id in (
      select id from public.applications
      where job_id = '10000000-0000-0000-0000-000000000002'
    )
  ),
  'reanalysis does not change any human review, progression, or outcome history'
);
select is(
  jsonb_array_length(
    public.framework_revision_comparison(
      '10000000-0000-0000-0000-000000000002'
    )->'versions'
  ),
  2,
  'comparison returns the prior and active approved versions'
);
select is(
  jsonb_typeof(
    public.framework_revision_comparison(
      '10000000-0000-0000-0000-000000000002'
    )->'application_changes'
  ),
  'array',
  'comparison exposes per-application criterion status changes'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.enqueue_framework_reanalysis(
    '10000000-0000-0000-0000-000000000002',
    'evidence-pipeline-v1'
  )$$,
  '42501',
  'assigned Hiring Manager or Admin required',
  'Recruiter cannot request framework reanalysis'
);

select * from finish();
rollback;

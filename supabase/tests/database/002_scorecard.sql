begin;

select plan(14);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*)::integer from public.scorecard_versions),
  1,
  'Admin can read all scorecard versions'
);

select is(
  (select count(*)::integer from public.criteria),
  2,
  'Admin can read all scorecard criteria'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*)::integer from public.scorecard_versions),
  1,
  'Recruiter can read the assigned Job scorecard'
);

select lives_ok(
  $$
    select public.create_scorecard_draft(
      '10000000-0000-0000-0000-000000000002',
      '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261',
      'scorecard-draft-prompt-v1',
      'scorecard-draft-schema-v1',
      'gpt-5.6-luna',
      '[]'::jsonb,
      '[{
        "client_id": "criterion-test",
        "name": "테스트 기준",
        "type": "REQUIRED",
        "definition": "합성 테스트 기준",
        "accepted_evidence": ["합성 근거"],
        "alternative_evidence": [],
        "evidence_fields": [],
        "resume_assessable": true,
        "source_phrase": "reliable backend services",
        "ambiguity_note": null,
        "ambiguity_status": "CLEAR",
        "suggested_interview_question": null,
        "display_order": 0
      }]'::jsonb
    )
  $$,
  'Recruiter can create a validated scorecard draft for an owned Job'
);

select is(
  (select count(*)::integer from public.scorecard_versions),
  2,
  'Initial scorecard draft is created only for a Job without a version'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',
  true
);

select is(
  (select count(*)::integer from public.scorecard_versions),
  1,
  'Assigned Hiring Manager reads only the assigned Job scorecard'
);

select is(
  (select count(*)::integer from public.scorecard_versions where job_id = '10000000-0000-0000-0000-000000000002'),
  0,
  'Hiring Manager cannot read an unassigned Job scorecard'
);

select throws_ok(
  $$
    select public.create_scorecard_draft(
      '10000000-0000-0000-0000-000000000001',
      '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261',
      'scorecard-draft-prompt-v1',
      'scorecard-draft-schema-v1',
      'gpt-5.6-luna',
      '[]'::jsonb,
      '[{"client_id":"criterion-hm","name":"불가","type":"REQUIRED","definition":"불가","accepted_evidence":["불가"],"alternative_evidence":[],"evidence_fields":[],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
    )
  $$,
  '42501',
  'not authorized to create scorecard draft',
  'Hiring Manager cannot create a scorecard draft'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);

select throws_ok(
  $$
    insert into public.scorecard_versions (
      job_id,
      version_number,
      source_job_description_hash,
      prompt_version,
      schema_version,
      model_id,
      created_by
    ) values (
      '10000000-0000-0000-0000-000000000001',
      99,
      '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261',
      'test',
      'test',
      'test',
      '00000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  'permission denied for table scorecard_versions',
  'Application roles cannot insert scorecard versions directly'
);

select throws_ok(
  $$
    update public.scorecard_versions
    set model_id = 'tampered'
    where id = '20000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table scorecard_versions',
  'Scorecard versions cannot be updated directly'
);

select throws_ok(
  $$
    delete from public.criteria
    where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table criteria',
  'Scorecard criteria cannot be deleted directly'
);

set local role postgres;

select throws_ok(
  $$
    update public.jobs
    set status = 'READY_FOR_INTAKE'
    where id = '10000000-0000-0000-0000-000000000002'
  $$,
  '23514',
  'job requires an approved scorecard before intake',
  'Job intake is blocked without an approved scorecard'
);

set local role authenticated;

select ok(
  exists (
    select 1
    from public.audit_events
    where event_type = 'SCORECARD_DRAFT_CREATED'
      and aggregate_id = '10000000-0000-0000-0000-000000000001'
      and safe_metadata ? 'source_job_description_hash'
  ),
  'Scorecard draft creation writes safe audit metadata'
);

select ok(
  not exists (
    select 1
    from public.audit_events
    where event_type = 'SCORECARD_DRAFT_CREATED'
      and safe_metadata::text like '%Build and operate reliable backend services%'
  ),
  'Scorecard audit metadata excludes raw job description text'
);

select * from finish();
rollback;

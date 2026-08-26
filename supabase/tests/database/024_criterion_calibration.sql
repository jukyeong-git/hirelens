begin;

select plan(12);

select ok(
  has_function_privilege(
    'authenticated',
    'public.criterion_calibration_summary(uuid)',
    'EXECUTE'
  ),
  'authenticated users may invoke the guarded calibration summary'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.criterion_calibration_summary(uuid)',
    'EXECUTE'
  ),
  'worker credentials cannot access hiring calibration diagnostics'
);
select ok(
  to_regprocedure('public.install_criterion_calibration_demo_fixture()') is null,
  'no runtime identity can install synthetic human observations or decisions'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

insert into public.jobs (
  id, title, department, hiring_need, raw_job_description, recruiter_id, hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000094',
  'Calibration Summary Engineer',
  'Engineering',
  'Synthetic calibration summary',
  'Operate production platforms.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

select set_config(
  'hirelens.calibration_scorecard_id',
  public.create_scorecard_draft(
    '10000000-0000-0000-0000-000000000094',
    repeat('d', 64),
    'review-framework-manual-v1',
    'review-framework-manual-v1',
    'HUMAN_AUTHORED',
    '[]'::jsonb,
    '[
      {"client_id":"criterion-1","name":"Kubernetes operations","type":"REQUIRED","definition":"Owned production operations","accepted_evidence":["Production operations"],"alternative_evidence":[],"partial_evidence_guidance":"Learning-only work is partial","resume_assessable":true,"evidence_fields":[],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0},
      {"client_id":"criterion-2","name":"Incident response","type":"PREFERRED","definition":"Handled production incidents","accepted_evidence":["Incident response"],"alternative_evidence":[],"partial_evidence_guidance":null,"resume_assessable":true,"evidence_fields":[],"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":1}
    ]'::jsonb
  )::text,
  true
);
select set_config(
  'hirelens.calibration_content_revision',
  (select content_revision::text from public.scorecard_versions
   where id = current_setting('hirelens.calibration_scorecard_id')::uuid),
  true
);
select public.approve_scorecard(
  current_setting('hirelens.calibration_scorecard_id')::uuid,
  1,
  'DRAFT',
  current_setting('hirelens.calibration_content_revision')::integer,
  null
);

select set_config(
  'hirelens.calibration_criterion_1',
  (select id::text from public.criteria
   where scorecard_version_id = current_setting('hirelens.calibration_scorecard_id')::uuid
   order by display_order limit 1),
  true
);
select set_config(
  'hirelens.calibration_criterion_2',
  (select id::text from public.criteria
   where scorecard_version_id = current_setting('hirelens.calibration_scorecard_id')::uuid
   order by display_order offset 1 limit 1),
  true
);

reset role;
do $$
declare
  ordinal integer;
  candidate_id uuid;
  application_id uuid;
  resume_file_id uuid;
  run_id uuid;
  page_id uuid;
  session_id uuid;
  criterion_1 uuid := current_setting('hirelens.calibration_criterion_1')::uuid;
  criterion_2 uuid := current_setting('hirelens.calibration_criterion_2')::uuid;
  scorecard_id uuid := current_setting('hirelens.calibration_scorecard_id')::uuid;
  criterion_1_lineage uuid;
  criterion_2_lineage uuid;
begin
  select lineage_id into criterion_1_lineage from public.criteria where id = criterion_1;
  select lineage_id into criterion_2_lineage from public.criteria where id = criterion_2;

  for ordinal in 1..7 loop
    candidate_id := gen_random_uuid();
    application_id := gen_random_uuid();
    resume_file_id := gen_random_uuid();
    run_id := gen_random_uuid();
    page_id := gen_random_uuid();
    session_id := gen_random_uuid();

    insert into public.candidates (id, demo_label)
    values (candidate_id, 'Synthetic Calibration Candidate ' || ordinal);
    insert into public.applications (id, candidate_id, job_id, workflow_state)
    values (
      application_id,
      candidate_id,
      '10000000-0000-0000-0000-000000000094',
      'INTERVIEW_COMPLETED'
    );
    insert into public.resume_files (
      id, application_id, storage_path, original_filename, mime_type, byte_size,
      sha256, intake_status, synthetic_or_anonymized_attested, attested_by, attested_at
    ) values (
      resume_file_id,
      application_id,
      'calibration/' || resume_file_id || '.pdf',
      'synthetic-' || ordinal || '.pdf',
      'application/pdf',
      100,
      repeat('e', 64),
      'UPLOADED',
      true,
      '00000000-0000-0000-0000-000000000002',
      now()
    );
    insert into public.processing_runs (
      id, application_id, resume_file_id, scorecard_version_id, pipeline_version,
      status, attempt_count, completed_at
    ) values (
      run_id,
      application_id,
      resume_file_id,
      scorecard_id,
      'calibration-test-v1',
      'COMPLETED',
      1,
      now()
    );
    insert into public.resume_pages (
      id, resume_file_id, processing_run_id, page_number, raw_text,
      normalized_text, raw_text_sha256, normalized_text_sha256
    ) values (
      page_id,
      resume_file_id,
      run_id,
      1,
      'Synthetic production evidence',
      'Synthetic production evidence',
      repeat('f', 64),
      repeat('f', 64)
    );
    insert into public.evidence_items (
      processing_run_id, criterion_id, status, source_ordinal, resume_page_id,
      exact_quote, interpretation, uncertainty, source_quote_hash, source_page_hash
    ) values
      (
        run_id, criterion_1, 'SUPPORTED', 1, page_id,
        'Synthetic production evidence', 'Synthetic interpretation', 'LOW',
        repeat('a', 64), repeat('f', 64)
      ),
      (
        run_id, criterion_2, 'SUPPORTED', 1, page_id,
        'Synthetic production evidence', 'Synthetic interpretation', 'LOW',
        repeat('a', 64), repeat('f', 64)
      );

    insert into public.interview_observation_sessions (
      id, application_id, scorecard_version_id, reviewer_id
    ) values (
      session_id,
      application_id,
      scorecard_id,
      '00000000-0000-0000-0000-000000000003'
    );
    insert into public.interview_observations (
      interview_observation_session_id, application_id, criterion_id,
      criterion_lineage_id, verdict, weakness_type, note, source,
      ai_draft_accepted, confirmed_at, observer_id
    ) values
      (
        session_id,
        application_id,
        criterion_1,
        criterion_1_lineage,
        (
          case when ordinal in (1, 2, 3, 4, 6, 7) then 'WEAKER' else 'MATCHED' end
        )::public.interview_criterion_verdict,
        case
          when ordinal in (1, 2, 3, 4, 7) then 'LEVEL_INSUFFICIENT'
          when ordinal = 6 then 'FALSE_CLAIM'
          else null
        end::public.interview_weakness_type,
        null,
        (
          case when ordinal = 7 then 'TRANSCRIPT' else 'FORM' end
        )::public.interview_observation_source,
        case when ordinal = 7 then false else null end,
        case when ordinal = 7 then null else now() end,
        '00000000-0000-0000-0000-000000000003'
      ),
      (
        session_id,
        application_id,
        criterion_2,
        criterion_2_lineage,
        (
          case when ordinal in (1, 2) then 'WEAKER' else 'MATCHED' end
        )::public.interview_criterion_verdict,
        (
          case when ordinal in (1, 2) then 'LEVEL_INSUFFICIENT' else null end
        )::public.interview_weakness_type,
        null,
        'FORM',
        null,
        now(),
        '00000000-0000-0000-0000-000000000003'
      );
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select * from public.criterion_calibration_summary('10000000-0000-0000-0000-000000000094')$$,
  '42501',
  'assigned Hiring Manager or Admin required',
  'Recruiter cannot read calibration diagnostics'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is(
  (select status from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_1')::uuid),
  'REVIEW_REQUIRED',
  'four eligible mismatches trigger review'
);
select is(
  (select supported_observations::integer from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_1')::uuid),
  5,
  'false claims and unconfirmed observations are excluded from the denominator'
);
select is(
  (select level_insufficient_count::integer from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_1')::uuid),
  4,
  'unconfirmed mismatch is excluded from the numerator'
);
select is(
  (select mismatch_ratio from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_1')::uuid),
  0.8000::numeric,
  'eligible mismatch ratio is deterministic'
);
select is(
  (select false_claim_excluded_count::integer from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_1')::uuid),
  1,
  'false claims remain visible as an excluded count'
);
select is(
  (select confirmed_observation_count::integer from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_1')::uuid),
  6,
  'unconfirmed transcript observations do not enter confirmed counts'
);
select is(
  (select status from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_2')::uuid),
  'OBSERVING',
  'fewer than three mismatches remains observing'
);
select is(
  (select level_insufficient_count::integer from public.criterion_calibration_summary(
    '10000000-0000-0000-0000-000000000094'
  ) where criterion_id = current_setting('hirelens.calibration_criterion_2')::uuid),
  2,
  'observing criteria expose their current mismatch count'
);

select * from finish();
rollback;

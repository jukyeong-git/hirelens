begin;

select plan(16);

select ok(
  has_function_privilege(
    'authenticated',
    'public.record_post_interview_review(uuid,uuid,jsonb,text,public.human_decision,text,text,public.review_confidence,text)',
    'EXECUTE'
  ),
  'authenticated users may invoke the guarded post-interview RPC'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.record_post_interview_review(uuid,uuid,jsonb,text,public.human_decision,text,text,public.review_confidence,text)',
    'EXECUTE'
  ),
  'worker credentials cannot record interview observations or decisions'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.interview_observation_sessions',
    'INSERT'
  ),
  'worker credentials cannot insert observation sessions'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.interview_observations',
    'INSERT'
  ),
  'worker credentials cannot insert criterion observations'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

insert into public.jobs (
  id, title, department, hiring_need, raw_job_description, recruiter_id, hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000095',
  'Interview Observation Engineer',
  'Engineering',
  'Synthetic observation test',
  'Operate production services.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

select set_config(
  'hirelens.observation_scorecard_id',
  public.create_scorecard_draft(
    '10000000-0000-0000-0000-000000000095',
    repeat('c', 64),
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
  'hirelens.observation_content_revision',
  (select content_revision::text from public.scorecard_versions
   where id = current_setting('hirelens.observation_scorecard_id')::uuid),
  true
);
select public.approve_scorecard(
  current_setting('hirelens.observation_scorecard_id')::uuid,
  1,
  'DRAFT',
  current_setting('hirelens.observation_content_revision')::integer,
  null
);

reset role;
insert into public.candidates (id, demo_label)
values ('40000000-0000-0000-0000-000000000095', 'Synthetic Observation Candidate');
insert into public.applications (id, candidate_id, job_id, workflow_state)
values (
  '50000000-0000-0000-0000-000000000095',
  '40000000-0000-0000-0000-000000000095',
  '10000000-0000-0000-0000-000000000095',
  'MANAGER_REVIEW_REQUESTED'
);
insert into public.review_assignments (
  id, application_id, assigned_to, assigned_by, status
) values (
  '60000000-0000-0000-0000-000000000095',
  '50000000-0000-0000-0000-000000000095',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'ACTIVE'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select public.record_interview_progression(
  '50000000-0000-0000-0000-000000000095',
  current_setting('hirelens.observation_scorecard_id')::uuid,
  'INTERVIEW',
  'Proceed to synthetic interview'
);

select set_config(
  'hirelens.observation_criterion_1',
  (select id::text from public.criteria
   where scorecard_version_id = current_setting('hirelens.observation_scorecard_id')::uuid
   order by display_order limit 1),
  true
);
select set_config(
  'hirelens.observation_criterion_2',
  (select id::text from public.criteria
   where scorecard_version_id = current_setting('hirelens.observation_scorecard_id')::uuid
   order by display_order offset 1 limit 1),
  true
);
select set_config(
  'hirelens.valid_observations',
  jsonb_build_array(
    jsonb_build_object(
      'criterion_id', current_setting('hirelens.observation_criterion_1'),
      'verdict', 'WEAKER',
      'weakness_type', 'LEVEL_INSUFFICIENT',
      'note', 'Synthetic scope mismatch'
    ),
    jsonb_build_object(
      'criterion_id', current_setting('hirelens.observation_criterion_2'),
      'verdict', 'MATCHED',
      'weakness_type', null,
      'note', null
    )
  )::text,
  true
);

select throws_ok(
  format(
    $$select public.record_post_interview_review(
      '50000000-0000-0000-0000-000000000095', %L, %L::jsonb, null,
      'PROCEED', 'EVIDENCE_REVIEW', 'Synthetic reason', 'MEDIUM', null
    )$$,
    current_setting('hirelens.observation_scorecard_id'),
    jsonb_build_array(
      jsonb_build_object(
        'criterion_id', current_setting('hirelens.observation_criterion_1'),
        'verdict', 'MATCHED',
        'weakness_type', null,
        'note', null
      )
    )::text
  ),
  '22023',
  'every approved criterion must be observed exactly once',
  'missing criterion observation is rejected'
);

select throws_ok(
  format(
    $$select public.record_post_interview_review(
      '50000000-0000-0000-0000-000000000095', %L, %L::jsonb, null,
      'PROCEED', 'EVIDENCE_REVIEW', 'Synthetic reason', 'MEDIUM', null
    )$$,
    current_setting('hirelens.observation_scorecard_id'),
    replace(current_setting('hirelens.valid_observations'), '"LEVEL_INSUFFICIENT"', 'null')
  ),
  '22023',
  'WEAKER requires a weakness type and other verdicts forbid it',
  'WEAKER without weakness type is rejected'
);

select throws_ok(
  format(
    $$select public.record_post_interview_review(
      '50000000-0000-0000-0000-000000000095', %L, %L::jsonb, null,
      'PROCEED', 'EVIDENCE_REVIEW', 'Synthetic reason', 'MEDIUM', null
    )$$,
    current_setting('hirelens.observation_scorecard_id'),
    replace(current_setting('hirelens.valid_observations'), '"note": null', '"note": null, "decision": "PROCEED"')
  ),
  '22023',
  'observation contains unknown or missing keys',
  'unknown observation keys are rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format(
    $$select public.record_post_interview_review(
      '50000000-0000-0000-0000-000000000095', %L, %L::jsonb, null,
      'PROCEED', 'EVIDENCE_REVIEW', 'Synthetic reason', 'MEDIUM', null
    )$$,
    current_setting('hirelens.observation_scorecard_id'),
    current_setting('hirelens.valid_observations')
  ),
  '42501',
  'assigned Hiring Manager or Admin required',
  'Recruiter cannot record observations'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok(
  format(
    $$select public.record_post_interview_review(
      '50000000-0000-0000-0000-000000000095', %L, %L::jsonb,
      'A criterion outside the framework was discussed',
      'PROCEED', 'EVIDENCE_REVIEW', 'Human reviewed synthetic interview evidence',
      'MEDIUM', 'Synthetic decision note'
    )$$,
    current_setting('hirelens.observation_scorecard_id'),
    current_setting('hirelens.valid_observations')
  ),
  'assigned Hiring Manager records observations and final decision atomically'
);

select is(
  (select workflow_state from public.applications
   where id = '50000000-0000-0000-0000-000000000095'),
  'INTERVIEW_COMPLETED',
  'successful capture advances the workflow state'
);
select is(
  (select count(*)::integer from public.interview_observations
   where application_id = '50000000-0000-0000-0000-000000000095'
     and confirmed_at is not null),
  2,
  'all form observations are confirmed'
);
select ok(
  exists (
    select 1
    from public.human_reviews review
    join public.interview_observation_sessions session
      on session.id = review.observation_session_id
    where review.application_id = '50000000-0000-0000-0000-000000000095'
      and review.decision = 'PROCEED'
      and session.application_id = review.application_id
  ),
  'existing final decision model links to the observation session'
);
select ok(
  exists (
    select 1 from public.audit_events
    where event_type = 'POST_INTERVIEW_REVIEW_RECORDED'
      and aggregate_id = '50000000-0000-0000-0000-000000000095'
      and safe_metadata::text not like '%Synthetic scope mismatch%'
      and safe_metadata::text not like '%criterion outside%'
  ),
  'audit metadata excludes observation and off-criteria text'
);

select throws_ok(
  $$
    insert into public.interview_observations (
      interview_observation_session_id, application_id, criterion_id,
      criterion_lineage_id, verdict, source, confirmed_at, observer_id
    ) values (
      gen_random_uuid(),
      '50000000-0000-0000-0000-000000000095',
      current_setting('hirelens.observation_criterion_1')::uuid,
      gen_random_uuid(),
      'MATCHED',
      'FORM',
      now(),
      '00000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501',
  null,
  'authenticated users cannot insert observations directly'
);

reset role;
select throws_ok(
  $$
    update public.interview_observation_sessions
    set off_criteria_reason = 'tampered'
    where application_id = '50000000-0000-0000-0000-000000000095'
  $$,
  '55000',
  'interview_observation_sessions is append-only',
  'observation sessions cannot be updated'
);
select throws_ok(
  $$
    delete from public.interview_observations
    where application_id = '50000000-0000-0000-0000-000000000095'
  $$,
  '55000',
  'interview_observations is append-only',
  'observations cannot be deleted'
);

select * from finish();
rollback;

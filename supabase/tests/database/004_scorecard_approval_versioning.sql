begin;

select plan(20);

set local role authenticated;

select ok(
  has_function_privilege(
    'authenticated',
    'public.approve_scorecard(uuid,integer,public.scorecard_status,integer,text)',
    'EXECUTE'
  ),
  'Authenticated users can invoke the approval RPC subject to authorization'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.approve_scorecard(uuid,integer,public.scorecard_status,integer,text)',
    'EXECUTE'
  ),
  'Anonymous users cannot execute the approval RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_initial_scorecard_draft_internal(uuid,text,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'Authenticated users cannot call the renamed legacy draft implementation directly'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
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
      '[]'::jsonb
    )
  $$,
  '55000',
  'initial scorecard draft already exists',
  'Recruiter cannot bypass revision authorization through the initial draft RPC'
);

select throws_ok(
  $$
    select public.approve_scorecard(
      '20000000-0000-0000-0000-000000000001',
      1,
      'DRAFT',
      1,
      'Recruiter approval attempt'
    )
  $$,
  '42501',
  'not authorized to approve scorecard',
  'Recruiter cannot approve a scorecard'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004',
  true
);

select throws_ok(
  $$
    select public.approve_scorecard(
      '20000000-0000-0000-0000-000000000001',
      1,
      'DRAFT',
      1,
      'Unassigned manager approval attempt'
    )
  $$,
  '42501',
  'not authorized to approve scorecard',
  'Unassigned Hiring Manager cannot approve a scorecard'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',
  true
);

set local role postgres;
update public.criteria
set ambiguity_status = 'AMBIGUOUS'
where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  and client_id = 'criterion-draft-1';
update public.criteria
set ambiguity_status = 'CLEAR'
where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  and client_id = 'criterion-draft-1';

update public.criteria
set type = 'PREFERRED'
where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  and client_id = 'criterion-draft-2';
set local role authenticated;

select throws_ok(
  $$
    select public.approve_scorecard(
      '20000000-0000-0000-0000-000000000001',
      1,
      'DRAFT',
      (select content_revision from public.scorecard_versions where id = '20000000-0000-0000-0000-000000000001'),
      'Human-only mapping must be corrected first'
    )
  $$,
  '22023',
  'HUMAN_ONLY criteria must be INTERVIEW_ONLY and not resume-assessable',
  'Approval validates the HUMAN_ONLY to INTERVIEW_ONLY mapping'
);

set local role postgres;
update public.criteria
set type = 'INTERVIEW_ONLY'
where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  and client_id = 'criterion-draft-2';

select set_config(
  'hirelens.test_expected_content_revision',
  (select content_revision::text from public.scorecard_versions where id = '20000000-0000-0000-0000-000000000001'),
  true
);

update public.criteria
set definition = definition || ' '
where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  and client_id = 'criterion-draft-1';
set local role authenticated;

select throws_ok(
  $$
    select public.approve_scorecard(
      '20000000-0000-0000-0000-000000000001',
      1,
      'DRAFT',
      current_setting('hirelens.test_expected_content_revision')::integer,
      'Stale browser state'
    )
  $$,
  '40001',
  'scorecard changed; reload before approving',
  'Approval rejects a stale criterion-content revision token'
);

set local role postgres;
update public.scorecard_versions version
set confirmed_job_description_issue_keys = coalesce(
  (
    select jsonb_agg((entries.ordinal - 1)::text)
    from jsonb_array_elements(version.ambiguous_phrases) with ordinality entries(item, ordinal)
    where entries.item->>'ambiguity_status' <> 'CLEAR'
  ),
  '[]'::jsonb
)
where version.id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;

select lives_ok(
  $$
    select public.approve_scorecard(
      '20000000-0000-0000-0000-000000000001',
      1,
      'DRAFT',
      (select content_revision from public.scorecard_versions where id = '20000000-0000-0000-0000-000000000001'),
      'Assigned manager reviewed all criteria'
    )
  $$,
  'Assigned Hiring Manager can approve a valid draft'
);

select is(
  (select status::text from public.scorecard_versions where id = '20000000-0000-0000-0000-000000000001'),
  'APPROVED',
  'Approval atomically marks the target version APPROVED'
);

select is(
  (select status::text from public.jobs where id = '10000000-0000-0000-0000-000000000001'),
  'READY_FOR_INTAKE',
  'Approval atomically makes the Job ready for intake'
);

select ok(
  exists (
    select 1
    from public.scorecard_versions
    where id = '20000000-0000-0000-0000-000000000001'
      and approved_by = '00000000-0000-0000-0000-000000000003'
      and approved_at is not null
  ),
  'Approval stores the human approver and timestamp'
);

select ok(
  exists (
    select 1
    from public.audit_events
    where event_type = 'SCORECARD_APPROVED'
      and aggregate_id = '10000000-0000-0000-0000-000000000001'
      and actor_id = '00000000-0000-0000-0000-000000000003'
      and safe_metadata->>'actor_role' = 'HIRING_MANAGER'
      and reason is null
      and correlation_id is not null
      and source = 'scorecard_approval'
      and result = 'SUCCESS'
      and version_ref = '20000000-0000-0000-0000-000000000001'
      and before_data->>'target_status' = 'DRAFT'
      and after_data->>'approved_status' = 'APPROVED'
  ),
  'Approval appends complete safe actor, transition, and trace metadata without a reason'
);

select ok(
  not exists (
    select 1
    from public.audit_events
    where event_type = 'SCORECARD_APPROVED'
      and (
        safe_metadata::text like '%Build and operate reliable backend services%'
        or before_data::text like '%운영 환경 백엔드 개발 경험%'
        or after_data::text like '%운영 환경 백엔드 개발 경험%'
      )
  ),
  'Approval audit payload excludes raw Job descriptions and criterion text'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);

select throws_ok(
  $$
    update public.jobs
    set status = 'ARCHIVED'
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'job scorecard status changes require a controlled workflow',
  'Recruiter cannot bypass the scorecard workflow with a direct Job status update'
);

set local role postgres;

select throws_ok(
  $$
    insert into public.scorecard_versions (
      job_id,
      version_number,
      status,
      source_job_description_hash,
      prompt_version,
      schema_version,
      model_id,
      created_by,
      approved_by,
      approved_at
    ) values (
      '10000000-0000-0000-0000-000000000001',
      99,
      'APPROVED',
      '844f648bb5bb9a9c5e630aafed83e94b99bf8284009483528449fc9191363261',
      'test',
      'test',
      'test',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      now()
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "scorecard_versions_one_approved_per_job_idx"',
  'The partial unique index permits only one APPROVED version per Job'
);

select throws_ok(
  $$
    update public.criteria
    set definition = 'Tampered approved criterion'
    where scorecard_version_id = '20000000-0000-0000-0000-000000000001'
  $$,
  '55000',
  'approved scorecard criteria are immutable',
  'Approved criteria are immutable at the database boundary'
);

select throws_ok(
  $$
    update public.scorecard_versions
    set model_id = 'tampered'
    where id = '20000000-0000-0000-0000-000000000001'
  $$,
  '55000',
  'approved scorecard versions are immutable',
  'Approved version metadata is immutable at the database boundary'
);

select throws_ok(
  $$
    delete from public.scorecard_versions
    where id = '20000000-0000-0000-0000-000000000001'
  $$,
  '55000',
  'approved scorecard versions are immutable',
  'Approved versions cannot be deleted at the database boundary'
);

select ok(
  to_regprocedure('public.create_scorecard_revision(uuid,integer,public.scorecard_status,text)') is null,
  'Approved Review Frameworks have no replacement-version RPC'
);

select * from finish();
rollback;

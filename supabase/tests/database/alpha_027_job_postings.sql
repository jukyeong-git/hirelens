begin;

-- Alpha verification only: every fixture mutation below is rolled back.
select plan(41);

set local role postgres;
update public.profiles
set role = case id
  when '00000000-0000-0000-0000-000000000001'::uuid then 'ADMIN'::public.app_role
  when '00000000-0000-0000-0000-000000000002'::uuid then 'RECRUITER'::public.app_role
  when '00000000-0000-0000-0000-000000000003'::uuid then 'HIRING_MANAGER'::public.app_role
  when '00000000-0000-0000-0000-000000000004'::uuid then 'HIRING_MANAGER'::public.app_role
  when '00000000-0000-0000-0000-000000000005'::uuid then 'REQUISITION_APPROVER'::public.app_role
  else role
end
where id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000005'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select lives_ok(
  $$
    insert into public.jobs (id, title, department, raw_job_description, recruiter_id, hiring_manager_id, is_synthetic_demo)
    values (
      '10000000-0000-0000-0000-000000000027',
      'Posting verification role', 'Engineering',
      'Synthetic requisition used only for rollback-only posting verification.',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      true
    )
  $$,
  'Hiring Manager can create the synthetic requisition for posting verification'
);
select lives_ok(
  $$ select public.assign_requisition_approver(
    '10000000-0000-0000-0000-000000000027',
    '00000000-0000-0000-0000-000000000005'
  ) $$,
  'Hiring Manager can designate the requisition approver'
);
select public.create_scorecard_draft(
  '10000000-0000-0000-0000-000000000027', repeat('c', 64),
  'human-authored', 'review-framework-manual-v1', 'HUMAN_AUTHORED', '[]'::jsonb,
  '[{"client_id":"posting-criterion-1","name":"운영 경험","type":"REQUIRED","definition":"운영 환경 경험","accepted_evidence":["운영 사례"],"alternative_evidence":[],"evidence_fields":[{"field_name":"case","description":"운영 사례"}],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
) as scorecard_version_id \gset
select id, content_revision from public.scorecard_versions
where id = :'scorecard_version_id' \gset scorecard_
select lives_ok(
  format($$ select public.approve_scorecard('%s', 1, 'DRAFT', %s, 'Synthetic approval') $$,
    :'scorecard_version_id', :'scorecard_content_revision'),
  'Hiring Manager can approve the Review Framework'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.create_job_posting_draft('10000000-0000-0000-0000-000000000027') $$,
  'Assigned Recruiter can create one posting draft'
);
select is(
  (select status::text from public.job_postings where job_id = '10000000-0000-0000-0000-000000000027'),
  'DRAFT',
  'Posting draft is separate from the requisition state'
);
select lives_ok(
  $$ select public.update_job_posting_content(
    '10000000-0000-0000-0000-000000000027',
    'Posting verification role', 'Synthetic posting summary', 'Synthetic responsibilities',
    'Synthetic requirements', 'Singapore', 'Full-time'
  ) $$,
  'Assigned Recruiter can prepare complete public posting content'
);
select lives_ok(
  $$ select public.publish_job_posting('10000000-0000-0000-0000-000000000027') $$,
  'Publishing is allowed without the deferred requisition approval gate'
);
select is(
  (select count(*)::integer from public.job_posting_status_history where job_id = '10000000-0000-0000-0000-000000000027'),
  2,
  'Successful publish appends one history row after the draft row'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.publish_job_posting('10000000-0000-0000-0000-000000000027') $$,
  '42501', 'only the assigned recruiter or an admin can publish a job posting',
  'Hiring Manager cannot publish a posting'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$ select public.create_job_posting_draft('10000000-0000-0000-0000-000000000027') $$,
  '42501', 'only the assigned recruiter or an admin can create a job posting draft',
  'Requisition Approver cannot create a posting draft'
);
select throws_ok(
  $$ select public.publish_job_posting('10000000-0000-0000-0000-000000000027') $$,
  '42501', 'only the assigned recruiter or an admin can publish a job posting',
  'Requisition Approver cannot publish a posting'
);

select is(
  (select requisition_status::text from public.jobs where id = '10000000-0000-0000-0000-000000000027'),
  'DRAFT',
  'Posting does not implicitly mutate the dormant requisition status'
);
select is(
  (select count(*)::integer from public.requisition_status_history where job_id = '10000000-0000-0000-0000-000000000027'),
  0,
  'Posting does not create a requisition approval history event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is(
  (select status::text from public.job_postings where job_id = '10000000-0000-0000-0000-000000000027'),
  'PUBLISHED',
  'Admin sees the already-published posting without a requisition approval step'
);
select is(
  (select status::text from public.job_postings where job_id = '10000000-0000-0000-0000-000000000027'),
  'PUBLISHED',
  'Publishing changes only the posting state'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.close_job_posting('10000000-0000-0000-0000-000000000027') $$,
  '42501', 'only the assigned recruiter or an admin can close a job posting',
  'Hiring Manager cannot close a posting'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$ select public.close_job_posting('10000000-0000-0000-0000-000000000027') $$,
  '42501', 'only the assigned recruiter or an admin can close a job posting',
  'Requisition Approver cannot close a posting'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.close_job_posting('10000000-0000-0000-0000-000000000027') $$,
  'Assigned Recruiter can close a published posting without a reason'
);
select is(
  (select status::text from public.job_postings where job_id = '10000000-0000-0000-0000-000000000027'),
  'CLOSED',
  'Closed is the terminal posting state'
);
select throws_ok(
  $$ select public.close_job_posting('10000000-0000-0000-0000-000000000027') $$,
  '55000', 'only PUBLISHED postings can be closed',
  'A closed posting cannot be closed again'
);
select throws_ok(
  $$ select public.publish_job_posting('10000000-0000-0000-0000-000000000027') $$,
  '55000', 'only DRAFT postings can be published',
  'A closed posting cannot be reopened by publishing again'
);
select is(
  (select count(*)::integer from public.job_posting_status_history where job_id = '10000000-0000-0000-0000-000000000027'),
  3,
  'Create, publish, and close each append one posting status-history row'
);
select is(
  (select string_agg(new_status::text, ',' order by created_at, id)
   from public.job_posting_status_history where job_id = '10000000-0000-0000-0000-000000000027'),
  'DRAFT,PUBLISHED,CLOSED',
  'Posting history records only valid forward transitions'
);
select is(
  (select count(*)::integer from public.human_reviews
   where application_id in (select id from public.applications where job_id = '10000000-0000-0000-0000-000000000027')),
  0,
  'Posting lifecycle never creates a human hiring decision'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*)::integer from public.job_postings where job_id = '10000000-0000-0000-0000-000000000027'),
  0,
  'Unassigned Hiring Manager cannot read an internal posting'
);
select throws_ok(
  $$ select public.create_job_posting_draft('10000000-0000-0000-0000-000000000027') $$,
  '42501', 'only the assigned recruiter or an admin can create a job posting draft',
  'Hiring Manager cannot create a posting draft'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ insert into public.job_postings (job_id, created_by)
      values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') $$,
  '42501', 'permission denied for table job_postings',
  'Direct mutable posting DML is denied'
);
select throws_ok(
  $$ update public.job_postings set status = 'PUBLISHED'
      where job_id = '10000000-0000-0000-0000-000000000027' $$,
  '42501', 'permission denied for table job_postings',
  'Direct posting updates are denied'
);
select throws_ok(
  $$ delete from public.job_posting_status_history where job_id = '10000000-0000-0000-0000-000000000027' $$,
  '42501', 'permission denied for table job_posting_status_history',
  'Direct posting-history deletion is denied'
);
select throws_ok(
  $$ update public.job_posting_status_history set new_status = 'CLOSED'
      where job_id = '10000000-0000-0000-0000-000000000027' $$,
  '42501', 'permission denied for table job_posting_status_history',
  'Direct posting-history updates are denied'
);
select ok(
  not has_table_privilege('anon', 'public.job_postings', 'SELECT'),
  'Anonymous role has no posting read grant or policy path'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('job_postings', 'job_posting_status_history')
      and 'anon' = any(roles)
  ),
  0,
  'Posting tables have no anonymous RLS policy'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select is(
  (select count(*)::integer from public.job_postings where job_id = '10000000-0000-0000-0000-000000000027'),
  0,
  'Requisition Approver cannot read an internal posting'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$
    insert into public.jobs (id, title, department, raw_job_description, recruiter_id, hiring_manager_id, is_synthetic_demo)
    values (
      '10000000-0000-0000-0000-000000000028',
      'Framework gate verification', 'Engineering',
      'Synthetic job for the missing Review Framework gate.',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      true
    )
  $$,
  'Hiring Manager can create the missing-framework gate requisition'
);
select lives_ok(
  $$ select public.assign_requisition_approver(
    '10000000-0000-0000-0000-000000000028',
    '00000000-0000-0000-0000-000000000005'
  ) $$,
  'Hiring Manager can designate the missing-framework gate approver'
);
select public.create_scorecard_draft(
  '10000000-0000-0000-0000-000000000028', repeat('d', 64),
  'human-authored', 'review-framework-manual-v1', 'HUMAN_AUTHORED', '[]'::jsonb,
  '[{"client_id":"posting-criterion-2","name":"시스템 경험","type":"REQUIRED","definition":"시스템 개발 경험","accepted_evidence":["개발 사례"],"alternative_evidence":[],"evidence_fields":[{"field_name":"case","description":"개발 사례"}],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
) as scorecard_version_id \gset
select id, content_revision from public.scorecard_versions
where id = :'scorecard_version_id' \gset scorecard_
select lives_ok(
  format($$ select public.approve_scorecard('%s', 1, 'DRAFT', %s, 'Synthetic approval') $$,
    :'scorecard_version_id', :'scorecard_content_revision'),
  'Hiring Manager can approve the temporary Review Framework'
);
select lives_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000028') $$,
  'Hiring Manager can submit the temporary approved-framework requisition'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$ select public.resolve_requisition_approval(
    '10000000-0000-0000-0000-000000000028', 'APPROVED', 'Synthetic approval reason'
  ) $$,
  'Designated approver can approve the temporary requisition'
);
set local role postgres;
set local session_replication_role = replica;
delete from public.criteria where scorecard_version_id = :'scorecard_version_id';
delete from public.scorecard_versions where id = :'scorecard_version_id';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.create_job_posting_draft('10000000-0000-0000-0000-000000000028') $$,
  'Recruiter can prepare a draft before the final publish gate'
);
select throws_ok(
  $$ select public.publish_job_posting('10000000-0000-0000-0000-000000000028') $$,
  '55000', 'an approved review framework is required before publishing',
  'Publishing is atomically blocked without an approved Review Framework'
);
select is(
  (select status::text from public.job_postings where job_id = '10000000-0000-0000-0000-000000000028'),
  'DRAFT',
  'Missing-framework publish failure leaves the posting draft unchanged'
);

select * from finish();
rollback;

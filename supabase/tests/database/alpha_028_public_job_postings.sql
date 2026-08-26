begin;

-- Alpha verification only. Every fixture mutation is rolled back.
select plan(34);

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
      '10000000-0000-0000-0000-000000000029',
      'Public posting verification role', 'Engineering',
      'Internal synthetic requisition content must never be returned by the public RPC.',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      true
    )
  $$,
  'Hiring Manager can create the public-posting verification requisition'
);
select lives_ok(
  $$ select public.assign_requisition_approver(
    '10000000-0000-0000-0000-000000000029',
    '00000000-0000-0000-0000-000000000005'
  ) $$,
  'Hiring Manager can designate the public-posting approver'
);
select public.create_scorecard_draft(
  '10000000-0000-0000-0000-000000000029', repeat('e', 64),
  'human-authored', 'review-framework-manual-v1', 'HUMAN_AUTHORED', '[]'::jsonb,
  '[{"client_id":"public-criterion-1","name":"Backend experience","type":"REQUIRED","definition":"Backend development experience","accepted_evidence":["Production service example"],"alternative_evidence":[],"evidence_fields":[{"field_name":"case","description":"Production service example"}],"resume_assessable":true,"source_phrase":null,"ambiguity_note":null,"ambiguity_status":"CLEAR","suggested_interview_question":null,"display_order":0}]'::jsonb
) as scorecard_version_id \gset
select id, content_revision from public.scorecard_versions
where id = :'scorecard_version_id' \gset scorecard_
select lives_ok(
  format($$ select public.approve_scorecard('%s', 1, 'DRAFT', %s, 'Synthetic approval') $$,
    :'scorecard_version_id', :'scorecard_content_revision'),
  'Hiring Manager can approve the Review Framework'
);
select lives_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000029') $$,
  'Hiring Manager can submit the requisition'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$ select public.resolve_requisition_approval(
    '10000000-0000-0000-0000-000000000029', 'APPROVED', 'Synthetic public-posting approval'
  ) $$,
  'Designated approver can approve the requisition'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.create_job_posting_draft('10000000-0000-0000-0000-000000000029') $$,
  'Assigned Recruiter can create the public-posting draft'
);
select throws_ok(
  $$ select public.update_job_posting_content(
    '10000000-0000-0000-0000-000000000029', 'Public title', '', 'Responsibilities', 'Requirements', 'Singapore', 'Full-time'
  ) $$,
  '22023', 'public posting content is incomplete',
  'Incomplete public content cannot be saved'
);
select lives_ok(
  $$ select public.update_job_posting_content(
    '10000000-0000-0000-0000-000000000029',
    'Backend Engineer',
    'Build reliable backend services for HireLens.',
    'Design APIs and improve service reliability.',
    'TypeScript and PostgreSQL experience.',
    'Singapore · Hybrid',
    'Full-time'
  ) $$,
  'Assigned Recruiter can save complete public content'
);
select public_slug from public.job_postings
where job_id = '10000000-0000-0000-0000-000000000029' \gset posting_
select is(
  (select public_title from public.job_postings where job_id = '10000000-0000-0000-0000-000000000029'),
  'Backend Engineer',
  'Public content is stored separately from the internal requisition'
);
select ok(
  :'posting_public_slug' ~ '^[0-9a-f]{32}$',
  'The public slug is opaque and has the expected format'
);
set local role anon;
select is(
  (select count(*)::integer from public.get_public_job_posting(:'posting_public_slug')),
  0,
  'Draft postings are not visible in the anonymous projection'
);
select is(
  (select count(*)::integer
   from public.list_public_job_postings()
   where public_slug = :'posting_public_slug'),
  0,
  'Draft postings are not visible in the anonymous Career Site index'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select public.update_job_posting_content(
    '10000000-0000-0000-0000-000000000029', 'No access', 'Summary', 'Work', 'Requirements', 'Singapore', 'Full-time'
  ) $$,
  '42501', 'only the assigned recruiter or an admin can update public posting content',
  'Unassigned Hiring Manager cannot update public content'
);

set local role postgres;
update public.jobs
set is_synthetic_demo = false
where id = '10000000-0000-0000-0000-000000000029';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select public.publish_job_posting('10000000-0000-0000-0000-000000000029') $$,
  '42501', 'only synthetic demo jobs can be published publicly',
  'Non-synthetic jobs cannot be published through the public-posting RPC'
);
select is(
  (select status::text from public.job_postings where job_id = '10000000-0000-0000-0000-000000000029'),
  'DRAFT',
  'A non-synthetic publish denial leaves the posting unpublished'
);
set local role postgres;
update public.jobs
set is_synthetic_demo = true
where id = '10000000-0000-0000-0000-000000000029';
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.publish_job_posting('10000000-0000-0000-0000-000000000029') $$,
  'Assigned Recruiter can publish complete public content after both approval gates'
);
select is(
  (select status::text from public.job_postings where job_id = '10000000-0000-0000-0000-000000000029'),
  'PUBLISHED',
  'Publishing changes the posting state only after content validation'
);

set local role anon;
select throws_ok(
  $$ select count(*) from public.job_postings $$,
  '42501', 'permission denied for table job_postings',
  'Anonymous users cannot select the internal posting table'
);
select is(
  (select count(*)::integer from public.get_public_job_posting(:'posting_public_slug')),
  1,
  'Anonymous users can read exactly one published public projection'
);
set local role postgres;
update public.jobs
set is_synthetic_demo = false
where id = '10000000-0000-0000-0000-000000000029';
set local role anon;
select is(
  (select count(*)::integer from public.get_public_job_posting(:'posting_public_slug')),
  0,
  'Non-synthetic jobs never appear in the anonymous public projection'
);
select is(
  (select count(*)::integer
   from public.list_public_job_postings()
   where public_slug = :'posting_public_slug'),
  0,
  'Non-synthetic jobs never appear in the anonymous Career Site index'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ update public.jobs
     set is_synthetic_demo = true
     where id = '10000000-0000-0000-0000-000000000029' $$,
  '42501', 'synthetic demo classification is server-owned',
  'Authenticated clients cannot change the synthetic-demo classification'
);
set local role postgres;
update public.jobs
set is_synthetic_demo = true
where id = '10000000-0000-0000-0000-000000000029';
set local role anon;
select is(
  (select count(*)::integer
   from public.list_public_job_postings()
   where public_slug = :'posting_public_slug'),
  1,
  'Anonymous users can list the published posting'
);
select is(
  (select string_agg(leaked.key, ',' order by leaked.key)
   from public.list_public_job_postings() public_row,
        jsonb_object_keys(to_jsonb(public_row)) leaked(key)
   where public_row.public_slug = :'posting_public_slug'),
  'employment_type,location,public_slug,summary,title',
  'The public Career Site index exposes exactly its narrow candidate-facing fields'
);
select is(
  (select title from public.get_public_job_posting(:'posting_public_slug')),
  'Backend Engineer',
  'The public projection returns candidate-facing title'
);
select is(
  (select string_agg(leaked.key, ',' order by leaked.key)
   from public.get_public_job_posting(:'posting_public_slug') public_row,
        jsonb_object_keys(to_jsonb(public_row)) leaked(key)),
  'employment_type,location,public_slug,requirements,responsibilities,summary,title',
  'The anonymous detail projection exposes exactly its narrow candidate-facing fields'
);
select is(
  (select count(*)::integer from public.get_public_job_posting('not-a-real-public-slug')),
  0,
  'Unknown slugs return no public posting'
);
select ok(
  not has_table_privilege('anon', 'public.job_postings', 'SELECT'),
  'Anonymous role has no direct internal posting table grant'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'job_postings' and 'anon' = any(roles)),
  0,
  'Job posting RLS has no anonymous table policy'
);
select throws_ok(
  $$ insert into public.job_postings (job_id, created_by)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') $$,
  '42501', 'permission denied for table job_postings',
  'Anonymous users cannot create internal postings'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ select public.close_job_posting('10000000-0000-0000-0000-000000000029') $$,
  'Assigned Recruiter can close the public posting'
);
select is(
  (select count(*)::integer from public.get_public_job_posting(:'posting_public_slug')),
  0,
  'Closed postings disappear from the anonymous projection'
);
select is(
  (select count(*)::integer
   from public.list_public_job_postings()
   where public_slug = :'posting_public_slug'),
  0,
  'Closed postings disappear from the anonymous Career Site index'
);
select throws_ok(
  $$ select public.update_job_posting_content(
    '10000000-0000-0000-0000-000000000029', 'Closed', 'Summary', 'Work', 'Requirements', 'Singapore', 'Full-time'
  ) $$,
  '55000', 'closed postings cannot be edited',
  'Closed public content cannot be edited'
);
select throws_ok(
  $$ update public.job_postings set public_slug = repeat('f', 32)
     where job_id = '10000000-0000-0000-0000-000000000029' $$,
  '42501', 'permission denied for table job_postings',
  'Authenticated clients cannot mutate the immutable public slug directly'
);
select * from finish();
rollback;

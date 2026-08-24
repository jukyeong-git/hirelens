begin;

select plan(18);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*)::integer from public.jobs),
  2,
  'Admin can read all demo jobs'
);

select is(
  (select count(*)::integer from public.profiles),
  5,
  'Admin can read all demo profiles'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*)::integer from public.jobs),
  2,
  'Recruiter can read jobs assigned to the recruiter'
);

select is(
  (select count(*)::integer from public.profiles where role = 'HIRING_MANAGER'),
  2,
  'Recruiter can list Hiring Manager profiles for the Job form'
);

select throws_ok(
  $$
    insert into public.jobs (
      title,
      department,
      raw_job_description,
      recruiter_id,
      hiring_manager_id
    ) values (
      'Test Backend Engineer',
      'Engineering',
      'Synthetic test job description.',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000004'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "jobs"',
  'Recruiter cannot create a requisition for a Hiring Manager'
);

select lives_ok(
  $$
    update public.jobs
    set department = 'Platform Engineering'
    where id = '10000000-0000-0000-0000-000000000001'
  $$,
  'Recruiter can update non-workflow fields on an owned job'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',
  true
);

select is(
  (select count(*)::integer from public.jobs),
  1,
  'Hiring Manager can read only assigned jobs'
);

select is(
  (select count(*)::integer from public.jobs where id = '10000000-0000-0000-0000-000000000002'),
  0,
  'Hiring Manager cannot read an unassigned job'
);

select is(
  (select count(*)::integer from public.profiles where role = 'RECRUITER'),
  1,
  'Hiring Manager can read the Recruiter assigned to the visible job'
);

select is(
  (select count(*)::integer from public.profiles where role = 'REQUISITION_APPROVER'),
  1,
  'Hiring Manager can list Requisition Approvers for assignment'
);

select lives_ok(
  $$
    insert into public.jobs (
      title,
      department,
      raw_job_description,
      recruiter_id,
      hiring_manager_id
    ) values (
      'Unauthorized Job',
      'Engineering',
      'Synthetic unauthorized test job.',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003'
    )
  $$,
  'Hiring Manager can create an assigned requisition'
);

select ok(
  exists (
    select 1
    from public.audit_events
    where aggregate_type = 'job'
      and aggregate_id = '10000000-0000-0000-0000-000000000001'
  ),
  'Assigned Hiring Manager can read the job audit history'
);

select is(
  (select count(*)::integer from public.audit_events where aggregate_id = '10000000-0000-0000-0000-000000000002'),
  0,
  'Assigned Hiring Manager cannot read another job audit history'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select ok(
  exists (
    select 1
    from public.audit_events
    where event_type = 'JOB_CREATED'
      and aggregate_id = '10000000-0000-0000-0000-000000000001'
  ),
  'Admin can inspect job audit events'
);

select throws_ok(
  $$
    update public.audit_events
    set reason = 'tampered'
    where aggregate_id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table audit_events',
  'Audit events cannot be updated'
);

select throws_ok(
  $$
    delete from public.audit_events
    where aggregate_id = '10000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'permission denied for table audit_events',
  'Audit events cannot be deleted'
);

select throws_ok(
  $$
    insert into public.audit_events (
      event_type,
      actor_type,
      aggregate_type,
      aggregate_id,
      source,
      result
    ) values (
      'FORGED_EVENT',
      'USER',
      'job',
      '10000000-0000-0000-0000-000000000001',
      'test',
      'SUCCESS'
    )
  $$,
  '42501',
  'permission denied for table audit_events',
  'Application roles cannot insert audit events directly'
);

select ok(
  not exists (
    select 1
    from public.audit_events
    where safe_metadata::text like '%Build and operate reliable backend services%'
  ),
  'Audit metadata does not copy the raw job description'
);

select * from finish();
rollback;

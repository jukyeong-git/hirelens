begin;

select plan(38);

set local role postgres;
insert into public.jobs (id, title, department, raw_job_description, recruiter_id, hiring_manager_id)
values (
  '10000000-0000-0000-0000-000000000099',
  'Unassigned Synthetic Job',
  'Engineering',
  'Synthetic test requisition not assigned to the approver.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
insert into public.requisition_status_history (job_id, actor_id, actor_role, prior_status, new_status)
values (
  '10000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  'ADMIN',
  'DRAFT',
  'PENDING_APPROVAL'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);

select is((select count(*)::integer from public.jobs), 2, 'Approver reads only designated requisitions');
select is((select count(*)::integer from public.scorecard_versions), 0, 'Approver cannot read scorecards by role alone');
select is((select count(*)::integer from public.applications), 0, 'Approver cannot read applications by role alone');
select is((select count(*)::integer from public.resume_files), 0, 'Approver cannot read resume files by role alone');
select is((select count(*)::integer from public.resume_pages), 0, 'Approver cannot read resume pages by role alone');
select is((select count(*)::integer from public.processing_runs), 0, 'Approver cannot read processing runs by role alone');
select is((select count(*)::integer from public.requisition_status_history), 0, 'Approver cannot read approval history for an unassigned requisition');
select is(public.can_access_job('10000000-0000-0000-0000-000000000001'), false, 'Approver assignment does not grant general job access');
select throws_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  '42501', 'only the assigned hiring manager can submit a requisition',
  'Approver cannot submit a requisition'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  '42501', 'only the assigned hiring manager can submit a requisition',
  'Admin cannot submit a requisition'
);
select throws_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000001', 'APPROVED', 'Admin reason') $$,
  '42501', 'only the designated requisition approver can resolve a requisition',
  'Admin cannot approve a requisition'
);
select throws_ok(
  $$ update public.jobs set requisition_status = 'PENDING_APPROVAL' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', 'requisition workflow fields require controlled RPCs',
  'Admin cannot directly change requisition status'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ update public.jobs set requisition_approver_id = '00000000-0000-0000-0000-000000000005' where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', 'requisition workflow fields require controlled RPCs',
  'Recruiter cannot directly change requisition approver'
);
select throws_ok(
  $$
    insert into public.jobs (
      title, department, raw_job_description, requisition_status,
      requisition_approver_id, submitted_at, approval_reason,
      approved_or_returned_at, recruiter_id, hiring_manager_id
    ) values (
      'Forged approved requisition', 'Engineering', 'Synthetic forged approval.',
      'APPROVED', '00000000-0000-0000-0000-000000000005', now(),
      'Forged approval', now(), '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003'
    )
  $$,
  '42501', 'new requisitions must start as an unassigned DRAFT',
  'Recruiter cannot forge an approved requisition through direct insert'
);
select throws_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  '42501', 'only the assigned hiring manager can submit a requisition',
  'Recruiter cannot submit a requisition'
);
select throws_ok(
  $$
    insert into public.requisition_status_history (job_id, actor_id, actor_role, prior_status, new_status)
    values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'RECRUITER',
      'DRAFT',
      'PENDING_APPROVAL'
    )
  $$,
  '42501', 'permission denied for table requisition_status_history',
  'Recruiter cannot insert requisition history directly'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  '42501', 'only the assigned hiring manager can submit a requisition',
  'Unassigned Hiring Manager cannot submit another manager requisition'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$ select public.assign_requisition_approver('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005') $$,
  'Assigned Hiring Manager can assign an approver while DRAFT'
);
select is(
  (select count(*)::integer from public.audit_events where event_type = 'REQUISITION_APPROVER_ASSIGNED' and aggregate_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'Approver designation writes an append-only accountability audit event'
);
select throws_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  '55000', 'an approved scorecard is required before requisition submission',
  'Assigned Hiring Manager cannot submit before Scorecard approval'
);
set local role postgres;
update public.scorecard_versions
set status = 'APPROVED',
    approved_by = '00000000-0000-0000-0000-000000000001',
    approved_at = now()
where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  'Assigned Hiring Manager submits a DRAFT requisition'
);
select is((select requisition_status::text from public.jobs where id = '10000000-0000-0000-0000-000000000001'), 'PENDING_APPROVAL', 'Submission uses independent requisition status');
select is((select status::text from public.jobs where id = '10000000-0000-0000-0000-000000000001'), 'DRAFT', 'Submission does not alter legacy job status');
select throws_ok(
  $$ select public.assign_requisition_approver('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005') $$,
  '55000', 'requisition approver can only change in DRAFT or RETURNED',
  'Pending approver reassignment is denied'
);
select throws_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  '55000', 'only DRAFT or RETURNED requisitions can be submitted',
  'Pending requisition cannot be resubmitted'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000001', 'APPROVED', '') $$,
  '22023', 'approval or return reason is required and must be at most 1000 characters',
  'Approval requires a non-empty bounded reason'
);
select lives_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000001', 'RETURNED', 'Please clarify the approved headcount.') $$,
  'Designated approver can return a pending requisition'
);
select is((select requisition_status::text from public.jobs where id = '10000000-0000-0000-0000-000000000001'), 'RETURNED', 'Return is durable');
select is((select count(*)::integer from public.requisition_status_history where job_id = '10000000-0000-0000-0000-000000000001'), 2, 'Submission and return append history rows');
select is((select reason from public.requisition_status_history where job_id = '10000000-0000-0000-0000-000000000001' order by created_at desc, id desc limit 1), 'Please clarify the approved headcount.', 'History retains the return reason');
select throws_ok(
  $$ update public.requisition_status_history set reason = 'tampered' where job_id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table requisition_status_history',
  'Application roles cannot update requisition history directly'
);
select throws_ok(
  $$ delete from public.requisition_status_history where job_id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', 'permission denied for table requisition_status_history',
  'Application roles cannot delete requisition history directly'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$ select public.submit_requisition('10000000-0000-0000-0000-000000000001') $$,
  'Assigned Hiring Manager can resubmit only after return'
);

set local role postgres;
alter table public.jobs disable trigger jobs_validate_requisition_approver;
update public.jobs set requisition_approver_id = '00000000-0000-0000-0000-000000000004' where id = '10000000-0000-0000-0000-000000000002';
alter table public.jobs enable trigger jobs_validate_requisition_approver;
update public.jobs set requisition_status = 'PENDING_APPROVAL', submitted_at = now() where id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000002', 'APPROVED', 'Synthetic approval') $$,
  '42501', 'self approval is prohibited',
  'A hiring manager cannot self-approve even if assigned directly'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$ select public.resolve_requisition_approval('10000000-0000-0000-0000-000000000001', 'APPROVED', 'Headcount approved.') $$,
  'Designated approver can approve a resubmitted requisition'
);
select is((select requisition_status::text from public.jobs where id = '10000000-0000-0000-0000-000000000001'), 'APPROVED', 'Approval is durable');
select is((select count(*)::integer from public.requisition_status_history where job_id = '10000000-0000-0000-0000-000000000001'), 4, 'History remains append-only across resubmission and approval');
select is((select actor_role::text from public.requisition_status_history where job_id = '10000000-0000-0000-0000-000000000001' order by created_at desc, id desc limit 1), 'REQUISITION_APPROVER', 'History records the approver role');

select * from finish();
rollback;

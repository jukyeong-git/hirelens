begin;

select plan(5);

set local role postgres;
insert into public.jobs (
  id, title, department, hiring_need, raw_job_description, recruiter_id, hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000097', 'Discard me', 'Engineering',
  'Capacity', 'Description',
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'
);
select set_config(
  'hirelens.discard_updated_at',
  (select updated_at::text from public.jobs where id = '10000000-0000-0000-0000-000000000097'),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.discard_job_draft(
    '10000000-0000-0000-0000-000000000097',
    current_setting('hirelens.discard_updated_at')::timestamptz
  )$$,
  '42501', null,
  'Recruiter cannot discard a job draft'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.discard_job_draft(
    '10000000-0000-0000-0000-000000000097',
    current_setting('hirelens.discard_updated_at')::timestamptz
  )$$,
  'assigned Hiring Manager can discard a job draft'
);
select is(
  (select status::text from public.jobs where id = '10000000-0000-0000-0000-000000000097'),
  'ARCHIVED',
  'discarded draft is archived'
);
select is(
  (select count(*)::integer from public.audit_events
   where aggregate_id = '10000000-0000-0000-0000-000000000097'
     and event_type = 'JOB_DRAFT_DISCARDED'),
  1,
  'discard is recorded in append-only audit'
);
select throws_ok(
  $$select public.discard_job_draft(
    '10000000-0000-0000-0000-000000000097',
    (select updated_at from public.jobs where id = '10000000-0000-0000-0000-000000000097')
  )$$,
  '55000', null,
  'archived draft cannot be discarded again'
);

select * from finish();
rollback;

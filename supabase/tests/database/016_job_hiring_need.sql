begin;

select plan(3);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000003',
  true
);

insert into public.jobs (
  id,
  title,
  department,
  hiring_need,
  raw_job_description,
  recruiter_id,
  hiring_manager_id
) values (
  '10000000-0000-0000-0000-000000000099',
  'Hiring Need Test Engineer',
  'Engineering',
  'Increase backend delivery capacity for the next release.',
  'Build and operate reliable backend services.',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

select is(
  (select hiring_need from public.jobs where id = '10000000-0000-0000-0000-000000000099'),
  'Increase backend delivery capacity for the next release.',
  'Hiring Manager hiring need is retained with the job requisition'
);

select ok(
  (select coalesce((safe_metadata ->> 'has_hiring_need')::boolean, false)
   from public.audit_events
   where aggregate_type = 'job'
     and aggregate_id = '10000000-0000-0000-0000-000000000099'
     and event_type = 'JOB_CREATED'),
  'Audit records only that a hiring need exists'
);

select ok(
  not exists (
    select 1
    from public.audit_events
    where aggregate_type = 'job'
      and aggregate_id = '10000000-0000-0000-0000-000000000099'
      and safe_metadata ? 'hiring_need'
  ),
  'Audit does not copy the hiring need free text'
);

select * from finish();

rollback;

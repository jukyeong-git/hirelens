begin;

select plan(1);

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

select * from finish();

rollback;

begin;

select plan(4);

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000004',
  true
);

select is(
  (select count(*)::integer from public.profiles where role = 'RECRUITER'),
  1,
  'Hiring Manager without an assigned Job can list Recruiters for requisition creation'
);

select is(
  (select count(*)::integer from public.profiles where role = 'REQUISITION_APPROVER'),
  1,
  'Hiring Manager can still list Requisition Approvers for requisition assignment'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000005',
  true
);

select is(
  (select count(*)::integer from public.profiles where role = 'RECRUITER'),
  0,
  'Requisition Approver cannot list Recruiters'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*)::integer from public.profiles),
  5,
  'Admin retains full Profile visibility'
);

select * from finish();

rollback;

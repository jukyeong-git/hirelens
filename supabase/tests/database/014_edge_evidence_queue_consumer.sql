begin;
select plan(31);

set local role postgres;
delete from pgmq.q_resume_analysis;
delete from pgmq.a_resume_analysis;
update public.scorecard_versions
set status = 'APPROVED', approved_by = '00000000-0000-0000-0000-000000000001', approved_at = now()
where id = '20000000-0000-0000-0000-000000000001' and status = 'DRAFT';
insert into public.candidates (id, demo_label)
values ('40000000-0000-0000-0000-000000000901', 'Synthetic Edge consumer fixture');
insert into public.applications (id, candidate_id, job_id, source, workflow_state)
values ('50000000-0000-0000-0000-000000000901', '40000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000001', 'TEST', 'NEW');
insert into public.resume_files (
  id, application_id, storage_path, original_filename, mime_type, byte_size, sha256, intake_status
) values (
  '60000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000901',
  'opaque/edge-consumer.pdf', 'synthetic.pdf', 'application/pdf', 100, repeat('a', 64), 'UPLOADED'
);
insert into public.processing_runs (
  id, application_id, resume_file_id, scorecard_version_id, pipeline_version
) values (
  '70000000-0000-0000-0000-000000000901', '50000000-0000-0000-0000-000000000901',
  '60000000-0000-0000-0000-000000000901', '20000000-0000-0000-0000-000000000001',
  'evidence-pipeline-v1'
);
select public.enqueue_resume_processing_run('70000000-0000-0000-0000-000000000901');
create temporary table edge_dequeued (msg_id bigint, message jsonb) on commit drop;
grant select, insert, delete, truncate on edge_dequeued to service_role;
update public.evidence_consumer_control set consumer_mode = 'NODE' where singleton;

select ok(
  not has_function_privilege('anon', 'public.dequeue_evidence_queue_message(integer,text)', 'EXECUTE'),
  'anonymous callers cannot dequeue evidence work'
);
select ok(
  not has_function_privilege('authenticated', 'public.dequeue_evidence_queue_message(integer,text)', 'EXECUTE'),
  'authenticated browser callers cannot dequeue evidence work'
);
select ok(
  has_function_privilege('service_role', 'public.dequeue_evidence_queue_message(integer,text)', 'EXECUTE'),
  'Edge service identity can dequeue evidence work'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ select public.dequeue_evidence_queue_message(360, 'EDGE') $$,
  '55000',
  'evidence consumer mode is not active',
  'EDGE dequeue is denied while NODE consumer mode is active'
);
set local role postgres;
update public.evidence_consumer_control set consumer_mode = 'EDGE' where singleton;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ select public.dequeue_evidence_queue_message(360, 'NODE') $$,
  '55000',
  'evidence consumer mode is not active',
  'NODE dequeue is denied while EDGE consumer mode is active'
);
insert into edge_dequeued select * from public.dequeue_evidence_queue_message(360, 'EDGE');
select is((select count(*)::integer from edge_dequeued), 1, 'one invocation dequeues at most one message');
select is(
  (select message ->> 'processing_run_id' from edge_dequeued),
  '70000000-0000-0000-0000-000000000901',
  'dequeued payload contains only the opaque processing run reference'
);
select lives_ok(
  $$ select public.claim_evidence_processing_run('70000000-0000-0000-0000-000000000901', 300) $$,
  'Edge consumer claims a fenced processing lease'
);
select ok(
  (select lease_token is not null and lease_expires_at > now() from public.processing_runs where id = '70000000-0000-0000-0000-000000000901'),
  'claim stores an unexpired lease token'
);
set local role postgres;
update public.processing_runs
set lease_expires_at = now() + interval '90 seconds'
where id = '70000000-0000-0000-0000-000000000901';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.renew_evidence_processing_lease(
    '70000000-0000-0000-0000-000000000901',
    (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000901'),
    300
  ) $$,
  'lease heartbeat extends an active lease with the matching token'
);
select ok(
  (select lease_expires_at > now() + interval '4 minutes'
   from public.processing_runs where id = '70000000-0000-0000-0000-000000000901'),
  'matching heartbeat moves lease expiry beyond the prior deadline'
);
create temporary table edge_lease_snapshot (lease_expires_at timestamptz) on commit drop;
grant select, insert on edge_lease_snapshot to service_role;
insert into edge_lease_snapshot
select lease_expires_at from public.processing_runs where id = '70000000-0000-0000-0000-000000000901';
select throws_ok(
  $$ select public.renew_evidence_processing_lease(
    '70000000-0000-0000-0000-000000000901',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    300
  ) $$,
  '55000',
  'processing lease is missing, stale, or in the wrong state',
  'lease heartbeat rejects a foreign token'
);
select is(
  (select lease_expires_at::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000901'),
  (select lease_expires_at::text from edge_lease_snapshot),
  'rejected foreign heartbeat leaves lease expiry unchanged'
);
select throws_ok(
  $$ select public.mark_evidence_needs_ocr('70000000-0000-0000-0000-000000000901', 'ffffffff-ffff-ffff-ffff-ffffffffffff') $$,
  '55000',
  'processing lease is missing, stale, or in the wrong state',
  'a stale or foreign invocation cannot mutate the run'
);

set local role postgres;
update public.processing_runs
set lease_expires_at = now() - interval '1 second'
where id = '70000000-0000-0000-0000-000000000901';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ select public.renew_evidence_processing_lease(
    '70000000-0000-0000-0000-000000000901',
    (select lease_token from public.processing_runs where id = '70000000-0000-0000-0000-000000000901'),
    300
  ) $$,
  '55000',
  'processing lease is missing, stale, or in the wrong state',
  'lease heartbeat rejects the matching token after lease expiry'
);
select lives_ok($$ select public.recover_stale_evidence_processing_runs(10) $$, 'expired first attempt is recovered');
select is(
  (select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000901'),
  'RETRY_PENDING',
  'expired first attempt becomes an explicit retry'
);
select lives_ok(
  $$ select public.claim_evidence_processing_run('70000000-0000-0000-0000-000000000901', 300) $$,
  'the single retry can be claimed'
);
set local role postgres;
update public.processing_runs
set lease_expires_at = now() - interval '1 second'
where id = '70000000-0000-0000-0000-000000000901';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$ select public.recover_stale_evidence_processing_runs(10) $$, 'expired second attempt is recovered terminally');
select is(
  (select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000901'),
  'FAILED',
  'two attempts remain the terminal maximum'
);
select is(
  (select count(*)::integer from public.notifications notification
   join public.profiles profile on profile.id = notification.recipient_id
   where notification.aggregate_id = '50000000-0000-0000-0000-000000000901'
     and notification.event_type = 'PROCESSING_FAILED' and profile.role = 'ADMIN'),
  (select count(*)::integer from public.profiles where role = 'ADMIN'),
  'lease exhaustion notifies Admin only through the existing failure contract'
);
select ok(
  not has_table_privilege('service_role', 'public.human_reviews', 'INSERT')
    and not has_function_privilege(
      'service_role',
      'public.create_human_review(uuid,uuid,public.human_decision,text,text,public.review_confidence,text)',
      'EXECUTE'
    ),
  'Edge service identity retains no human decision path'
);

set local role postgres;
delete from pgmq.q_resume_analysis;
delete from pgmq.a_resume_analysis;
select pgmq.send('resume_analysis', '{"unexpected":true}'::jsonb);
truncate edge_dequeued;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into edge_dequeued select * from public.dequeue_evidence_queue_message(360, 'EDGE');
select is((select count(*)::integer from edge_dequeued), 1, 'malformed work is dequeued once');
select lives_ok(
  $$ select public.quarantine_malformed_evidence_queue_message((select msg_id from edge_dequeued)) $$,
  'malformed work is durably quarantined before acknowledgement'
);
set local role postgres;
select is(
  (select count(*)::integer from public.evidence_queue_quarantine where queue_message_id = (select msg_id from edge_dequeued)),
  1,
  'quarantine stores only a payload hash and safe reason'
);
select is(
  (select count(*)::integer from pgmq.a_resume_analysis where msg_id = (select msg_id from edge_dequeued)),
  1,
  'quarantined work is archived after the durable quarantine row exists'
);

set local role postgres;
delete from pgmq.q_resume_analysis;
delete from pgmq.a_resume_analysis;
select pgmq.send(
  'resume_analysis',
  '{"processing_run_id":"70000000-0000-0000-0000-000000000901"}'::jsonb
);
truncate edge_dequeued;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into edge_dequeued select * from public.dequeue_evidence_queue_message(360, 'EDGE');
select is(
  (select count(*)::integer from edge_dequeued),
  1,
  'well-formed processing-run payload is dequeued for normal handling'
);
select throws_ok(
  $$ select public.quarantine_malformed_evidence_queue_message((select msg_id from edge_dequeued)) $$,
  '22023',
  'valid queue payload cannot be quarantined as malformed',
  'well-formed processing-run payload cannot use malformed quarantine'
);
set local role postgres;
select is(
  (select count(*)::integer from pgmq.q_resume_analysis where msg_id = (select msg_id from edge_dequeued)),
  1,
  'rejected malformed quarantine leaves well-formed work in the live queue'
);
select is(
  (select count(*)::integer from pgmq.a_resume_analysis where msg_id = (select msg_id from edge_dequeued)),
  0,
  'rejected malformed quarantine does not archive well-formed work'
);
select is(
  (select count(*)::integer from public.evidence_queue_quarantine where queue_message_id = (select msg_id from edge_dequeued)),
  0,
  'rejected malformed quarantine creates no quarantine record for well-formed work'
);

select * from finish();
rollback;

begin;

select plan(6);

select ok(
  position('net.http_post' in pg_get_functiondef('public.enqueue_resume_processing_run(uuid)'::regprocedure)) > 0,
  'enqueue schedules an immediate Edge invocation'
);
select ok(
  position('pgmq.send' in pg_get_functiondef('public.enqueue_resume_processing_run(uuid)'::regprocedure)) > 0,
  'enqueue persists the queue message before dispatch'
);
select ok(
  position('timeout_milliseconds := 45000' in pg_get_functiondef('public.enqueue_resume_processing_run(uuid)'::regprocedure)) > 0,
  'immediate dispatch allows the bounded AI request to finish'
);
select ok(
  not has_function_privilege('anon', 'public.enqueue_resume_processing_run(uuid)', 'EXECUTE'),
  'anonymous users cannot invoke the privileged enqueue function'
);
select ok(
  not has_function_privilege('authenticated', 'public.enqueue_resume_processing_run(uuid)', 'EXECUTE'),
  'authenticated users cannot invoke the privileged enqueue function directly'
);
select ok(
  not has_function_privilege('service_role', 'public.enqueue_resume_processing_run(uuid)', 'EXECUTE'),
  'service role cannot bypass the approved enqueue workflows directly'
);

select * from finish();
rollback;

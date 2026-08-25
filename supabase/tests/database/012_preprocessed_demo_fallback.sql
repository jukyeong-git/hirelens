begin;
select plan(8);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$ select public.install_preprocessed_demo_evidence() $$,
  'service role installs the synthetic fallback'
);
select lives_ok(
  $$ select public.install_preprocessed_demo_evidence() $$,
  'fallback installation is idempotent'
);
select is(
  (select count(*)::integer from public.processing_runs where id = '70000000-0000-0000-0000-000000000001'),
  1, 'one deterministic fallback run exists'
);
select is(
  (select status::text from public.processing_runs where id = '70000000-0000-0000-0000-000000000001'),
  'COMPLETED', 'fallback run is completed'
);
select is(
  (select model_id from public.processing_runs where id = '70000000-0000-0000-0000-000000000001'),
  'PREPROCESSED_SYNTHETIC', 'fallback is visibly distinct from live OpenAI output'
);
select is(
  (select count(*)::integer from public.evidence_items where processing_run_id = '70000000-0000-0000-0000-000000000001'),
  2, 'every approved synthetic criterion has one result'
);
select is(
  (select count(*)::integer from public.evidence_items where processing_run_id = '70000000-0000-0000-0000-000000000001' and status = 'SUPPORTED'),
  1, 'fallback contains source-validated supported evidence'
);
select is(
  (select count(*)::integer from public.evidence_items where processing_run_id = '70000000-0000-0000-0000-000000000001' and status = 'HUMAN_ONLY'),
  1, 'interview-only criterion remains human-only'
);

select * from finish();
rollback;

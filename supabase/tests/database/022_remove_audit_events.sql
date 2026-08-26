begin;

select plan(8);

select hasnt_table(
  'public',
  'audit_events',
  'the generic audit_events table is removed'
);

select is(
  (select relkind::text from pg_class where oid = 'public.audit_events'::regclass),
  'v',
  'legacy function compatibility uses a non-persistent view'
);

select is(
  (select count(*)::integer from public.audit_events),
  0,
  'the compatibility sink exposes no retained rows to its owner'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_events', 'select'),
  'authenticated users cannot read the compatibility sink'
);

select ok(
  not has_table_privilege('service_role', 'public.audit_events', 'select'),
  'service role cannot read the compatibility sink'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.append_safe_audit(text,text,uuid,jsonb,jsonb,jsonb,text,text,text)',
    'execute'
  ),
  'authenticated users cannot invoke the legacy no-op shim'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where not tgisinternal
      and tgname in ('jobs_write_audit', 'scorecard_versions_write_audit')
  ),
  0,
  'automatic generic audit triggers are removed'
);

select lives_ok(
  $$
    select public.append_safe_audit(
      'LEGACY_TEST',
      'job',
      '10000000-0000-0000-0000-000000000001',
      '{}'::jsonb,
      null,
      null,
      null,
      'test',
      null
    )
  $$,
  'the owner-only legacy shim is a non-persistent no-op'
);

select * from finish();
rollback;

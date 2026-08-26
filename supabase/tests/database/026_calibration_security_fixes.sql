begin;

select plan(13);

-- The public entry points keep their signatures and grants after wrapping.
select ok(
  has_function_privilege(
    'authenticated',
    'public.record_post_interview_review(uuid,uuid,jsonb,text,public.human_decision,text,text,public.review_confidence,text)',
    'EXECUTE'
  ),
  'authenticated users may still invoke the post-interview RPC'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.record_post_interview_review(uuid,uuid,jsonb,text,public.human_decision,text,text,public.review_confidence,text)',
    'EXECUTE'
  ),
  'worker credentials still cannot record interview observations or decisions'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.enqueue_framework_reanalysis(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users may still request a framework reanalysis'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.update_scorecard_draft(uuid,integer,public.scorecard_status,integer,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated users may still update a saved draft'
);

-- The unwrapped bodies must never be reachable from an application role.
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_post_interview_review_unguarded(uuid,uuid,jsonb,text,public.human_decision,text,text,public.review_confidence,text)',
    'EXECUTE'
  ),
  'the unguarded post-interview body is unreachable'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.enqueue_framework_reanalysis_unguarded(uuid,text)',
    'EXECUTE'
  ),
  'the unguarded reanalysis body is unreachable'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.update_scorecard_draft_without_lineage_guard(uuid,integer,public.scorecard_status,integer,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'the draft update body cannot be called past the lineage guard'
);

-- The Admin override must accept a version a later revision superseded.
select ok(
  pg_get_functiondef(
    'public.create_human_review(uuid,uuid,public.human_decision,text,text,public.review_confidence,text)'::regprocedure
  ) like '%SUPERSEDED%',
  'the Admin decision override still accepts superseded scorecard versions'
);

-- An authenticated caller without a profile row must fail closed. The prior
-- AND-chain guards evaluated to NULL for a NULL role, so the `if` never fired.
set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

select throws_ok(
  $$ select public.assert_actor_profile_role() $$,
  '42501',
  'authenticated user has no application profile',
  'a session without a profile row cannot resolve an application role'
);
select throws_ok(
  $$
    select public.record_post_interview_review(
      '50000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '[]'::jsonb,
      null,
      'PROCEED'::public.human_decision,
      'EVIDENCE_REVIEW',
      'unauthorized attempt',
      'HIGH'::public.review_confidence,
      null
    )
  $$,
  '42501',
  'authenticated user has no application profile',
  'a session without a profile row cannot record a human decision'
);
select throws_ok(
  $$
    select public.criterion_calibration_summary('10000000-0000-0000-0000-000000000001')
  $$,
  '42501',
  'authenticated user has no application profile',
  'a session without a profile row cannot read calibration findings'
);
select throws_ok(
  $$
    select public.framework_revision_comparison('10000000-0000-0000-0000-000000000001')
  $$,
  '42501',
  'authenticated user has no application profile',
  'a session without a profile row cannot read the version comparison'
);
select throws_ok(
  $$
    select public.request_hiring_manager_review(
      '50000000-0000-0000-0000-000000000001', null
    )
  $$,
  '42501',
  'authenticated user has no application profile',
  'a session without a profile row cannot create a review assignment'
);

select * from finish();
rollback;

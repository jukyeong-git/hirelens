begin;

select plan(2);

select ok(
  to_regprocedure('public.create_scorecard_revision(uuid,integer,public.scorecard_status,text)') is not null,
  'replacement Review Framework RPC is available through the calibration decision'
);

select ok(
  to_regprocedure('public.update_scorecard_draft(uuid,integer,public.scorecard_status,integer,text,jsonb,jsonb)') is not null,
  'the saved draft remains editable before approval'
);

select * from finish();
rollback;

-- HL-022 forward fix: remove the default PUBLIC execute privilege from the
-- ambiguity review RPC. Only authenticated application users may invoke it.

revoke execute on function public.review_scorecard_ambiguity(
  uuid,
  uuid,
  jsonb,
  text,
  public.criterion_type,
  text,
  jsonb,
  jsonb,
  boolean,
  text,
  text
) from public;

grant execute on function public.review_scorecard_ambiguity(
  uuid,
  uuid,
  jsonb,
  text,
  public.criterion_type,
  text,
  jsonb,
  jsonb,
  boolean,
  text,
  text
) to authenticated;

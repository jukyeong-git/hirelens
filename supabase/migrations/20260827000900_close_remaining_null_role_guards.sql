-- Follow-up to 20260827000800.
--
-- That migration closed the NULL-role fall-through on `record_post_interview_review`,
-- `enqueue_framework_reanalysis`, `criterion_calibration_summary`, and
-- `create_human_review`, but two guards with the same shape were missed:
--
--   * `framework_revision_comparison` delegates to
--     `framework_revision_comparison_without_application_changes`, whose guard is
--     `actor_role <> 'ADMIN' and not (...)`. For a caller with no `public.profiles`
--     row that expression is NULL, so `if NULL then raise` never fires and the
--     comparison — including per-application criterion status changes — is
--     readable by any authenticated session.
--   * `request_hiring_manager_review` (pre-dates this feature, from
--     20260824002300) uses the same AND-chain and lets such a session create a
--     review assignment and move an application to MANAGER_REVIEW_REQUESTED.
--
-- Guards that use `actor_role is distinct from 'ADMIN'` (create_scorecard_revision,
-- update_scorecard_draft) already fail closed and are left alone. So are OR-chain
-- guards such as `record_interview_progression`.
--
-- Forward-only rollback: replace these definitions through a later migration.

alter function public.framework_revision_comparison(uuid)
  rename to framework_revision_comparison_unguarded;

create function public.framework_revision_comparison(target_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_actor_profile_role();
  return public.framework_revision_comparison_unguarded(target_job_id);
end;
$$;

revoke all on function public.framework_revision_comparison_unguarded(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.framework_revision_comparison(uuid)
  from public, anon, service_role;
grant execute on function public.framework_revision_comparison(uuid)
  to authenticated;

alter function public.request_hiring_manager_review(uuid, text)
  rename to request_hiring_manager_review_unguarded;

create function public.request_hiring_manager_review(
  target_application_id uuid,
  request_note_value text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_actor_profile_role();
  return public.request_hiring_manager_review_unguarded(
    target_application_id, request_note_value
  );
end;
$$;

revoke all on function public.request_hiring_manager_review_unguarded(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.request_hiring_manager_review(uuid, text)
  from public, anon, service_role;
grant execute on function public.request_hiring_manager_review(uuid, text)
  to authenticated;

-- Surface a criterion that has crossed into REVIEW_REQUIRED, at the moment it
-- crosses.
--
-- Until now `criterion_calibration_summary` was only ever evaluated when
-- somebody opened the Review Framework tab, so a criterion could sit in
-- REVIEW_REQUIRED indefinitely with nobody told. The threshold is crossed by
-- the act of recording a post-interview review, so that is where the notice
-- belongs.
--
-- The trigger fires on `human_reviews` rather than on `interview_observations`:
-- the review row is written once, after every observation in the session has
-- landed, so the calibration is computed against a complete session exactly
-- once. Firing per observation would evaluate partial sessions.
--
-- Notifications stay idempotent through the existing
-- `(recipient_id, event_type, aggregate_id, relevant_version)` unique
-- constraint, keyed by criterion lineage: a second interview that keeps the
-- same criterion in REVIEW_REQUIRED does not produce a second unread item, and
-- a criterion that returns to REVIEW_REQUIRED after a revision carries a new
-- lineage and therefore notifies again.
--
-- Forward-only rollback: drop the trigger to stop emitting.

create function public.notify_criterion_review_required()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_job_id uuid;
  target_recruiter_id uuid;
  target_hiring_manager_id uuid;
  finding record;
  recipient uuid;
begin
  -- Only a review recorded together with criterion observations can change a
  -- calibration. The Admin operational override writes no observations.
  if new.observation_session_id is null then
    return new;
  end if;

  select job.id, job.recruiter_id, job.hiring_manager_id
  into target_job_id, target_recruiter_id, target_hiring_manager_id
  from public.applications application
  join public.jobs job on job.id = application.job_id
  where application.id = new.application_id;

  if target_job_id is null then
    return new;
  end if;

  for finding in
    select
      summary.lineage_id,
      summary.criterion_name,
      summary.criterion_type,
      summary.supported_observations,
      summary.level_insufficient_count
    from public.criterion_calibration_summary(target_job_id) summary
    where summary.status = 'REVIEW_REQUIRED'
  loop
    foreach recipient in array array_remove(
      array[target_recruiter_id, target_hiring_manager_id]::uuid[],
      null
    )
    loop
      insert into public.notifications (
        recipient_id,
        event_type,
        aggregate_type,
        aggregate_id,
        relevant_version,
        safe_metadata
      ) values (
        recipient,
        'CRITERION_REVIEW_REQUIRED',
        'job',
        target_job_id,
        finding.lineage_id::text,
        -- Criterion names are authored by the hiring team, never by a
        -- candidate, so no candidate-derived text reaches the notification.
        jsonb_build_object(
          'criterion_name', finding.criterion_name,
          'criterion_type', finding.criterion_type,
          'supported_observations', finding.supported_observations,
          'level_insufficient_count', finding.level_insufficient_count
        )
      )
      on conflict (recipient_id, event_type, aggregate_id, relevant_version) do nothing;
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_criterion_review_required() from public, anon, authenticated;

create trigger human_reviews_notify_criterion_review_required
after insert on public.human_reviews
for each row execute function public.notify_criterion_review_required();

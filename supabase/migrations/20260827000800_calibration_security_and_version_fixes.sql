-- Forward fixes for the FW-0..FW-4 calibration slice.
--
-- 1. An authenticated user without a `public.profiles` row could pass the
--    `actor_role <> 'ADMIN' and not (...)` guards, because three-valued logic
--    makes that expression NULL rather than TRUE. `if NULL then raise` never
--    fires, so the caller reached the human-decision write path. Existing RPCs
--    avoid this with OR-chains that fail closed; the new ones use AND-chains.
-- 2. `create_human_review` was narrowed to `status = 'APPROVED'`, which locks
--    the Admin override out of every application analysed under a version that
--    a later revision superseded.
-- 3. `criterion_calibration_summary` scanned all of `evidence_items` on every
--    call because its CTE had no run filter and `distinct` blocked inlining.
-- 4. `update_scorecard_draft` recovers criterion lineage by `client_id` alone,
--    so a draft whose client ids were all regenerated silently detached every
--    criterion from its calibration history.
--
-- Forward-only rollback: replace these definitions through a later migration.

-- 1. Fail closed when the caller has no application profile. -----------------

create function public.assert_actor_profile_role()
returns public.app_role
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role is null then
    raise exception 'authenticated user has no application profile' using errcode = '42501';
  end if;
  return actor_role;
end;
$$;
revoke all on function public.assert_actor_profile_role() from public, anon;
grant execute on function public.assert_actor_profile_role() to authenticated;
alter function public.record_post_interview_review(
  uuid, uuid, jsonb, text, public.human_decision, text, text,
  public.review_confidence, text
) rename to record_post_interview_review_unguarded;
create function public.record_post_interview_review(
  target_application_id uuid,
  target_scorecard_version_id uuid,
  observations jsonb,
  off_criteria_reason_value text,
  new_decision public.human_decision,
  new_reason_code text,
  new_reason_detail text,
  new_confidence public.review_confidence,
  new_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_actor_profile_role();
  return public.record_post_interview_review_unguarded(
    target_application_id, target_scorecard_version_id, observations,
    off_criteria_reason_value, new_decision, new_reason_code,
    new_reason_detail, new_confidence, new_note
  );
end;
$$;
revoke all on function public.record_post_interview_review_unguarded(
  uuid, uuid, jsonb, text, public.human_decision, text, text,
  public.review_confidence, text
) from public, anon, authenticated, service_role;
revoke execute on function public.record_post_interview_review(
  uuid, uuid, jsonb, text, public.human_decision, text, text,
  public.review_confidence, text
) from public, anon, service_role;
grant execute on function public.record_post_interview_review(
  uuid, uuid, jsonb, text, public.human_decision, text, text,
  public.review_confidence, text
) to authenticated;
alter function public.enqueue_framework_reanalysis(uuid, text)
  rename to enqueue_framework_reanalysis_unguarded;
create function public.enqueue_framework_reanalysis(
  target_job_id uuid,
  target_pipeline_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_actor_profile_role();
  return public.enqueue_framework_reanalysis_unguarded(
    target_job_id, target_pipeline_version
  );
end;
$$;
revoke all on function public.enqueue_framework_reanalysis_unguarded(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.enqueue_framework_reanalysis(uuid, text)
  from public, anon, service_role;
grant execute on function public.enqueue_framework_reanalysis(uuid, text)
  to authenticated;
-- 2. Restore the superseded-version path for the Admin override. -------------

create or replace function public.create_human_review(
  target_application_id uuid,
  target_scorecard_version_id uuid,
  new_decision public.human_decision,
  new_reason_code text,
  new_reason_detail text,
  new_confidence public.review_confidence,
  new_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role := public.assert_actor_profile_role();
  target_job_id uuid;
  normalized_code text := trim(coalesce(new_reason_code, ''));
  normalized_detail text := trim(coalesce(new_reason_detail, ''));
  previous_review public.human_reviews%rowtype;
  created_review_id uuid;
begin
  if actor_role <> 'ADMIN'::public.app_role then
    raise exception 'post-interview observations are required for Hiring Manager decisions'
      using errcode = '42501';
  end if;
  select application.job_id into target_job_id
  from public.applications application
  where application.id = target_application_id
  for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if normalized_code = ''
     or normalized_detail = ''
     or length(normalized_code) > 100
     or length(normalized_detail) > 2000 then
    raise exception 'reason code and detail are required' using errcode = '22023';
  end if;
  -- A revision supersedes the version an application was analysed under. The
  -- Admin override exists for exactly those historical applications, so it must
  -- accept any human-approved version of the same Job, not only the active one.
  if not exists (
    select 1 from public.scorecard_versions scorecard
    where scorecard.id = target_scorecard_version_id
      and scorecard.job_id = target_job_id
      and scorecard.approved_at is not null
      and scorecard.status in (
        'APPROVED'::public.scorecard_status,
        'SUPERSEDED'::public.scorecard_status
      )
  ) then
    raise exception 'review requires an approved scorecard for the application job'
      using errcode = '22023';
  end if;
  select * into previous_review
  from public.human_reviews
  where application_id = target_application_id
  order by created_at desc, id desc
  limit 1
  for update;
  insert into public.human_reviews (
    application_id,
    scorecard_version_id,
    reviewer_id,
    decision,
    reason_code,
    reason_detail,
    confidence,
    note,
    supersedes_review_id
  ) values (
    target_application_id,
    target_scorecard_version_id,
    actor,
    new_decision,
    normalized_code,
    normalized_detail,
    new_confidence,
    nullif(trim(coalesce(new_note, '')), ''),
    previous_review.id
  )
  returning id into created_review_id;
  perform public.append_safe_audit(
    case
      when previous_review.id is null then 'HUMAN_DECISION_CREATED'
      else 'HUMAN_DECISION_CHANGED'
    end,
    'application',
    target_application_id,
    jsonb_build_object(
      'review_id', created_review_id,
      'actor_role', actor_role::text,
      'reason_code', normalized_code
    ),
    case
      when previous_review.id is null then null
      else jsonb_build_object(
        'review_id', previous_review.id,
        'decision', previous_review.decision::text
      )
    end,
    jsonb_build_object(
      'review_id', created_review_id,
      'decision', new_decision::text,
      'confidence', new_confidence::text
    ),
    null,
    'human_review',
    target_scorecard_version_id::text
  );
  return created_review_id;
end;
$$;
-- 3. Scope the calibration evidence lookup to the runs it actually joins. -----

create or replace function public.criterion_calibration_summary(target_job_id uuid)
returns table (
  lineage_id uuid,
  criterion_id uuid,
  criterion_name text,
  criterion_type public.criterion_type,
  status text,
  supported_observations bigint,
  level_insufficient_count bigint,
  mismatch_ratio numeric,
  false_claim_excluded_count bigint,
  ai_misread_excluded_count bigint,
  confirmed_observation_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role := public.assert_actor_profile_role();
  assigned_hiring_manager_id uuid;
begin
  select hiring_manager_id into assigned_hiring_manager_id
  from public.jobs
  where id = target_job_id;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'HIRING_MANAGER'::public.app_role
    and assigned_hiring_manager_id = actor
  ) then
    raise exception 'assigned Hiring Manager or Admin required' using errcode = '42501';
  end if;

  return query
  with ranked_sessions as (
    select
      session.*,
      row_number() over (
        partition by session.application_id
        order by session.created_at desc, session.id desc
      ) as session_rank
    from public.interview_observation_sessions session
    join public.applications application on application.id = session.application_id
    where application.job_id = target_job_id
  ),
  current_sessions as (
    select * from ranked_sessions where session_rank = 1
  ),
  ranked_runs as (
    select
      run.*,
      row_number() over (
        partition by run.application_id, run.scorecard_version_id
        order by run.completed_at desc nulls last, run.created_at desc, run.id desc
      ) as run_rank
    from public.processing_runs run
    join public.applications application on application.id = run.application_id
    where application.job_id = target_job_id
      and run.status = 'COMPLETED'::public.processing_run_status
  ),
  current_runs as (
    select * from ranked_runs where run_rank = 1
  ),
  evidence_statuses as (
    select distinct item.processing_run_id, item.criterion_id, item.status
    from public.evidence_items item
    where item.processing_run_id in (select current_runs.id from current_runs)
  ),
  observation_facts as (
    select
      observation.criterion_lineage_id,
      observation.verdict,
      observation.weakness_type,
      evidence.status as evidence_status
    from current_sessions session
    join public.interview_observations observation
      on observation.interview_observation_session_id = session.id
    left join current_runs run
      on run.application_id = session.application_id
      and run.scorecard_version_id = session.scorecard_version_id
    left join evidence_statuses evidence
      on evidence.processing_run_id = run.id
      and evidence.criterion_id = observation.criterion_id
    where observation.confirmed_at is not null
  ),
  aggregates as (
    select
      fact.criterion_lineage_id,
      count(*) filter (
        where fact.evidence_status = 'SUPPORTED'::public.evidence_status
          and not (
            fact.verdict = 'WEAKER'::public.interview_criterion_verdict
            and fact.weakness_type in (
              'FALSE_CLAIM'::public.interview_weakness_type,
              'AI_MISREAD'::public.interview_weakness_type
            )
          )
      ) as supported_observations,
      count(*) filter (
        where fact.evidence_status = 'SUPPORTED'::public.evidence_status
          and fact.verdict = 'WEAKER'::public.interview_criterion_verdict
          and fact.weakness_type = 'LEVEL_INSUFFICIENT'::public.interview_weakness_type
      ) as level_insufficient_count,
      count(*) filter (
        where fact.evidence_status = 'SUPPORTED'::public.evidence_status
          and fact.verdict = 'WEAKER'::public.interview_criterion_verdict
          and fact.weakness_type = 'FALSE_CLAIM'::public.interview_weakness_type
      ) as false_claim_excluded_count,
      count(*) filter (
        where fact.evidence_status = 'SUPPORTED'::public.evidence_status
          and fact.verdict = 'WEAKER'::public.interview_criterion_verdict
          and fact.weakness_type = 'AI_MISREAD'::public.interview_weakness_type
      ) as ai_misread_excluded_count,
      count(*) as confirmed_observation_count
    from observation_facts fact
    group by fact.criterion_lineage_id
  )
  select
    criterion.lineage_id,
    criterion.id,
    criterion.name,
    criterion.type,
    case
      when coalesce(aggregate.level_insufficient_count, 0) >= 3
        and coalesce(aggregate.supported_observations, 0) > 0
        and aggregate.level_insufficient_count::numeric
          / aggregate.supported_observations::numeric >= 0.4
      then 'REVIEW_REQUIRED'
      else 'OBSERVING'
    end,
    coalesce(aggregate.supported_observations, 0),
    coalesce(aggregate.level_insufficient_count, 0),
    case
      when coalesce(aggregate.supported_observations, 0) = 0 then 0::numeric
      else round(
        aggregate.level_insufficient_count::numeric
          / aggregate.supported_observations::numeric,
        4
      )
    end,
    coalesce(aggregate.false_claim_excluded_count, 0),
    coalesce(aggregate.ai_misread_excluded_count, 0),
    coalesce(aggregate.confirmed_observation_count, 0)
  from public.scorecard_versions version
  join public.criteria criterion on criterion.scorecard_version_id = version.id
  left join aggregates aggregate on aggregate.criterion_lineage_id = criterion.lineage_id
  where version.job_id = target_job_id
    and version.status = 'APPROVED'::public.scorecard_status
  order by criterion.display_order, criterion.id;
end;
$$;
-- 4. Refuse a draft update that would detach every calibration lineage. -------

alter function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) rename to update_scorecard_draft_without_lineage_guard;
create function public.update_scorecard_draft(
  target_scorecard_version_id uuid,
  expected_version_number integer,
  expected_status public.scorecard_status,
  expected_content_revision integer,
  reason text,
  ambiguous_phrases jsonb,
  draft_criteria jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Lineage is recovered by matching `client_id` against the criteria already
  -- stored on this draft. Regenerating a draft (for example by requesting a new
  -- AI proposal inside a revision) replaces every client id, which would mint
  -- fresh lineages and silently reset every calibration finding to OBSERVING.
  -- Reject only the total-detachment case; renames, additions, and removals
  -- keep working.
  if jsonb_typeof(draft_criteria) = 'array'
     and jsonb_array_length(draft_criteria) > 0
     and exists (
       select 1
       from public.criteria prior
       join public.interview_observations observation
         on observation.criterion_lineage_id = prior.lineage_id
         and observation.confirmed_at is not null
       where prior.scorecard_version_id = target_scorecard_version_id
     )
     and not exists (
       select 1
       from public.criteria prior
       join jsonb_array_elements(draft_criteria) item
         on item->>'client_id' = prior.client_id
       where prior.scorecard_version_id = target_scorecard_version_id
     ) then
    raise exception
      'this draft would detach every criterion from its calibration history; reload the draft before saving'
      using errcode = '40001';
  end if;

  perform public.update_scorecard_draft_without_lineage_guard(
    target_scorecard_version_id, expected_version_number, expected_status,
    expected_content_revision, reason, ambiguous_phrases, draft_criteria
  );
end;
$$;
revoke all on function public.update_scorecard_draft_without_lineage_guard(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke execute on function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) from public, anon, service_role;
grant execute on function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) to authenticated;

-- FW-2: deterministic criterion calibration from confirmed human observations.
-- This function is read-only and cannot revise criteria, evidence, or decisions.

create function public.criterion_calibration_summary(target_job_id uuid)
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
  actor_role public.app_role;
  assigned_hiring_manager_id uuid;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = actor;
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

revoke execute on function public.criterion_calibration_summary(uuid)
  from public, anon, service_role;
grant execute on function public.criterion_calibration_summary(uuid)
  to authenticated;


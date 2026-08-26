-- Complete FW-4 comparison with opaque per-application criterion status
-- changes. This remains evidence-only and does not read or write human
-- decisions.

alter function public.framework_revision_comparison(uuid)
  rename to framework_revision_comparison_without_application_changes;

create function public.framework_revision_comparison(target_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  previous_version_id uuid;
  active_version_id uuid;
  application_changes jsonb;
begin
  result := public.framework_revision_comparison_without_application_changes(target_job_id);
  if result is null then
    return null;
  end if;
  previous_version_id := (result->'versions'->0->>'id')::uuid;
  active_version_id := (result->'versions'->1->>'id')::uuid;

  with ranked_runs as (
    select run.*, row_number() over (
      partition by run.application_id, run.scorecard_version_id
      order by run.created_at desc, run.id desc
    ) as run_rank
    from public.processing_runs run
    where run.scorecard_version_id in (previous_version_id, active_version_id)
      and run.status = 'COMPLETED'::public.processing_run_status
  ),
  latest_runs as (
    select * from ranked_runs where run_rank = 1
  ),
  evidence_statuses as (
    select
      run.application_id,
      run.scorecard_version_id,
      criterion.lineage_id,
      max(item.status::text) as status
    from latest_runs run
    join public.evidence_items item on item.processing_run_id = run.id
    join public.criteria criterion on criterion.id = item.criterion_id
    group by run.application_id, run.scorecard_version_id, criterion.lineage_id
  ),
  before_statuses as (
    select application_id, lineage_id, status
    from evidence_statuses where scorecard_version_id = previous_version_id
  ),
  after_statuses as (
    select application_id, lineage_id, status
    from evidence_statuses where scorecard_version_id = active_version_id
  ),
  changes as (
    select
      before.application_id,
      before.lineage_id,
      before.status as before_status,
      after.status as after_status
    from before_statuses before
    join after_statuses after
      on after.application_id = before.application_id
      and after.lineage_id = before.lineage_id
    where before.status is distinct from after.status
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'application_id', delta.application_id,
        'lineage_id', delta.lineage_id,
        'criterion_name', coalesce(active_criterion.name, previous_criterion.name),
        'before_status', delta.before_status,
        'after_status', delta.after_status
      )
      order by delta.application_id, coalesce(active_criterion.display_order, previous_criterion.display_order)
    ),
    '[]'::jsonb
  )
  into application_changes
  from changes delta
  left join public.criteria active_criterion
    on active_criterion.scorecard_version_id = active_version_id
    and active_criterion.lineage_id = delta.lineage_id
  left join public.criteria previous_criterion
    on previous_criterion.scorecard_version_id = previous_version_id
    and previous_criterion.lineage_id = delta.lineage_id;

  return result || jsonb_build_object('application_changes', application_changes);
end;
$$;

revoke all on function public.framework_revision_comparison_without_application_changes(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.framework_revision_comparison(uuid)
  from public, anon, service_role;
grant execute on function public.framework_revision_comparison(uuid)
  to authenticated;

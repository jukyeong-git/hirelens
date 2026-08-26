-- Remove the legacy SCIM-inspired audit-event subsystem from the active schema.
-- Domain-owned histories (requisition/posting status, review notes, interview
-- progression, and human decisions) remain authoritative and are not changed.
--
-- Existing SECURITY DEFINER functions from applied migrations still invoke
-- append_safe_audit or insert into public.audit_events. A private no-op function
-- and non-readable insert sink keep those workflows compatible without storing
-- or exposing audit data. New code must not call either compatibility object.
--
-- Rollback is forward-fix only: dropping the table permanently removes existing
-- audit rows. Restoring the subsystem would require a new migration and cannot
-- reconstruct the removed history.

drop trigger if exists jobs_write_audit on public.jobs;
drop trigger if exists scorecard_versions_write_audit on public.scorecard_versions;

drop function if exists public.write_job_audit();
drop function if exists public.write_scorecard_audit();

create or replace function public.append_safe_audit(
  audit_event_type text,
  audit_aggregate_type text,
  audit_aggregate_id uuid,
  audit_safe_metadata jsonb,
  audit_before_data jsonb,
  audit_after_data jsonb,
  audit_reason text,
  audit_source text,
  audit_version_ref text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Deprecated compatibility shim. Audit persistence was removed in 20260826001100.
  return;
end;
$$;

revoke all on function public.append_safe_audit(
  text, text, uuid, jsonb, jsonb, jsonb, text, text, text
) from public, anon, authenticated, service_role;

drop table public.audit_events cascade;

-- Direct INSERT statements inside older PL/pgSQL function bodies are resolved
-- at execution time. This zero-row, non-readable sink avoids breaking those
-- workflows while ensuring no audit event is retained.
create view public.audit_events as
select
  null::uuid as id,
  null::text as event_type,
  null::text as actor_type,
  null::uuid as actor_id,
  null::text as aggregate_type,
  null::uuid as aggregate_id,
  null::uuid as correlation_id,
  null::jsonb as safe_metadata,
  null::jsonb as before_data,
  null::jsonb as after_data,
  null::text as reason,
  null::text as source,
  null::text as result,
  null::text as version_ref,
  null::timestamptz as created_at
where false;

create rule audit_events_ignore_legacy_insert as
on insert to public.audit_events
do instead nothing;

revoke all on public.audit_events from public, anon, authenticated, service_role;

comment on view public.audit_events is
  'Private non-persistent compatibility sink for legacy function bodies; not an audit log.';

-- Security forward fixes after the HL-033~045 privacy gate.
-- Preserve all append-only evidence, review, and audit history.

alter table public.evidence_items
  add constraint evidence_items_source_quote_hash_required check (
    resume_page_id is null or source_quote_hash is not null
  ),
  add constraint evidence_items_source_page_hash_required check (
    resume_page_id is null or source_page_hash is not null
  );

create function public.mark_evidence_needs_ocr(target_processing_run_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_worker_service_role();
  update public.processing_runs
  set status = 'NEEDS_OCR'::public.processing_run_status,
      extracting_at = null,
      completed_at = now(),
      error_category = null,
      error_detail_safe = null
  where id = target_processing_run_id
    and status = 'EXTRACTING'::public.processing_run_status;
  if not found then raise exception 'processing run is not extracting' using errcode = '55000'; end if;
end $$;

revoke execute on function public.mark_evidence_needs_ocr(uuid) from public, anon, authenticated;
grant execute on function public.mark_evidence_needs_ocr(uuid) to service_role;

-- Superseded worker entry points must no longer be callable. The evidence
-- state-machine RPCs introduced in migration 022 are the only worker path.
revoke execute on function public.claim_resume_extraction_run(uuid),
  public.complete_resume_extraction(uuid, jsonb),
  public.mark_resume_extraction_needs_ocr(uuid),
  public.fail_resume_extraction(uuid, public.processing_error_category, boolean)
  from service_role;

create or replace function public.create_human_review(
  target_application_id uuid,
  target_scorecard_version_id uuid,
  new_decision public.human_decision,
  new_reason_code text,
  new_reason_detail text,
  new_confidence public.review_confidence,
  new_note text default null
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  assigned_manager uuid;
  normalized_code text := trim(coalesce(new_reason_code, ''));
  normalized_detail text := trim(coalesce(new_reason_detail, ''));
  previous_review public.human_reviews%rowtype;
  latest_interview public.interview_progression_reviews%rowtype;
  created_review_id uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select profile.role into actor_role from public.profiles profile where profile.id = actor;
  select application.job_id, job.hiring_manager_id into target_job_id, assigned_manager
  from public.applications application
  join public.jobs job on job.id = application.job_id
  where application.id = target_application_id
  for update of application, job;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;

  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'HIRING_MANAGER'::public.app_role
    and assigned_manager = actor
    and public.has_active_review_assignment(target_application_id, actor)
  ) then raise exception 'not authorized to create human review' using errcode = '42501'; end if;

  if actor_role = 'HIRING_MANAGER'::public.app_role then
    select * into latest_interview
    from public.interview_progression_reviews
    where application_id = target_application_id
    order by created_at desc, id desc limit 1;
    if latest_interview.id is null or latest_interview.outcome <> 'INTERVIEW'::public.interview_progression_outcome then
      raise exception 'final decision requires a prior INTERVIEW progression outcome' using errcode = '55000';
    end if;
  end if;

  if normalized_code = '' or normalized_detail = ''
    or length(normalized_code) > 100 or length(normalized_detail) > 2000
  then raise exception 'reason code and detail are required' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.scorecard_versions scorecard
    where scorecard.id = target_scorecard_version_id
      and scorecard.job_id = target_job_id
      and scorecard.approved_at is not null
      and scorecard.status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)
  ) then raise exception 'review requires an approved scorecard for the application job' using errcode = '22023'; end if;

  select * into previous_review from public.human_reviews
  where application_id = target_application_id
  order by created_at desc, id desc limit 1 for update;

  insert into public.human_reviews (
    application_id, scorecard_version_id, reviewer_id, decision, reason_code,
    reason_detail, confidence, note, supersedes_review_id
  ) values (
    target_application_id, target_scorecard_version_id, actor, new_decision,
    normalized_code, normalized_detail, new_confidence,
    nullif(trim(coalesce(new_note, '')), ''), previous_review.id
  ) returning id into created_review_id;

  perform public.append_safe_audit(
    case when previous_review.id is null then 'HUMAN_DECISION_CREATED' else 'HUMAN_DECISION_CHANGED' end,
    'application', target_application_id,
    jsonb_build_object('review_id', created_review_id, 'actor_role', actor_role::text, 'reason_code', normalized_code),
    case when previous_review.id is null then null else jsonb_build_object('review_id', previous_review.id, 'decision', previous_review.decision::text) end,
    jsonb_build_object('review_id', created_review_id, 'decision', new_decision::text, 'confidence', new_confidence::text),
    null, 'human_review', target_scorecard_version_id::text
  );
  return created_review_id;
end $$;

revoke execute on function public.create_human_review(
  uuid, uuid, public.human_decision, text, text, public.review_confidence, text
) from public, anon, service_role;
grant execute on function public.create_human_review(
  uuid, uuid, public.human_decision, text, text, public.review_confidence, text
) to authenticated;

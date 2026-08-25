-- HL-040~043 Recruiter review request and Hiring Manager interview gate.
-- Forward-only rollback: review requests, outcomes, notifications, and audit
-- events are business history and must not be deleted.

alter table public.review_assignments
  add column request_note text check (request_note is null or length(request_note) <= 2000);

create type public.interview_progression_outcome as enum (
  'INTERVIEW',
  'HOLD',
  'MORE_INFORMATION_REQUIRED'
);

create table public.interview_progression_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  scorecard_version_id uuid not null references public.scorecard_versions (id) on delete restrict,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  outcome public.interview_progression_outcome not null,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  supersedes_review_id uuid unique references public.interview_progression_reviews (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index interview_progression_application_created_idx
  on public.interview_progression_reviews (application_id, created_at desc);

create trigger interview_progression_prevent_update_or_delete
before update or delete on public.interview_progression_reviews
for each row execute function public.prevent_review_history_mutation();

alter table public.interview_progression_reviews enable row level security;
create policy interview_progression_select_assigned
  on public.interview_progression_reviews for select to authenticated
  using (public.can_access_application(application_id));
grant select on public.interview_progression_reviews to authenticated;
revoke insert, update, delete on public.interview_progression_reviews from anon, authenticated, service_role;

create function public.request_hiring_manager_review(
  target_application_id uuid,
  request_note_value text default null
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job public.jobs%rowtype;
  assignment_id uuid;
  normalized_note text := nullif(trim(coalesce(request_note_value, '')), '');
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select job.* into target_job
  from public.applications application
  join public.jobs job on job.id = application.job_id
  where application.id = target_application_id
  for update of application, job;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'RECRUITER'::public.app_role and target_job.recruiter_id = actor
  ) then raise exception 'assigned Recruiter or Admin required' using errcode = '42501'; end if;
  if normalized_note is not null and length(normalized_note) > 2000 then
    raise exception 'review request note is too long' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.processing_runs run
    where run.application_id = target_application_id
      and run.status in (
        'COMPLETED'::public.processing_run_status,
        'NEEDS_OCR'::public.processing_run_status,
        'FAILED'::public.processing_run_status,
        'QUARANTINED'::public.processing_run_status
      )
  ) then raise exception 'application processing is not reviewable' using errcode = '55000'; end if;

  select id into assignment_id from public.review_assignments
  where application_id = target_application_id
    and assigned_to = target_job.hiring_manager_id
    and status = 'ACTIVE'::public.review_assignment_status
  order by created_at desc limit 1;
  if assignment_id is not null then return assignment_id; end if;

  insert into public.review_assignments (
    application_id, assigned_to, assigned_by, request_note
  ) values (
    target_application_id, target_job.hiring_manager_id, actor, normalized_note
  ) returning id into assignment_id;

  update public.applications
  set workflow_state = 'MANAGER_REVIEW_REQUESTED'
  where id = target_application_id;

  insert into public.notifications (
    recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata
  ) values (
    target_job.hiring_manager_id,
    'REVIEW_ASSIGNMENT',
    'application',
    target_application_id,
    assignment_id::text,
    jsonb_build_object('assignment_id', assignment_id, 'job_id', target_job.id)
  ) on conflict do nothing;

  perform public.append_safe_audit(
    'HIRING_MANAGER_REVIEW_REQUESTED', 'application', target_application_id,
    jsonb_build_object('assignment_id', assignment_id, 'assigned_to', target_job.hiring_manager_id),
    null, null, null, 'human_review_request'
  );
  return assignment_id;
end $$;

create function public.record_interview_progression(
  target_application_id uuid,
  target_scorecard_version_id uuid,
  new_outcome public.interview_progression_outcome,
  new_reason text
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job public.jobs%rowtype;
  normalized_reason text := trim(coalesce(new_reason, ''));
  previous_review public.interview_progression_reviews%rowtype;
  created_review_id uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select job.* into target_job
  from public.applications application
  join public.jobs job on job.id = application.job_id
  where application.id = target_application_id
  for update of application, job;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if actor_role <> 'HIRING_MANAGER'::public.app_role
    or target_job.hiring_manager_id <> actor
    or not public.has_active_review_assignment(target_application_id, actor)
  then raise exception 'assigned Hiring Manager review request required' using errcode = '42501'; end if;
  if normalized_reason = '' or length(normalized_reason) > 2000 then
    raise exception 'interview progression reason is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.scorecard_versions scorecard
    where scorecard.id = target_scorecard_version_id
      and scorecard.job_id = target_job.id
      and scorecard.approved_at is not null
      and scorecard.status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)
  ) then raise exception 'approved review framework version required' using errcode = '22023'; end if;

  select * into previous_review from public.interview_progression_reviews
  where application_id = target_application_id
  order by created_at desc, id desc limit 1 for update;

  insert into public.interview_progression_reviews (
    application_id, scorecard_version_id, reviewer_id, outcome, reason, supersedes_review_id
  ) values (
    target_application_id, target_scorecard_version_id, actor, new_outcome,
    normalized_reason, previous_review.id
  ) returning id into created_review_id;

  update public.applications set workflow_state = case new_outcome
    when 'INTERVIEW'::public.interview_progression_outcome then 'INTERVIEW_SELECTED'
    when 'HOLD'::public.interview_progression_outcome then 'INTERVIEW_HOLD'
    else 'MORE_INFORMATION_REQUIRED'
  end where id = target_application_id;

  insert into public.notifications (
    recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata
  ) values (
    target_job.recruiter_id,
    'DECISION_FOLLOW_UP',
    'application',
    target_application_id,
    created_review_id::text,
    jsonb_build_object('interview_progression_review_id', created_review_id, 'outcome', new_outcome::text)
  ) on conflict do nothing;

  perform public.append_safe_audit(
    case when previous_review.id is null then 'INTERVIEW_PROGRESSION_RECORDED' else 'INTERVIEW_PROGRESSION_CHANGED' end,
    'application', target_application_id,
    jsonb_build_object('interview_progression_review_id', created_review_id),
    case when previous_review.id is null then null else jsonb_build_object('review_id', previous_review.id, 'outcome', previous_review.outcome::text) end,
    jsonb_build_object('review_id', created_review_id, 'outcome', new_outcome::text),
    null, 'human_interview_progression', target_scorecard_version_id::text
  );
  return created_review_id;
end $$;

revoke execute on function public.request_hiring_manager_review(uuid, text),
  public.record_interview_progression(uuid, uuid, public.interview_progression_outcome, text)
  from public, anon, service_role;
grant execute on function public.request_hiring_manager_review(uuid, text),
  public.record_interview_progression(uuid, uuid, public.interview_progression_outcome, text)
  to authenticated;

-- Phase 1 application review, versioned recruiter notes, and in-app notifications.
-- Rollback note: reviews, note versions, and audit events are append-only. Apply a
-- forward migration to revoke RPCs or correct behavior; do not delete history.

create type public.human_decision as enum ('PROCEED', 'HOLD', 'DO_NOT_PROCEED');
create type public.review_confidence as enum ('HIGH', 'MEDIUM', 'LOW');
create type public.review_assignment_status as enum ('ACTIVE', 'COMPLETED', 'CANCELLED');

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  demo_label text not null check (length(trim(demo_label)) > 0),
  created_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete restrict,
  job_id uuid not null references public.jobs (id) on delete restrict,
  source text not null default 'DEMO' check (length(trim(source)) > 0),
  submitted_at timestamptz not null default now(),
  workflow_state text not null default 'NEW' check (length(trim(workflow_state)) > 0),
  created_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create table public.review_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  assigned_to uuid not null references public.profiles (id) on delete restrict,
  assigned_by uuid not null references public.profiles (id) on delete restrict,
  due_at timestamptz,
  status public.review_assignment_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index review_assignments_one_active_assignee_idx
  on public.review_assignments (application_id, assigned_to)
  where status = 'ACTIVE'::public.review_assignment_status;
create index applications_job_submitted_idx on public.applications (job_id, submitted_at desc);
create index applications_job_workflow_idx on public.applications (job_id, workflow_state);
create index review_assignments_assignee_status_due_idx
  on public.review_assignments (assigned_to, status, due_at);

create table public.human_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  scorecard_version_id uuid not null references public.scorecard_versions (id) on delete restrict,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  decision public.human_decision not null,
  reason_code text not null check (length(trim(reason_code)) > 0 and length(trim(reason_code)) <= 100),
  reason_detail text not null check (length(trim(reason_detail)) > 0 and length(trim(reason_detail)) <= 2000),
  confidence public.review_confidence not null,
  note text check (note is null or length(note) <= 2000),
  supersedes_review_id uuid unique references public.human_reviews (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index human_reviews_application_created_idx on public.human_reviews (application_id, created_at desc);

create table public.review_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((deleted_at is null and deleted_by is null) or (deleted_at is not null and deleted_by is not null))
);
create table public.review_note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.review_notes (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (note_id, version_number)
);
create index review_notes_application_active_idx on public.review_notes (application_id, created_at desc)
  where deleted_at is null;
create index review_note_versions_note_version_idx on public.review_note_versions (note_id, version_number desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null check (length(trim(event_type)) > 0 and length(trim(event_type)) <= 100),
  aggregate_type text not null check (length(trim(aggregate_type)) > 0 and length(trim(aggregate_type)) <= 100),
  aggregate_id uuid not null,
  relevant_version text not null default '',
  safe_metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_type, aggregate_id, relevant_version)
);
create index notifications_recipient_read_created_idx
  on public.notifications (recipient_id, read_at, created_at desc);

create or replace function public.prevent_review_history_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;
create trigger human_reviews_prevent_update_or_delete
before update or delete on public.human_reviews
for each row execute function public.prevent_review_history_mutation();
create trigger review_note_versions_prevent_update_or_delete
before update or delete on public.review_note_versions
for each row execute function public.prevent_review_history_mutation();

create or replace function public.can_access_application(target_application_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.applications application
    where application.id = target_application_id and public.can_access_job(application.job_id)
  )
$$;

create or replace function public.has_active_review_assignment(target_application_id uuid, target_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.review_assignments assignment
    where assignment.application_id = target_application_id
      and assignment.assigned_to = target_user_id
      and assignment.status = 'ACTIVE'::public.review_assignment_status
  )
$$;

create or replace function public.append_safe_audit(
  audit_event_type text, audit_aggregate_type text, audit_aggregate_id uuid,
  audit_safe_metadata jsonb, audit_before_data jsonb, audit_after_data jsonb,
  audit_reason text, audit_source text, audit_version_ref text default null
) returns void language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid();
begin
  insert into public.audit_events (event_type, actor_type, actor_id, aggregate_type, aggregate_id,
    correlation_id, safe_metadata, before_data, after_data, reason, source, result, version_ref)
  values (audit_event_type, case when actor is null then 'SYSTEM' else 'USER' end, actor,
    audit_aggregate_type, audit_aggregate_id, gen_random_uuid(), coalesce(audit_safe_metadata, '{}'::jsonb),
    audit_before_data, audit_after_data, audit_reason, audit_source, 'SUCCESS', audit_version_ref);
end;
$$;

create or replace function public.create_human_review(
  target_application_id uuid, target_scorecard_version_id uuid, new_decision public.human_decision,
  new_reason_code text, new_reason_detail text, new_confidence public.review_confidence,
  new_note text default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  actor uuid := auth.uid(); actor_role public.app_role; target_job_id uuid; assigned_manager uuid;
  normalized_code text := trim(coalesce(new_reason_code, ''));
  normalized_detail text := trim(coalesce(new_reason_detail, ''));
  previous_review public.human_reviews%rowtype; created_review_id uuid;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select profile.role into actor_role from public.profiles profile where profile.id = actor;
  select application.job_id, job.hiring_manager_id into target_job_id, assigned_manager
  from public.applications application join public.jobs job on job.id = application.job_id
  where application.id = target_application_id for update of application, job;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'HIRING_MANAGER'::public.app_role and assigned_manager = actor
    and public.has_active_review_assignment(target_application_id, actor)
  ) then raise exception 'not authorized to create human review' using errcode = '42501'; end if;
  if normalized_code = '' or normalized_detail = '' or length(normalized_code) > 100 or length(normalized_detail) > 2000 then
    raise exception 'reason code and detail are required' using errcode = '22023'; end if;
  if not exists (select 1 from public.scorecard_versions scorecard where scorecard.id = target_scorecard_version_id
    and scorecard.job_id = target_job_id and scorecard.status = 'APPROVED'::public.scorecard_status) then
    raise exception 'review requires the active approved scorecard for the application job' using errcode = '22023'; end if;
  select * into previous_review from public.human_reviews where application_id = target_application_id
  order by created_at desc, id desc limit 1 for update;
  insert into public.human_reviews (application_id, scorecard_version_id, reviewer_id, decision, reason_code,
    reason_detail, confidence, note, supersedes_review_id)
  values (target_application_id, target_scorecard_version_id, actor, new_decision, normalized_code,
    normalized_detail, new_confidence, nullif(trim(coalesce(new_note, '')), ''), previous_review.id)
  returning id into created_review_id;
  perform public.append_safe_audit(
    case when previous_review.id is null then 'HUMAN_DECISION_CREATED' else 'HUMAN_DECISION_CHANGED' end,
    'application', target_application_id,
    jsonb_build_object('review_id', created_review_id, 'actor_role', actor_role::text, 'reason_code', normalized_code),
    case when previous_review.id is null then null else jsonb_build_object('review_id', previous_review.id, 'decision', previous_review.decision::text) end,
    jsonb_build_object('review_id', created_review_id, 'decision', new_decision::text, 'confidence', new_confidence::text),
    null, 'human_review', target_scorecard_version_id::text);
  return created_review_id;
end;
$$;

create or replace function public.create_review_note(target_application_id uuid, note_body text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); actor_role public.app_role; note_id uuid; normalized_body text := trim(coalesce(note_body, ''));
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role not in ('RECRUITER'::public.app_role, 'ADMIN'::public.app_role) or not public.can_access_application(target_application_id) then
    raise exception 'not authorized to create review note' using errcode = '42501'; end if;
  if normalized_body = '' or length(normalized_body) > 4000 then raise exception 'note body is required' using errcode = '22023'; end if;
  insert into public.review_notes (application_id, author_id) values (target_application_id, actor) returning id into note_id;
  insert into public.review_note_versions (note_id, version_number, body, created_by) values (note_id, 1, normalized_body, actor);
  perform public.append_safe_audit('REVIEW_NOTE_CREATED', 'application', target_application_id,
    jsonb_build_object('note_id', note_id, 'note_version', 1), null, null, null, 'review_note');
  return note_id;
end;
$$;

create or replace function public.update_review_note(target_note_id uuid, note_body text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); actor_role public.app_role; note_row public.review_notes%rowtype; normalized_body text := trim(coalesce(note_body, '')); next_version integer;
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select * into note_row from public.review_notes where id = target_note_id for update;
  if not found then raise exception 'review note not found' using errcode = 'P0002'; end if;
  if note_row.deleted_at is not null then raise exception 'deleted review note cannot be edited' using errcode = '55000'; end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'RECRUITER'::public.app_role
    and note_row.author_id = actor
    and public.can_access_application(note_row.application_id)
  ) then raise exception 'not authorized to edit review note' using errcode = '42501'; end if;
  if normalized_body = '' or length(normalized_body) > 4000 then raise exception 'note body is required' using errcode = '22023'; end if;
  select coalesce(max(version_number), 0) + 1 into next_version from public.review_note_versions where note_id = target_note_id;
  insert into public.review_note_versions (note_id, version_number, body, created_by) values (target_note_id, next_version, normalized_body, actor);
  update public.review_notes set updated_at = now() where id = target_note_id;
  perform public.append_safe_audit('REVIEW_NOTE_EDITED', 'application', note_row.application_id, jsonb_build_object('note_id', target_note_id, 'note_version', next_version), null, null, null, 'review_note');
end;
$$;

create or replace function public.set_review_note_deleted(target_note_id uuid, should_delete boolean, action_reason text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid(); actor_role public.app_role; note_row public.review_notes%rowtype; normalized_reason text := trim(coalesce(action_reason, ''));
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select role into actor_role from public.profiles where id = actor;
  select * into note_row from public.review_notes where id = target_note_id for update;
  if not found then raise exception 'review note not found' using errcode = 'P0002'; end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'RECRUITER'::public.app_role
    and note_row.author_id = actor
    and public.can_access_application(note_row.application_id)
  ) then raise exception 'not authorized to change review note lifecycle' using errcode = '42501'; end if;
  if normalized_reason = '' or length(normalized_reason) > 1000 then raise exception 'delete or restore reason is required' using errcode = '22023'; end if;
  if should_delete then
    if note_row.deleted_at is not null then raise exception 'review note is already deleted' using errcode = '55000'; end if;
    update public.review_notes set deleted_at = now(), deleted_by = actor, updated_at = now() where id = target_note_id;
  else
    if note_row.deleted_at is null then raise exception 'review note is already active' using errcode = '55000'; end if;
    update public.review_notes set deleted_at = null, deleted_by = null, updated_at = now() where id = target_note_id;
  end if;
  perform public.append_safe_audit(case when should_delete then 'REVIEW_NOTE_SOFT_DELETED' else 'REVIEW_NOTE_RESTORED' end,
    'application', note_row.application_id, jsonb_build_object('note_id', target_note_id), null, null, normalized_reason, 'review_note');
end;
$$;

create or replace function public.mark_notification_read(target_notification_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  update public.notifications set read_at = coalesce(read_at, now()) where id = target_notification_id and recipient_id = actor;
  if not found then raise exception 'notification not found or not recipient' using errcode = '42501'; end if;
end;
$$;

create or replace function public.create_scorecard_draft_notification()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare recipient uuid;
begin
  if new.status <> 'DRAFT'::public.scorecard_status then
    return new;
  end if;
  select hiring_manager_id into recipient from public.jobs where id = new.job_id;
  if recipient is not null then
    insert into public.notifications (recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata)
    values (recipient, 'SCORECARD_APPROVAL_REQUEST', 'job', new.job_id, new.id::text,
      jsonb_build_object('scorecard_version_id', new.id, 'version_number', new.version_number))
    on conflict (recipient_id, event_type, aggregate_id, relevant_version) do nothing;
    if found then perform public.append_safe_audit('NOTIFICATION_SENT', 'job', new.job_id,
      jsonb_build_object('event_type', 'SCORECARD_APPROVAL_REQUEST', 'recipient_id', recipient, 'scorecard_version_id', new.id),
      null, null, null, 'notification', new.id::text); end if;
  end if;
  return new;
end;
$$;
create trigger scorecard_versions_notify_hiring_manager
after insert on public.scorecard_versions for each row execute function public.create_scorecard_draft_notification();

alter table public.candidates enable row level security;
alter table public.applications enable row level security;
alter table public.review_assignments enable row level security;
alter table public.human_reviews enable row level security;
alter table public.review_notes enable row level security;
alter table public.review_note_versions enable row level security;
alter table public.notifications enable row level security;

create policy candidates_select_assigned on public.candidates for select to authenticated using (
  public.is_admin() or exists (select 1 from public.applications application where application.candidate_id = candidates.id and public.can_access_job(application.job_id)));
create policy applications_select_assigned on public.applications for select to authenticated using (public.can_access_job(job_id));
create policy review_assignments_select_assigned on public.review_assignments for select to authenticated using (
  public.is_admin() or assigned_to = auth.uid() or public.can_access_application(application_id));
create policy human_reviews_select_assigned on public.human_reviews for select to authenticated using (public.can_access_application(application_id));
create policy review_notes_select on public.review_notes for select to authenticated using (
  public.is_admin() or (deleted_at is null and public.current_user_role() = 'HIRING_MANAGER'::public.app_role and public.has_active_review_assignment(application_id, auth.uid()))
  or (public.current_user_role() = 'RECRUITER'::public.app_role and author_id = auth.uid() and public.can_access_application(application_id)));
create policy review_note_versions_select on public.review_note_versions for select to authenticated using (
  exists (
    select 1
    from public.review_notes note
    where note.id = review_note_versions.note_id
      and (
        public.is_admin()
        or (
          note.deleted_at is null
          and public.current_user_role() = 'HIRING_MANAGER'::public.app_role
          and public.has_active_review_assignment(note.application_id, auth.uid())
        )
        or (
          public.current_user_role() = 'RECRUITER'::public.app_role
          and note.author_id = auth.uid()
          and public.can_access_application(note.application_id)
        )
      )
  )
);
create policy notifications_select_recipient_or_admin on public.notifications for select to authenticated using (recipient_id = auth.uid() or public.is_admin());

grant select on public.candidates, public.applications, public.review_assignments, public.human_reviews, public.review_notes, public.review_note_versions, public.notifications to authenticated;
revoke insert, update, delete on public.candidates, public.applications, public.review_assignments, public.human_reviews, public.review_notes, public.review_note_versions, public.notifications from anon, authenticated;
revoke insert, update, delete on public.candidates, public.applications, public.review_assignments, public.human_reviews, public.review_notes, public.review_note_versions, public.notifications from service_role;
revoke execute on function public.append_safe_audit(text, text, uuid, jsonb, jsonb, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_human_review(uuid, uuid, public.human_decision, text, text, public.review_confidence, text), public.create_review_note(uuid, text), public.update_review_note(uuid, text), public.set_review_note_deleted(uuid, boolean, text), public.mark_notification_read(uuid) from public, anon;
grant execute on function public.create_human_review(uuid, uuid, public.human_decision, text, text, public.review_confidence, text), public.create_review_note(uuid, text), public.update_review_note(uuid, text), public.set_review_note_deleted(uuid, boolean, text), public.mark_notification_read(uuid) to authenticated;

-- Shared Alpha backfill only. Seed runs after migrations on clean local reset.
do $$
declare alpha_job uuid := '10000000-0000-0000-0000-000000000001'; alpha_candidate uuid := '40000000-0000-0000-0000-000000000001'; alpha_application uuid := '50000000-0000-0000-0000-000000000001'; alpha_manager uuid := '00000000-0000-0000-0000-000000000003'; alpha_draft uuid := '20000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from public.jobs where id = alpha_job) and exists (select 1 from public.profiles where id = alpha_manager) then
    insert into public.candidates (id, demo_label) values (alpha_candidate, 'Synthetic Alpha Candidate') on conflict (id) do nothing;
    insert into public.applications (id, candidate_id, job_id, source, workflow_state) values (alpha_application, alpha_candidate, alpha_job, 'ALPHA_BACKFILL', 'NEW') on conflict (id) do nothing;
    insert into public.review_assignments (application_id, assigned_to, assigned_by) values (alpha_application, alpha_manager, alpha_manager) on conflict do nothing;
  end if;
  insert into public.notifications (recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata)
  select job.hiring_manager_id, 'SCORECARD_APPROVAL_REQUEST', 'job', scorecard.job_id, scorecard.id::text,
    jsonb_build_object('scorecard_version_id', scorecard.id, 'version_number', scorecard.version_number)
  from public.scorecard_versions scorecard join public.jobs job on job.id = scorecard.job_id
  where scorecard.status = 'DRAFT'::public.scorecard_status
  on conflict (recipient_id, event_type, aggregate_id, relevant_version) do nothing;
end;
$$;

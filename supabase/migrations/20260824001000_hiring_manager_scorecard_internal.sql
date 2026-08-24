-- HL-025 follow-up: the public wrapper owns authorization. The historical
-- renamed internal function still checks the former Recruiter role, so use a
-- private insertion helper for the approved Hiring Manager path.

create or replace function public.create_initial_scorecard_draft_hm_internal(
  target_job_id uuid,
  source_job_description_hash text,
  prompt_version text,
  schema_version text,
  model_id text,
  ambiguous_phrases jsonb,
  draft_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  next_version integer;
  scorecard_id uuid;
  criterion jsonb;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.scorecard_versions
  where job_id = target_job_id;

  insert into public.scorecard_versions (
    job_id, version_number, status, source_job_description_hash,
    prompt_version, schema_version, model_id, ambiguous_phrases, created_by
  )
  values (
    target_job_id, next_version, 'DRAFT'::public.scorecard_status,
    source_job_description_hash, prompt_version, schema_version, model_id,
    ambiguous_phrases, actor
  )
  returning id into scorecard_id;

  for criterion in select * from jsonb_array_elements(draft_criteria)
  loop
    insert into public.criteria (
      scorecard_version_id, client_id, name, type, definition,
      accepted_evidence, alternative_evidence, resume_assessable,
      evidence_fields, source_phrase, ambiguity_note, ambiguity_status,
      suggested_interview_question, display_order
    )
    values (
      scorecard_id, criterion->>'client_id', criterion->>'name',
      (criterion->>'type')::public.criterion_type, criterion->>'definition',
      criterion->'accepted_evidence', criterion->'alternative_evidence',
      (criterion->>'resume_assessable')::boolean, criterion->'evidence_fields',
      nullif(criterion->>'source_phrase', ''), nullif(criterion->>'ambiguity_note', ''),
      (criterion->>'ambiguity_status')::public.ambiguity_status,
      nullif(criterion->>'suggested_interview_question', ''),
      (criterion->>'display_order')::integer
    );
  end loop;

  update public.jobs
  set status = 'SCORECARD_PENDING_APPROVAL'::public.job_status
  where id = target_job_id and status = 'DRAFT'::public.job_status;

  return scorecard_id;
end;
$$;

create or replace function public.create_scorecard_draft(
  target_job_id uuid,
  source_job_description_hash text,
  prompt_version text,
  schema_version text,
  model_id text,
  ambiguous_phrases jsonb,
  draft_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_hiring_manager_id uuid;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select hiring_manager_id into target_hiring_manager_id
  from public.jobs where id = target_job_id for update;

  if target_hiring_manager_id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (actor_role = 'HIRING_MANAGER'::public.app_role and target_hiring_manager_id = actor) then
    raise exception 'not authorized to create scorecard draft' using errcode = '42501';
  end if;
  if exists (select 1 from public.scorecard_versions where job_id = target_job_id) then
    raise exception 'initial scorecard draft already exists' using errcode = '55000';
  end if;

  perform public.validate_review_framework_draft_input(
    source_job_description_hash, prompt_version, schema_version, model_id,
    ambiguous_phrases, draft_criteria
  );

  return public.create_initial_scorecard_draft_hm_internal(
    target_job_id, source_job_description_hash, prompt_version, schema_version,
    model_id, ambiguous_phrases, draft_criteria
  );
end;
$$;

revoke execute on function public.create_initial_scorecard_draft_hm_internal(uuid, text, text, text, text, jsonb, jsonb)
from public, anon, authenticated;

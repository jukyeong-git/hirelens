-- Review Framework v2: persist partial-evidence guidance and pass the human-
-- approved extraction contract to the evidence worker. Existing approved
-- versions remain valid; new guidance is nullable for backward compatibility.

alter table public.criteria
  add column if not exists partial_evidence_guidance text
  check (
    partial_evidence_guidance is null
    or length(trim(partial_evidence_guidance)) between 1 and 1000
  );

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
      accepted_evidence, alternative_evidence, partial_evidence_guidance,
      resume_assessable, evidence_fields, source_phrase, ambiguity_note,
      ambiguity_status, suggested_interview_question, display_order
    )
    values (
      scorecard_id, criterion->>'client_id', criterion->>'name',
      (criterion->>'type')::public.criterion_type, criterion->>'definition',
      criterion->'accepted_evidence', criterion->'alternative_evidence',
      nullif(trim(criterion->>'partial_evidence_guidance'), ''),
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
  validation_criteria jsonb;
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

  if jsonb_typeof(draft_criteria) <> 'array' then
    raise exception 'draft_criteria must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(draft_criteria) item
    where item ? 'partial_evidence_guidance'
      and item->'partial_evidence_guidance' <> 'null'::jsonb
      and (
        jsonb_typeof(item->'partial_evidence_guidance') <> 'string'
        or length(trim(item->>'partial_evidence_guidance')) not between 1 and 1000
      )
  ) then
    raise exception 'invalid partial evidence guidance' using errcode = '22023';
  end if;

  select jsonb_agg(item - 'partial_evidence_guidance' order by ordinal)
  into validation_criteria
  from jsonb_array_elements(draft_criteria) with ordinality as entries(item, ordinal);

  perform public.validate_review_framework_draft_input(
    source_job_description_hash, prompt_version, schema_version, model_id,
    ambiguous_phrases, validation_criteria
  );

  return public.create_initial_scorecard_draft_hm_internal(
    target_job_id, source_job_description_hash, prompt_version, schema_version,
    model_id, ambiguous_phrases, draft_criteria
  );
end;
$$;

revoke execute on function public.create_initial_scorecard_draft_hm_internal(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.create_scorecard_draft(
  uuid, text, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function public.create_scorecard_revision(
  source_scorecard_version_id uuid,
  expected_version_number integer,
  expected_status public.scorecard_status,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  source_version_number integer;
  source_status public.scorecard_status;
  assigned_hiring_manager_id uuid;
  next_version_number integer;
  revision_id uuid;
  normalized_reason text := trim(coalesce(reason, ''));
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select role into actor_role from public.profiles where id = actor;
  select scorecard.job_id, scorecard.version_number, scorecard.status, job.hiring_manager_id
  into target_job_id, source_version_number, source_status, assigned_hiring_manager_id
  from public.scorecard_versions scorecard
  join public.jobs job on job.id = scorecard.job_id
  where scorecard.id = source_scorecard_version_id
  for update of scorecard, job;

  if not found then
    raise exception 'scorecard version not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (actor_role = 'HIRING_MANAGER'::public.app_role and assigned_hiring_manager_id = actor) then
    raise exception 'not authorized to create scorecard revision' using errcode = '42501';
  end if;
  if normalized_reason = '' then
    raise exception 'revision reason is required' using errcode = '22023';
  end if;
  if length(normalized_reason) > 1000 then
    raise exception 'revision reason is too long' using errcode = '22023';
  end if;
  if source_version_number is distinct from expected_version_number
     or source_status is distinct from expected_status then
    raise exception 'scorecard changed; reload before creating a revision' using errcode = '40001';
  end if;
  if source_status <> 'APPROVED'::public.scorecard_status then
    raise exception 'only the approved scorecard can be revised' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.scorecard_versions
    where job_id = target_job_id and status = 'DRAFT'::public.scorecard_status
  ) then
    raise exception 'a draft scorecard revision already exists' using errcode = '23505';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version_number
  from public.scorecard_versions where job_id = target_job_id;

  insert into public.scorecard_versions (
    job_id, version_number, status, source_job_description_hash,
    prompt_version, schema_version, model_id, ambiguous_phrases, created_by
  )
  select job_id, next_version_number, 'DRAFT'::public.scorecard_status,
    source_job_description_hash, prompt_version, schema_version, model_id,
    ambiguous_phrases, actor
  from public.scorecard_versions
  where id = source_scorecard_version_id
  returning id into revision_id;

  insert into public.criteria (
    scorecard_version_id, client_id, name, type, definition,
    accepted_evidence, alternative_evidence, partial_evidence_guidance,
    resume_assessable, evidence_fields, source_phrase, ambiguity_note,
    ambiguity_status, suggested_interview_question, display_order
  )
  select revision_id, client_id, name, type, definition,
    accepted_evidence, alternative_evidence, partial_evidence_guidance,
    resume_assessable, evidence_fields, source_phrase, ambiguity_note,
    ambiguity_status, suggested_interview_question, display_order
  from public.criteria
  where scorecard_version_id = source_scorecard_version_id;

  insert into public.audit_events (
    event_type, actor_type, actor_id, aggregate_type, aggregate_id,
    correlation_id, safe_metadata, before_data, after_data, reason,
    source, result, version_ref
  )
  values (
    'SCORECARD_REVISION_CREATED', 'USER', actor, 'job', target_job_id,
    gen_random_uuid(),
    jsonb_build_object(
      'actor_role', actor_role::text,
      'source_version_id', source_scorecard_version_id,
      'revision_version_id', revision_id,
      'source_version_number', source_version_number,
      'revision_version_number', next_version_number
    ),
    jsonb_build_object('source_version_id', source_scorecard_version_id, 'source_status', source_status::text),
    jsonb_build_object(
      'source_version_id', source_scorecard_version_id,
      'source_status', source_status::text,
      'revision_version_id', revision_id,
      'revision_status', 'DRAFT'
    ),
    normalized_reason, 'scorecard_revision', 'SUCCESS', revision_id::text
  );

  return revision_id;
end;
$$;

create or replace function public.load_evidence_analysis_context(target_processing_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  run public.processing_runs%rowtype;
  result jsonb;
begin
  perform public.require_worker_service_role();
  select * into run from public.processing_runs where id = target_processing_run_id;
  if not found or run.status <> 'ANALYZING'::public.processing_run_status then
    raise exception 'processing run is not analyzing' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.scorecard_versions version
    where version.id = run.scorecard_version_id
      and version.approved_at is not null
      and version.status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)
  ) then
    raise exception 'processing run requires a human-approved scorecard version' using errcode = '55000';
  end if;

  select jsonb_build_object(
    'processing_run_id', run.id,
    'application_id', run.application_id,
    'resume_file_id', run.resume_file_id,
    'scorecard_version_id', run.scorecard_version_id,
    'pipeline_version', run.pipeline_version,
    'criteria', (
      select jsonb_agg(
        jsonb_build_object(
          'criterion_id', criterion.id,
          'name', criterion.name,
          'type', criterion.type::text,
          'definition', criterion.definition,
          'accepted_evidence', criterion.accepted_evidence,
          'alternative_evidence', criterion.alternative_evidence,
          'partial_evidence_guidance', criterion.partial_evidence_guidance,
          'evidence_fields', criterion.evidence_fields,
          'resume_assessable', criterion.resume_assessable,
          'suggested_interview_question', criterion.suggested_interview_question
        ) order by criterion.display_order
      )
      from public.criteria criterion
      where criterion.scorecard_version_id = run.scorecard_version_id
    ),
    'pages', (
      select jsonb_agg(
        jsonb_build_object(
          'page_id', page.id,
          'page_number', page.page_number,
          'normalized_text', page.normalized_text,
          'normalized_text_sha256', page.normalized_text_sha256
        ) order by page.page_number
      )
      from public.resume_pages page
      where page.processing_run_id = run.id
    )
  ) into result;

  if result -> 'criteria' is null or result -> 'pages' is null then
    raise exception 'approved criteria and extracted pages are required' using errcode = '55000';
  end if;
  return result;
end;
$$;


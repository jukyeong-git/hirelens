-- HL-021 follow-up: validate the public draft RPC at the database boundary.
-- Rollback note: restore the prior wrapper only with a forward migration; do
-- not rewrite existing Review Framework versions or their append-only audits.

create or replace function public.validate_review_framework_draft_input(
  source_job_description_hash text,
  prompt_version text,
  schema_version text,
  model_id text,
  ambiguous_phrases jsonb,
  draft_criteria jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  criterion jsonb;
  phrase jsonb;
  evidence_field jsonb;
begin
  if source_job_description_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid job description hash' using errcode = '22023';
  end if;
  if length(trim(coalesce(prompt_version, ''))) = 0 or length(prompt_version) > 200
     or length(trim(coalesce(schema_version, ''))) = 0 or length(schema_version) > 200
     or length(trim(coalesce(model_id, ''))) = 0 or length(model_id) > 200 then
    raise exception 'invalid Review Framework provenance metadata' using errcode = '22023';
  end if;
  if jsonb_typeof(ambiguous_phrases) <> 'array' or jsonb_array_length(ambiguous_phrases) > 30 then
    raise exception 'ambiguous_phrases must be an array of at most 30 items' using errcode = '22023';
  end if;
  if jsonb_typeof(draft_criteria) <> 'array'
     or jsonb_array_length(draft_criteria) = 0
     or jsonb_array_length(draft_criteria) > 30 then
    raise exception 'draft_criteria must be a non-empty array of at most 30 items' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(draft_criteria) item
    group by item->>'client_id'
    having count(*) > 1
  ) then
    raise exception 'criterion client_id values must be unique' using errcode = '22023';
  end if;

  for phrase in select * from jsonb_array_elements(ambiguous_phrases)
  loop
    if jsonb_typeof(phrase) <> 'object'
       or phrase - array['source_phrase', 'ambiguity_note', 'ambiguity_status', 'suggested_interview_question'] <> '{}'::jsonb
       or not (phrase ?& array['source_phrase', 'ambiguity_note', 'ambiguity_status', 'suggested_interview_question'])
       or (phrase->'source_phrase') <> 'null'::jsonb and jsonb_typeof(phrase->'source_phrase') <> 'string'
       or (phrase->'ambiguity_note') <> 'null'::jsonb and jsonb_typeof(phrase->'ambiguity_note') <> 'string'
       or jsonb_typeof(phrase->'ambiguity_status') <> 'string'
       or (phrase->'suggested_interview_question') <> 'null'::jsonb and jsonb_typeof(phrase->'suggested_interview_question') <> 'string'
       or length(coalesce(phrase->>'source_phrase', '')) > 500
       or length(coalesce(phrase->>'ambiguity_note', '')) > 1000
       or length(coalesce(phrase->>'suggested_interview_question', '')) > 1000
       or phrase->>'ambiguity_status' not in ('CLEAR', 'AMBIGUOUS', 'HUMAN_ONLY') then
      raise exception 'invalid ambiguous phrase entry' using errcode = '22023';
    end if;
  end loop;

  for criterion in select * from jsonb_array_elements(draft_criteria)
  loop
    if jsonb_typeof(criterion) <> 'object'
       or criterion - array[
         'client_id', 'name', 'type', 'definition', 'accepted_evidence',
         'alternative_evidence', 'evidence_fields', 'resume_assessable',
         'source_phrase', 'ambiguity_note', 'ambiguity_status',
         'suggested_interview_question', 'display_order'
       ] <> '{}'::jsonb
       or not (criterion ?& array[
         'client_id', 'name', 'type', 'definition', 'accepted_evidence',
         'alternative_evidence', 'evidence_fields', 'resume_assessable',
         'source_phrase', 'ambiguity_note', 'ambiguity_status',
         'suggested_interview_question', 'display_order'
       ])
       or jsonb_typeof(criterion->'client_id') <> 'string'
       or jsonb_typeof(criterion->'name') <> 'string'
       or jsonb_typeof(criterion->'type') <> 'string'
       or jsonb_typeof(criterion->'definition') <> 'string'
       or jsonb_typeof(criterion->'accepted_evidence') <> 'array'
       or jsonb_typeof(criterion->'alternative_evidence') <> 'array'
       or jsonb_typeof(criterion->'evidence_fields') <> 'array'
       or jsonb_typeof(criterion->'resume_assessable') <> 'boolean'
       or (criterion->'source_phrase') <> 'null'::jsonb and jsonb_typeof(criterion->'source_phrase') <> 'string'
       or (criterion->'ambiguity_note') <> 'null'::jsonb and jsonb_typeof(criterion->'ambiguity_note') <> 'string'
       or jsonb_typeof(criterion->'ambiguity_status') <> 'string'
       or (criterion->'suggested_interview_question') <> 'null'::jsonb and jsonb_typeof(criterion->'suggested_interview_question') <> 'string'
       or jsonb_typeof(criterion->'display_order') <> 'number'
       or length(trim(criterion->>'client_id')) not between 1 and 120
       or length(trim(criterion->>'name')) not between 1 and 200
       or length(trim(criterion->>'definition')) not between 1 and 2000
       or length(coalesce(criterion->>'source_phrase', '')) > 500
       or length(coalesce(criterion->>'ambiguity_note', '')) > 2000
       or length(coalesce(criterion->>'suggested_interview_question', '')) > 1000
       or criterion->>'type' not in ('REQUIRED', 'PREFERRED', 'INTERVIEW_ONLY')
       or criterion->>'ambiguity_status' not in ('CLEAR', 'AMBIGUOUS', 'HUMAN_ONLY')
       or criterion->>'display_order' !~ '^\d+$'
       or (criterion->>'display_order')::integer > 1000
       or jsonb_array_length(criterion->'accepted_evidence') > 20
       or jsonb_array_length(criterion->'alternative_evidence') > 20
       or jsonb_array_length(criterion->'evidence_fields') > 20
       or (criterion->>'type' = 'INTERVIEW_ONLY' and (criterion->>'resume_assessable')::boolean)
       or (criterion->>'ambiguity_status' = 'HUMAN_ONLY' and (criterion->>'resume_assessable')::boolean)
       or ((criterion->>'resume_assessable')::boolean and jsonb_array_length(criterion->'accepted_evidence') = 0) then
      raise exception 'invalid Review Framework criterion' using errcode = '22023';
    end if;

    if exists (
      select 1 from jsonb_array_elements(criterion->'accepted_evidence') item
      where jsonb_typeof(item) <> 'string' or length(trim(item #>> '{}')) not between 1 and 500
    ) or exists (
      select 1 from jsonb_array_elements(criterion->'alternative_evidence') item
      where jsonb_typeof(item) <> 'string' or length(trim(item #>> '{}')) not between 1 and 500
    ) then
      raise exception 'invalid criterion evidence list' using errcode = '22023';
    end if;

    for evidence_field in select * from jsonb_array_elements(criterion->'evidence_fields')
    loop
      if jsonb_typeof(evidence_field) <> 'object'
         or evidence_field - array['field_name', 'description'] <> '{}'::jsonb
         or not (evidence_field ?& array['field_name', 'description'])
         or jsonb_typeof(evidence_field->'field_name') <> 'string'
         or jsonb_typeof(evidence_field->'description') <> 'string'
         or length(trim(evidence_field->>'field_name')) not between 1 and 80
         or length(trim(evidence_field->>'description')) not between 1 and 500 then
        raise exception 'invalid criterion evidence field' using errcode = '22023';
      end if;
    end loop;
  end loop;
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
  from public.jobs
  where id = target_job_id
  for update;

  if target_hiring_manager_id is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and target_hiring_manager_id = actor
     ) then
    raise exception 'not authorized to create scorecard draft' using errcode = '42501';
  end if;
  if exists (select 1 from public.scorecard_versions where job_id = target_job_id) then
    raise exception 'initial scorecard draft already exists' using errcode = '55000';
  end if;

  perform public.validate_review_framework_draft_input(
    source_job_description_hash, prompt_version, schema_version, model_id,
    ambiguous_phrases, draft_criteria
  );

  return public.create_initial_scorecard_draft_internal(
    target_job_id, source_job_description_hash, prompt_version, schema_version,
    model_id, ambiguous_phrases, draft_criteria
  );
end;
$$;

revoke execute on function public.validate_review_framework_draft_input(text, text, text, text, jsonb, jsonb)
from public, anon, authenticated;


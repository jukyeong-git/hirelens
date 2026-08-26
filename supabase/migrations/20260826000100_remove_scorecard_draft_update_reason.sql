-- Stop collecting a user-entered reason when an authorized human revises a draft.
-- The append-only audit event remains, but its reason is intentionally null.
-- Rollback: restore reason validation and persistence in a forward migration.

create or replace function public.update_scorecard_draft(
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
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  target_job_id uuid;
  target_hiring_manager_id uuid;
  target_version_number integer;
  target_status public.scorecard_status;
  target_content_revision integer;
  resulting_content_revision integer;
  previous_criterion_count integer;
  criterion jsonb;
  validation_criteria jsonb;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.role into actor_role
  from public.profiles profile
  where profile.id = actor;

  select version.job_id, job.hiring_manager_id, version.version_number,
         version.status, version.content_revision
  into target_job_id, target_hiring_manager_id, target_version_number,
       target_status, target_content_revision
  from public.scorecard_versions version
  join public.jobs job on job.id = version.job_id
  where version.id = target_scorecard_version_id
  for update of version, job;

  if not found then
    raise exception 'scorecard version not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'ADMIN'::public.app_role
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and target_hiring_manager_id = actor
     ) then
    raise exception 'not authorized to update scorecard draft' using errcode = '42501';
  end if;
  if target_version_number is distinct from expected_version_number
     or target_status is distinct from expected_status
     or target_content_revision is distinct from expected_content_revision then
    raise exception 'scorecard changed; reload before updating' using errcode = '40001';
  end if;
  if target_status <> 'DRAFT'::public.scorecard_status then
    raise exception 'only draft scorecards can be updated' using errcode = '55000';
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
    (select source_job_description_hash from public.scorecard_versions where id = target_scorecard_version_id),
    (select prompt_version from public.scorecard_versions where id = target_scorecard_version_id),
    (select schema_version from public.scorecard_versions where id = target_scorecard_version_id),
    (select model_id from public.scorecard_versions where id = target_scorecard_version_id),
    ambiguous_phrases,
    validation_criteria
  );

  select count(*) into previous_criterion_count
  from public.criteria
  where scorecard_version_id = target_scorecard_version_id;

  update public.scorecard_versions
  set ambiguous_phrases = $6,
      content_revision = content_revision + 1
  where id = target_scorecard_version_id;

  delete from public.criteria
  where scorecard_version_id = target_scorecard_version_id;

  for criterion in select * from jsonb_array_elements(draft_criteria)
  loop
    insert into public.criteria (
      scorecard_version_id, client_id, name, type, definition,
      accepted_evidence, alternative_evidence, partial_evidence_guidance,
      resume_assessable, evidence_fields, source_phrase, ambiguity_note,
      ambiguity_status, suggested_interview_question, display_order
    ) values (
      target_scorecard_version_id, criterion->>'client_id', criterion->>'name',
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

  select content_revision into resulting_content_revision
  from public.scorecard_versions
  where id = target_scorecard_version_id;

  insert into public.audit_events (
    event_type, actor_type, actor_id, aggregate_type, aggregate_id,
    correlation_id, safe_metadata, before_data, after_data, reason,
    source, result, version_ref
  ) values (
    'SCORECARD_DRAFT_UPDATED', 'USER', actor, 'job', target_job_id,
    gen_random_uuid(),
    jsonb_build_object('actor_role', actor_role::text, 'version_id', target_scorecard_version_id),
    jsonb_build_object('version_number', target_version_number, 'content_revision', target_content_revision,
      'criterion_count', previous_criterion_count),
    jsonb_build_object('version_number', target_version_number, 'content_revision', resulting_content_revision,
      'criterion_count', jsonb_array_length(draft_criteria)),
    null, 'scorecard_draft_update', 'SUCCESS', target_scorecard_version_id::text
  );
end;
$$;

revoke execute on function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) from public, anon;
grant execute on function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) to authenticated;


-- FW-0: restore explicit human-created Review Framework revisions and add
-- criterion lineage. Approved and superseded rows remain immutable.
-- Forward-only rollback: lineage is durable business history. Disable the
-- revision RPC through a later migration rather than dropping lineage data.

alter table public.criteria
  add column lineage_id uuid,
  add column lineage_origin text,
  add column parent_lineage_ids uuid[] not null default '{}';

-- The immutability trigger protects business content. This controlled
-- metadata-only backfill must also cover already approved criteria.
alter table public.criteria disable trigger criteria_protect_immutable;
update public.criteria
set lineage_id = gen_random_uuid(),
    lineage_origin = 'ORIGINAL';
alter table public.criteria enable trigger criteria_protect_immutable;

alter table public.criteria
  alter column lineage_id set default gen_random_uuid(),
  alter column lineage_id set not null,
  alter column lineage_origin set default 'ORIGINAL',
  alter column lineage_origin set not null,
  add constraint criteria_lineage_origin_check check (
    lineage_origin in ('ORIGINAL', 'REVISED_FROM', 'SPLIT_FROM', 'MERGED_FROM')
  );

create index criteria_lineage_idx on public.criteria (lineage_id);

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
     and not (
       actor_role = 'HIRING_MANAGER'::public.app_role
       and assigned_hiring_manager_id = actor
     ) then
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
    ambiguity_status, suggested_interview_question, lineage_id,
    lineage_origin, parent_lineage_ids, display_order
  )
  select revision_id, client_id, name, type, definition,
    accepted_evidence, alternative_evidence, partial_evidence_guidance,
    resume_assessable, evidence_fields, source_phrase, ambiguity_note,
    ambiguity_status, suggested_interview_question, lineage_id,
    'REVISED_FROM', parent_lineage_ids, display_order
  from public.criteria
  where scorecard_version_id = source_scorecard_version_id;

  perform public.append_safe_audit(
    'SCORECARD_REVISION_CREATED',
    'job',
    target_job_id,
    jsonb_build_object(
      'actor_role', actor_role::text,
      'source_version_id', source_scorecard_version_id,
      'revision_version_id', revision_id,
      'source_version_number', source_version_number,
      'revision_version_number', next_version_number
    ),
    jsonb_build_object(
      'source_version_id', source_scorecard_version_id,
      'source_status', source_status::text
    ),
    jsonb_build_object(
      'source_version_id', source_scorecard_version_id,
      'source_status', source_status::text,
      'revision_version_id', revision_id,
      'revision_status', 'DRAFT'
    ),
    normalized_reason,
    'scorecard_revision',
    revision_id::text
  );

  return revision_id;
end;
$$;

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
  previous_lineages jsonb := '{}'::jsonb;
  criterion jsonb;
  validation_criteria jsonb;
  prior_lineage jsonb;
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

  select count(*), coalesce(
    jsonb_object_agg(
      client_id,
      jsonb_build_object(
        'lineage_id', lineage_id,
        'lineage_origin', lineage_origin,
        'parent_lineage_ids', to_jsonb(parent_lineage_ids)
      )
    ),
    '{}'::jsonb
  )
  into previous_criterion_count, previous_lineages
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
    prior_lineage := previous_lineages->(criterion->>'client_id');
    insert into public.criteria (
      scorecard_version_id, client_id, name, type, definition,
      accepted_evidence, alternative_evidence, partial_evidence_guidance,
      resume_assessable, evidence_fields, source_phrase, ambiguity_note,
      ambiguity_status, suggested_interview_question, lineage_id,
      lineage_origin, parent_lineage_ids, display_order
    ) values (
      target_scorecard_version_id, criterion->>'client_id', criterion->>'name',
      (criterion->>'type')::public.criterion_type, criterion->>'definition',
      criterion->'accepted_evidence', criterion->'alternative_evidence',
      nullif(trim(criterion->>'partial_evidence_guidance'), ''),
      (criterion->>'resume_assessable')::boolean, criterion->'evidence_fields',
      nullif(criterion->>'source_phrase', ''), nullif(criterion->>'ambiguity_note', ''),
      (criterion->>'ambiguity_status')::public.ambiguity_status,
      nullif(criterion->>'suggested_interview_question', ''),
      coalesce((prior_lineage->>'lineage_id')::uuid, gen_random_uuid()),
      coalesce(prior_lineage->>'lineage_origin', 'ORIGINAL'),
      coalesce(
        array(select jsonb_array_elements_text(prior_lineage->'parent_lineage_ids'))::uuid[],
        '{}'
      ),
      (criterion->>'display_order')::integer
    );
  end loop;

  select content_revision into resulting_content_revision
  from public.scorecard_versions
  where id = target_scorecard_version_id;

  perform public.append_safe_audit(
    'SCORECARD_DRAFT_UPDATED',
    'job',
    target_job_id,
    jsonb_build_object(
      'actor_role', actor_role::text,
      'version_id', target_scorecard_version_id
    ),
    jsonb_build_object(
      'version_number', target_version_number,
      'content_revision', target_content_revision,
      'criterion_count', previous_criterion_count
    ),
    jsonb_build_object(
      'version_number', target_version_number,
      'content_revision', resulting_content_revision,
      'criterion_count', jsonb_array_length(draft_criteria)
    ),
    null,
    'scorecard_draft_update',
    target_scorecard_version_id::text
  );
end;
$$;

revoke execute on function public.create_scorecard_revision(
  uuid, integer, public.scorecard_status, text
) from public, anon, service_role;
grant execute on function public.create_scorecard_revision(
  uuid, integer, public.scorecard_status, text
) to authenticated;


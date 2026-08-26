-- FW-3/FW-4: human-controlled framework revision proposals and versioned
-- reanalysis. AI output remains transient until an authorized human creates a
-- draft. Reanalysis creates new evidence runs and never changes human reviews.

alter table public.criteria
  add column excluded_evidence jsonb not null default '[]'::jsonb
  check (jsonb_typeof(excluded_evidence) = 'array');

alter table public.resume_pages
  drop constraint resume_pages_resume_file_id_page_number_key;

-- Preserve the existing validation and audit paths while extending their
-- strict JSON contracts with excluded_evidence.
alter function public.create_scorecard_draft(
  uuid, text, text, text, text, jsonb, jsonb
) rename to create_scorecard_draft_without_exclusions;

create function public.create_scorecard_draft(
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
  scorecard_id uuid;
  criterion jsonb;
  validation_criteria jsonb;
begin
  if jsonb_typeof(draft_criteria) <> 'array' or exists (
    select 1
    from jsonb_array_elements(draft_criteria) item
    where item ? 'excluded_evidence' and (
      jsonb_typeof(item->'excluded_evidence') <> 'array'
      or jsonb_array_length(item->'excluded_evidence') > 20
      or exists (
        select 1 from jsonb_array_elements(item->'excluded_evidence') value
        where jsonb_typeof(value) <> 'string'
          or length(trim(value #>> '{}')) not between 1 and 500
      )
    )
  ) then
    raise exception 'invalid excluded evidence' using errcode = '22023';
  end if;

  select jsonb_agg(item - 'excluded_evidence' order by ordinal)
  into validation_criteria
  from jsonb_array_elements(draft_criteria) with ordinality as entries(item, ordinal);

  scorecard_id := public.create_scorecard_draft_without_exclusions(
    target_job_id, source_job_description_hash, prompt_version, schema_version,
    model_id, ambiguous_phrases, validation_criteria
  );

  for criterion in select * from jsonb_array_elements(draft_criteria)
  loop
    update public.criteria
    set excluded_evidence = coalesce(criterion->'excluded_evidence', '[]'::jsonb)
    where scorecard_version_id = scorecard_id
      and client_id = criterion->>'client_id';
  end loop;
  return scorecard_id;
end;
$$;

revoke all on function public.create_scorecard_draft_without_exclusions(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke execute on function public.create_scorecard_draft(
  uuid, text, text, text, text, jsonb, jsonb
) from public, anon, service_role;
grant execute on function public.create_scorecard_draft(
  uuid, text, text, text, text, jsonb, jsonb
) to authenticated;

alter function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) rename to update_scorecard_draft_without_exclusions;

create function public.update_scorecard_draft(
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
  criterion jsonb;
  validation_criteria jsonb;
begin
  if jsonb_typeof(draft_criteria) <> 'array' or exists (
    select 1
    from jsonb_array_elements(draft_criteria) item
    where item ? 'excluded_evidence' and (
      jsonb_typeof(item->'excluded_evidence') <> 'array'
      or jsonb_array_length(item->'excluded_evidence') > 20
      or exists (
        select 1 from jsonb_array_elements(item->'excluded_evidence') value
        where jsonb_typeof(value) <> 'string'
          or length(trim(value #>> '{}')) not between 1 and 500
      )
    )
  ) then
    raise exception 'invalid excluded evidence' using errcode = '22023';
  end if;

  select jsonb_agg(item - 'excluded_evidence' order by ordinal)
  into validation_criteria
  from jsonb_array_elements(draft_criteria) with ordinality as entries(item, ordinal);

  perform public.update_scorecard_draft_without_exclusions(
    target_scorecard_version_id, expected_version_number, expected_status,
    expected_content_revision, reason, ambiguous_phrases, validation_criteria
  );

  for criterion in select * from jsonb_array_elements(draft_criteria)
  loop
    update public.criteria
    set excluded_evidence = coalesce(criterion->'excluded_evidence', '[]'::jsonb)
    where scorecard_version_id = target_scorecard_version_id
      and client_id = criterion->>'client_id';
  end loop;
end;
$$;

revoke all on function public.update_scorecard_draft_without_exclusions(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke execute on function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) from public, anon, service_role;
grant execute on function public.update_scorecard_draft(
  uuid, integer, public.scorecard_status, integer, text, jsonb, jsonb
) to authenticated;

alter function public.create_scorecard_revision(
  uuid, integer, public.scorecard_status, text
) rename to create_scorecard_revision_without_exclusions;

create function public.create_scorecard_revision(
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
  revision_id uuid;
begin
  revision_id := public.create_scorecard_revision_without_exclusions(
    source_scorecard_version_id, expected_version_number, expected_status, reason
  );
  update public.criteria revision
  set excluded_evidence = source.excluded_evidence
  from public.criteria source
  where revision.scorecard_version_id = revision_id
    and source.scorecard_version_id = source_scorecard_version_id
    and revision.client_id = source.client_id;
  return revision_id;
end;
$$;

revoke all on function public.create_scorecard_revision_without_exclusions(
  uuid, integer, public.scorecard_status, text
) from public, anon, authenticated, service_role;
revoke execute on function public.create_scorecard_revision(
  uuid, integer, public.scorecard_status, text
) from public, anon, service_role;
grant execute on function public.create_scorecard_revision(
  uuid, integer, public.scorecard_status, text
) to authenticated;

alter function public.load_evidence_analysis_context(uuid)
  rename to load_evidence_analysis_context_without_exclusions;

create function public.load_evidence_analysis_context(target_processing_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  extended_criteria jsonb;
begin
  result := public.load_evidence_analysis_context_without_exclusions(target_processing_run_id);
  select jsonb_agg(
    item || jsonb_build_object('excluded_evidence', criterion.excluded_evidence)
    order by ordinal
  )
  into extended_criteria
  from jsonb_array_elements(result->'criteria') with ordinality as entries(item, ordinal)
  join public.criteria criterion on criterion.id = (item->>'criterion_id')::uuid;
  return jsonb_set(result, '{criteria}', coalesce(extended_criteria, '[]'::jsonb));
end;
$$;

revoke all on function public.load_evidence_analysis_context_without_exclusions(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.load_evidence_analysis_context(uuid)
  from public, anon, authenticated;
grant execute on function public.load_evidence_analysis_context(uuid)
  to service_role;

create function public.criterion_revision_context(
  target_job_id uuid,
  target_lineage_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  summary_record record;
  criterion_record public.criteria%rowtype;
  context_result jsonb;
begin
  select * into summary_record
  from public.criterion_calibration_summary(target_job_id)
  where lineage_id = target_lineage_id;
  if not found or summary_record.status <> 'REVIEW_REQUIRED' then
    raise exception 'criterion finding is not review-required' using errcode = '55000';
  end if;

  select criterion.* into criterion_record
  from public.criteria criterion
  join public.scorecard_versions version on version.id = criterion.scorecard_version_id
  where version.job_id = target_job_id
    and version.status = 'APPROVED'::public.scorecard_status
    and criterion.lineage_id = target_lineage_id;
  if not found then
    raise exception 'active criterion not found' using errcode = 'P0002';
  end if;

  with ranked_sessions as (
    select session.*, row_number() over (
      partition by session.application_id order by session.created_at desc, session.id desc
    ) as session_rank
    from public.interview_observation_sessions session
    join public.applications application on application.id = session.application_id
    where application.job_id = target_job_id
  ),
  current_sessions as (
    select * from ranked_sessions where session_rank = 1
  ),
  ranked_runs as (
    select run.*, row_number() over (
      partition by run.application_id, run.scorecard_version_id
      order by run.completed_at desc nulls last, run.created_at desc, run.id desc
    ) as run_rank
    from public.processing_runs run
    join public.applications application on application.id = run.application_id
    where application.job_id = target_job_id
      and run.status = 'COMPLETED'::public.processing_run_status
  ),
  current_runs as (
    select * from ranked_runs where run_rank = 1
  ),
  quotes as (
    select distinct
      observation.verdict,
      observation.weakness_type,
      item.exact_quote
    from current_sessions session
    join public.interview_observations observation
      on observation.interview_observation_session_id = session.id
    join current_runs run
      on run.application_id = session.application_id
      and run.scorecard_version_id = session.scorecard_version_id
    join public.evidence_items item
      on item.processing_run_id = run.id
      and item.criterion_id = observation.criterion_id
      and item.status = 'SUPPORTED'::public.evidence_status
      and item.exact_quote is not null
    where observation.confirmed_at is not null
      and observation.criterion_lineage_id = target_lineage_id
  )
  select jsonb_build_object(
    'finding_lineage_id', target_lineage_id,
    'finding', jsonb_build_object(
      'supported_observations', summary_record.supported_observations,
      'level_insufficient_count', summary_record.level_insufficient_count,
      'mismatch_ratio', summary_record.mismatch_ratio,
      'confirmed_observation_count', summary_record.confirmed_observation_count,
      'false_claim_excluded_count', summary_record.false_claim_excluded_count,
      'ai_misread_excluded_count', summary_record.ai_misread_excluded_count
    ),
    'current_criterion', jsonb_build_object(
      'name', criterion_record.name,
      'type', criterion_record.type::text,
      'definition', criterion_record.definition,
      'accepted_evidence', criterion_record.accepted_evidence,
      'alternative_evidence', criterion_record.alternative_evidence,
      'excluded_evidence', criterion_record.excluded_evidence,
      'partial_evidence_guidance', criterion_record.partial_evidence_guidance,
      'evidence_fields', criterion_record.evidence_fields,
      'resume_assessable', criterion_record.resume_assessable,
      'suggested_interview_question', criterion_record.suggested_interview_question
    ),
    'mismatch_quotes', coalesce((
      select jsonb_agg(exact_quote order by exact_quote)
      from (select exact_quote from quotes
        where verdict = 'WEAKER'::public.interview_criterion_verdict
          and weakness_type = 'LEVEL_INSUFFICIENT'::public.interview_weakness_type
        limit 20) selected
    ), '[]'::jsonb),
    'matched_quotes', coalesce((
      select jsonb_agg(exact_quote order by exact_quote)
      from (select exact_quote from quotes
        where verdict = 'MATCHED'::public.interview_criterion_verdict
        limit 20) selected
    ), '[]'::jsonb)
  ) into context_result;
  return context_result;
end;
$$;

revoke all on function public.criterion_revision_context(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.criterion_revision_context(uuid, uuid)
  to authenticated;

create function public.create_framework_revision_draft(
  source_scorecard_version_id uuid,
  expected_version_number integer,
  finding_lineage_id uuid,
  revision_reason text,
  revision_prompt_version text,
  revision_schema_version text,
  revision_model_id text,
  draft_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_job_id uuid;
  revision_id uuid;
  revision_version_number integer;
  revision_content_revision integer;
  revision_ambiguities jsonb;
begin
  select job_id into target_job_id
  from public.scorecard_versions
  where id = source_scorecard_version_id
    and status = 'APPROVED'::public.scorecard_status;
  if not found then
    raise exception 'active approved scorecard not found' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.criterion_calibration_summary(target_job_id)
    where lineage_id = finding_lineage_id and status = 'REVIEW_REQUIRED'
  ) then
    raise exception 'revision proposal requires an active finding' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.criteria
    where scorecard_version_id = source_scorecard_version_id
      and lineage_id = finding_lineage_id
  ) then
    raise exception 'finding does not belong to the active scorecard' using errcode = '22023';
  end if;
  if trim(coalesce(revision_prompt_version, '')) = ''
    or trim(coalesce(revision_schema_version, '')) = ''
    or trim(coalesce(revision_model_id, '')) = '' then
    raise exception 'revision provenance is required' using errcode = '22023';
  end if;

  revision_id := public.create_scorecard_revision(
    source_scorecard_version_id, expected_version_number,
    'APPROVED'::public.scorecard_status, revision_reason
  );
  update public.scorecard_versions
  set prompt_version = revision_prompt_version,
      schema_version = revision_schema_version,
      model_id = revision_model_id
  where id = revision_id;
  select version_number, content_revision, ambiguous_phrases
  into revision_version_number, revision_content_revision, revision_ambiguities
  from public.scorecard_versions where id = revision_id;
  perform public.update_scorecard_draft(
    revision_id, revision_version_number, 'DRAFT'::public.scorecard_status,
    revision_content_revision, revision_reason, revision_ambiguities, draft_criteria
  );
  perform public.append_safe_audit(
    'FRAMEWORK_REVISION_PROPOSAL_SAVED',
    'job',
    target_job_id,
    jsonb_build_object(
      'source_version_id', source_scorecard_version_id,
      'revision_version_id', revision_id,
      'finding_lineage_id', finding_lineage_id,
      'prompt_version', revision_prompt_version,
      'schema_version', revision_schema_version,
      'model_id', revision_model_id
    ),
    null,
    null,
    revision_reason,
    'framework_revision',
    revision_id::text
  );
  return revision_id;
end;
$$;

revoke all on function public.create_framework_revision_draft(
  uuid, integer, uuid, text, text, text, text, jsonb
) from public, anon, service_role;
grant execute on function public.create_framework_revision_draft(
  uuid, integer, uuid, text, text, text, text, jsonb
) to authenticated;

create function public.record_criterion_calibration_no_action(
  target_job_id uuid,
  target_lineage_id uuid,
  reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  finding record;
begin
  select * into finding
  from public.criterion_calibration_summary(target_job_id)
  where lineage_id = target_lineage_id and status = 'REVIEW_REQUIRED';
  if not found then
    raise exception 'active finding not found' using errcode = '55000';
  end if;
  if length(trim(coalesce(reason, ''))) not between 3 and 1000 then
    raise exception 'reason is required' using errcode = '22023';
  end if;
  perform public.append_safe_audit(
    'CRITERION_CALIBRATION_NO_ACTION',
    'job',
    target_job_id,
    jsonb_build_object(
      'finding_lineage_id', target_lineage_id,
      'supported_observations', finding.supported_observations,
      'level_insufficient_count', finding.level_insufficient_count,
      'mismatch_ratio', finding.mismatch_ratio
    ),
    null,
    null,
    trim(reason),
    'criterion_calibration',
    target_lineage_id::text
  );
end;
$$;

revoke all on function public.record_criterion_calibration_no_action(uuid, uuid, text)
  from public, anon, service_role;
grant execute on function public.record_criterion_calibration_no_action(uuid, uuid, text)
  to authenticated;

create function public.enqueue_framework_reanalysis(
  target_job_id uuid,
  target_pipeline_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pgmq
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  assigned_hiring_manager_id uuid;
  active_version_id uuid;
  active_version_number integer;
  resume record;
  new_run_id uuid;
  source_run_id uuid;
  queued_count integer := 0;
  existing_count integer := 0;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = actor;
  select hiring_manager_id into assigned_hiring_manager_id
  from public.jobs where id = target_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'HIRING_MANAGER'::public.app_role
    and assigned_hiring_manager_id = actor
  ) then
    raise exception 'assigned Hiring Manager or Admin required' using errcode = '42501';
  end if;
  if length(trim(coalesce(target_pipeline_version, ''))) not between 1 and 120 then
    raise exception 'pipeline version is required' using errcode = '22023';
  end if;
  select id, version_number into active_version_id, active_version_number
  from public.scorecard_versions
  where job_id = target_job_id and status = 'APPROVED'::public.scorecard_status;
  if not found or active_version_number < 2 or not exists (
    select 1 from public.scorecard_versions
    where job_id = target_job_id and status = 'SUPERSEDED'::public.scorecard_status
      and version_number < active_version_number
  ) then
    raise exception 'approved revision and prior version are required' using errcode = '55000';
  end if;

  for resume in
    select file.id as resume_file_id, file.application_id
    from public.resume_files file
    join public.applications application on application.id = file.application_id
    where application.job_id = target_job_id
      and file.intake_status = 'UPLOADED'::public.resume_intake_status
    order by file.created_at, file.id
  loop
    new_run_id := null;
    insert into public.processing_runs (
      application_id, resume_file_id, scorecard_version_id, pipeline_version
    ) values (
      resume.application_id, resume.resume_file_id, active_version_id,
      trim(target_pipeline_version)
    )
    on conflict on constraint processing_runs_application_id_resume_file_id_scorecard_ver_key
    do nothing
    returning id into new_run_id;
    if new_run_id is null then
      existing_count := existing_count + 1;
      continue;
    end if;

    select run.id into source_run_id
    from public.processing_runs run
    where run.resume_file_id = resume.resume_file_id
      and run.id <> new_run_id
      and run.status = 'COMPLETED'::public.processing_run_status
      and exists (
        select 1 from public.resume_pages page where page.processing_run_id = run.id
      )
    order by run.completed_at desc nulls last, run.created_at desc, run.id desc
    limit 1;
    if source_run_id is not null then
      insert into public.resume_pages (
        resume_file_id, processing_run_id, page_number, raw_text, normalized_text,
        raw_text_sha256, normalized_text_sha256
      )
      select resume.resume_file_id, new_run_id, page_number, raw_text, normalized_text,
        raw_text_sha256, normalized_text_sha256
      from public.resume_pages
      where processing_run_id = source_run_id
      order by page_number;
    end if;
    perform public.enqueue_resume_processing_run(new_run_id);
    queued_count := queued_count + 1;
  end loop;

  perform public.append_safe_audit(
    'FRAMEWORK_REANALYSIS_ENQUEUED',
    'job',
    target_job_id,
    jsonb_build_object(
      'scorecard_version_id', active_version_id,
      'scorecard_version_number', active_version_number,
      'pipeline_version', trim(target_pipeline_version),
      'queued_count', queued_count,
      'existing_count', existing_count
    ),
    null,
    null,
    null,
    'framework_reanalysis',
    active_version_id::text
  );
  return jsonb_build_object(
    'scorecard_version_id', active_version_id,
    'scorecard_version_number', active_version_number,
    'queued_count', queued_count,
    'existing_count', existing_count
  );
end;
$$;

revoke all on function public.enqueue_framework_reanalysis(uuid, text)
  from public, anon, service_role;
grant execute on function public.enqueue_framework_reanalysis(uuid, text)
  to authenticated;

create function public.framework_revision_comparison(target_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  actor uuid := auth.uid();
  actor_role public.app_role;
  assigned_hiring_manager_id uuid;
  active_version_id uuid;
  previous_version_id uuid;
  result jsonb;
begin
  if actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = actor;
  select hiring_manager_id into assigned_hiring_manager_id
  from public.jobs where id = target_job_id;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if actor_role <> 'ADMIN'::public.app_role and not (
    actor_role = 'HIRING_MANAGER'::public.app_role
    and assigned_hiring_manager_id = actor
  ) then
    raise exception 'assigned Hiring Manager or Admin required' using errcode = '42501';
  end if;
  select id into active_version_id
  from public.scorecard_versions
  where job_id = target_job_id and status = 'APPROVED'::public.scorecard_status;
  if active_version_id is null then
    return null;
  end if;
  select id into previous_version_id
  from public.scorecard_versions
  where job_id = target_job_id
    and status = 'SUPERSEDED'::public.scorecard_status
    and version_number < (
      select version_number from public.scorecard_versions where id = active_version_id
    )
  order by version_number desc
  limit 1;
  if previous_version_id is null then
    return null;
  end if;

  with compared_versions as (
    select * from public.scorecard_versions
    where id in (previous_version_id, active_version_id)
  ),
  ranked_runs as (
    select run.*, row_number() over (
      partition by run.application_id, run.scorecard_version_id
      order by run.created_at desc, run.id desc
    ) as run_rank
    from public.processing_runs run
    where run.scorecard_version_id in (previous_version_id, active_version_id)
  ),
  latest_runs as (
    select * from ranked_runs where run_rank = 1
  ),
  evidence_facts as (
    select distinct run.scorecard_version_id, run.application_id,
      criterion.lineage_id, item.status
    from latest_runs run
    join public.evidence_items item on item.processing_run_id = run.id
    join public.criteria criterion on criterion.id = item.criterion_id
    where run.status = 'COMPLETED'::public.processing_run_status
  ),
  version_summaries as (
    select jsonb_agg(
      jsonb_build_object(
        'id', version.id,
        'version_number', version.version_number,
        'status', version.status::text,
        'approved_at', version.approved_at,
        'application_count', (
          select count(distinct application_id) from latest_runs
          where scorecard_version_id = version.id
        ),
        'completed_count', (
          select count(*) from latest_runs
          where scorecard_version_id = version.id
            and status = 'COMPLETED'::public.processing_run_status
        ),
        'pending_count', (
          select count(*) from latest_runs
          where scorecard_version_id = version.id
            and status in (
              'QUEUED'::public.processing_run_status,
              'EXTRACTING'::public.processing_run_status,
              'ANALYZING'::public.processing_run_status,
              'VALIDATING'::public.processing_run_status,
              'RETRY_PENDING'::public.processing_run_status
            )
        ),
        'failed_count', (
          select count(*) from latest_runs
          where scorecard_version_id = version.id
            and status in (
              'FAILED'::public.processing_run_status,
              'QUARANTINED'::public.processing_run_status,
              'NEEDS_OCR'::public.processing_run_status
            )
        ),
        'supported_applications', (
          select count(distinct application_id) from evidence_facts
          where scorecard_version_id = version.id
            and status = 'SUPPORTED'::public.evidence_status
        ),
        'partial_applications', (
          select count(distinct application_id) from evidence_facts
          where scorecard_version_id = version.id
            and status = 'PARTIAL'::public.evidence_status
        ),
        'not_found_applications', (
          select count(distinct application_id) from evidence_facts
          where scorecard_version_id = version.id
            and status = 'NOT_FOUND'::public.evidence_status
        )
      ) order by version.version_number
    ) as value
    from compared_versions version
  ),
  lineages as (
    select distinct lineage_id
    from public.criteria
    where scorecard_version_id in (previous_version_id, active_version_id)
  ),
  criterion_summaries as (
    select jsonb_agg(
      jsonb_build_object(
        'lineage_id', lineage.lineage_id,
        'before', (
          select jsonb_build_object(
            'criterion_id', criterion.id,
            'name', criterion.name,
            'type', criterion.type::text,
            'accepted_evidence', criterion.accepted_evidence,
            'excluded_evidence', criterion.excluded_evidence,
            'supported_applications', (
              select count(distinct application_id) from evidence_facts
              where scorecard_version_id = previous_version_id
                and lineage_id = lineage.lineage_id
                and status = 'SUPPORTED'::public.evidence_status
            ),
            'partial_applications', (
              select count(distinct application_id) from evidence_facts
              where scorecard_version_id = previous_version_id
                and lineage_id = lineage.lineage_id
                and status = 'PARTIAL'::public.evidence_status
            ),
            'not_found_applications', (
              select count(distinct application_id) from evidence_facts
              where scorecard_version_id = previous_version_id
                and lineage_id = lineage.lineage_id
                and status = 'NOT_FOUND'::public.evidence_status
            )
          )
          from public.criteria criterion
          where criterion.scorecard_version_id = previous_version_id
            and criterion.lineage_id = lineage.lineage_id
        ),
        'after', (
          select jsonb_build_object(
            'criterion_id', criterion.id,
            'name', criterion.name,
            'type', criterion.type::text,
            'accepted_evidence', criterion.accepted_evidence,
            'excluded_evidence', criterion.excluded_evidence,
            'supported_applications', (
              select count(distinct application_id) from evidence_facts
              where scorecard_version_id = active_version_id
                and lineage_id = lineage.lineage_id
                and status = 'SUPPORTED'::public.evidence_status
            ),
            'partial_applications', (
              select count(distinct application_id) from evidence_facts
              where scorecard_version_id = active_version_id
                and lineage_id = lineage.lineage_id
                and status = 'PARTIAL'::public.evidence_status
            ),
            'not_found_applications', (
              select count(distinct application_id) from evidence_facts
              where scorecard_version_id = active_version_id
                and lineage_id = lineage.lineage_id
                and status = 'NOT_FOUND'::public.evidence_status
            )
          )
          from public.criteria criterion
          where criterion.scorecard_version_id = active_version_id
            and criterion.lineage_id = lineage.lineage_id
        )
      ) order by lineage.lineage_id
    ) as value
    from lineages lineage
  )
  select jsonb_build_object(
    'versions', coalesce(version_summaries.value, '[]'::jsonb),
    'criteria', coalesce(criterion_summaries.value, '[]'::jsonb)
  )
  into result
  from version_summaries cross join criterion_summaries;
  return result;
end;
$$;

revoke all on function public.framework_revision_comparison(uuid)
  from public, anon, service_role;
grant execute on function public.framework_revision_comparison(uuid)
  to authenticated;

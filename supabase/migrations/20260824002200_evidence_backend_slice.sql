-- HL-033~035 evidence processing, source validation, bounded retry, and Admin
-- failure notification. Forward-only rollback: preserve runs/evidence/audit rows.

alter table public.processing_runs
  add column idempotency_key text,
  add column prompt_version text,
  add column schema_version text,
  add column model_id text,
  add column provider_request_id text,
  add column input_tokens integer,
  add column output_tokens integer,
  add column total_tokens integer,
  add column estimated_cost_microusd bigint,
  add column analysis_duration_ms integer,
  add column error_detail_safe text;

update public.processing_runs
set idempotency_key = encode(extensions.digest(
  application_id::text || ':' || resume_file_id::text || ':' || scorecard_version_id::text || ':' || pipeline_version,
  'sha256'
), 'hex');
alter table public.processing_runs alter column idempotency_key set not null;
create unique index processing_runs_idempotency_key_idx on public.processing_runs (idempotency_key);

create function public.set_evidence_processing_identity()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new.pipeline_version = 'pdf-v1' then new.pipeline_version := 'evidence-pipeline-v1'; end if;
  new.idempotency_key := encode(extensions.digest(new.application_id::text || ':' || new.resume_file_id::text || ':' || new.scorecard_version_id::text || ':' || new.pipeline_version, 'sha256'), 'hex');
  return new;
end $$;
create trigger processing_runs_set_evidence_identity before insert or update of application_id, resume_file_id, scorecard_version_id, pipeline_version on public.processing_runs for each row execute function public.set_evidence_processing_identity();

do $$ declare constraint_row record; begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.processing_runs'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%status%' or pg_get_constraintdef(oid) ilike '%completed_at%' or pg_get_constraintdef(oid) ilike '%error_category%')
  loop execute format('alter table public.processing_runs drop constraint %I', constraint_row.conname); end loop;
end $$;
alter table public.processing_runs add constraint processing_runs_timing_check check (
  (status = 'EXTRACTING'::public.processing_run_status) = (extracting_at is not null)
  and (status in ('COMPLETED'::public.processing_run_status, 'NEEDS_OCR'::public.processing_run_status, 'FAILED'::public.processing_run_status, 'QUARANTINED'::public.processing_run_status)) = (completed_at is not null)
);
alter table public.processing_runs add constraint processing_runs_failure_check check (
  (status in ('RETRY_PENDING'::public.processing_run_status, 'FAILED'::public.processing_run_status, 'QUARANTINED'::public.processing_run_status)) = (error_category is not null)
);
alter table public.processing_runs add constraint processing_runs_usage_check check (
  input_tokens is null or (input_tokens >= 0 and output_tokens >= 0 and total_tokens = input_tokens + output_tokens and estimated_cost_microusd >= 0 and analysis_duration_ms >= 0)
);

create type public.evidence_status as enum ('SUPPORTED', 'PARTIAL', 'NOT_FOUND', 'CONTRADICTED', 'HUMAN_ONLY');
create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  processing_run_id uuid not null references public.processing_runs (id) on delete restrict,
  criterion_id uuid not null references public.criteria (id) on delete restrict,
  status public.evidence_status not null,
  source_ordinal smallint not null check (source_ordinal between 0 and 16),
  resume_page_id uuid references public.resume_pages (id) on delete restrict,
  exact_quote text,
  interpretation text,
  uncertainty text,
  suggested_interview_question text,
  source_quote_hash text,
  source_page_hash text,
  created_at timestamptz not null default now(),
  unique (processing_run_id, criterion_id, source_ordinal),
  check ((source_ordinal = 0) = (resume_page_id is null)),
  check ((resume_page_id is null) = (exact_quote is null and source_quote_hash is null and source_page_hash is null)),
  check ((status in ('NOT_FOUND'::public.evidence_status, 'HUMAN_ONLY'::public.evidence_status)) = (source_ordinal = 0)),
  check (source_quote_hash is null or source_quote_hash ~ '^[0-9a-f]{64}$'),
  check (source_page_hash is null or source_page_hash ~ '^[0-9a-f]{64}$')
);
create index evidence_items_run_criterion_idx on public.evidence_items (processing_run_id, criterion_id);
alter table public.evidence_items enable row level security;
create policy evidence_items_select_assigned on public.evidence_items for select to authenticated using (
  exists (select 1 from public.processing_runs run where run.id = evidence_items.processing_run_id and public.can_access_application(run.application_id))
);
grant select on public.evidence_items to authenticated;
revoke insert, update, delete on public.evidence_items from anon, authenticated, service_role;

create function public.claim_evidence_processing_run(target_processing_run_id uuid)
returns table(processing_run_id uuid, resume_file_id uuid, storage_path text, attempt_count smallint, stage text, pipeline_version text)
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_worker_service_role();
  return query with claimed as (
    update public.processing_runs run set
      status = case when exists (select 1 from public.resume_pages page where page.processing_run_id = run.id) then 'ANALYZING'::public.processing_run_status else 'EXTRACTING'::public.processing_run_status end,
      attempt_count = run.attempt_count + 1,
      extracting_at = case when exists (select 1 from public.resume_pages page where page.processing_run_id = run.id) then null else now() end,
      completed_at = null, error_category = null, error_detail_safe = null
    where run.id = target_processing_run_id and run.status in ('QUEUED'::public.processing_run_status, 'RETRY_PENDING'::public.processing_run_status) and run.attempt_count < 2
    returning run.*
  ) select claimed.id, claimed.resume_file_id, resume.storage_path, claimed.attempt_count,
      claimed.status::text, claimed.pipeline_version
    from claimed join public.resume_files resume on resume.id = claimed.resume_file_id;
end $$;

create function public.complete_resume_extraction_for_evidence(target_processing_run_id uuid, extracted_pages jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
declare run public.processing_runs%rowtype; page jsonb; expected_page integer := 1;
begin
  perform public.require_worker_service_role();
  select * into run from public.processing_runs where id = target_processing_run_id for update;
  if not found then raise exception 'processing run not found' using errcode = 'P0002'; end if;
  if run.status = 'ANALYZING'::public.processing_run_status then return; end if;
  if run.status <> 'EXTRACTING'::public.processing_run_status then raise exception 'processing run is not extracting' using errcode = '55000'; end if;
  if jsonb_typeof(extracted_pages) <> 'array' or jsonb_array_length(extracted_pages) = 0 then raise exception 'extracted pages are required' using errcode = '22023'; end if;
  for page in select value from jsonb_array_elements(extracted_pages) loop
    if (page ->> 'page_number') !~ '^[1-9][0-9]*$' or (page ->> 'page_number')::integer <> expected_page then raise exception 'page numbers must be contiguous' using errcode = '22023'; end if;
    if coalesce(page ->> 'raw_text_sha256', '') !~ '^[0-9a-f]{64}$' or coalesce(page ->> 'normalized_text_sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'page hashes are invalid' using errcode = '22023'; end if;
    insert into public.resume_pages (resume_file_id, processing_run_id, page_number, raw_text, normalized_text, raw_text_sha256, normalized_text_sha256)
    values (run.resume_file_id, run.id, (page ->> 'page_number')::integer, coalesce(page ->> 'raw_text', ''), coalesce(page ->> 'normalized_text', ''), page ->> 'raw_text_sha256', page ->> 'normalized_text_sha256')
    on conflict (processing_run_id, page_number) do nothing;
    expected_page := expected_page + 1;
  end loop;
  update public.processing_runs set status = 'ANALYZING'::public.processing_run_status, extracting_at = null where id = run.id;
end $$;

create function public.load_evidence_analysis_context(target_processing_run_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare run public.processing_runs%rowtype; result jsonb;
begin
  perform public.require_worker_service_role();
  select * into run from public.processing_runs where id = target_processing_run_id;
  if not found or run.status <> 'ANALYZING'::public.processing_run_status then raise exception 'processing run is not analyzing' using errcode = '55000'; end if;
  if not exists (select 1 from public.scorecard_versions version where version.id = run.scorecard_version_id and version.approved_at is not null and version.status in ('APPROVED'::public.scorecard_status, 'SUPERSEDED'::public.scorecard_status)) then raise exception 'processing run requires a human-approved scorecard version' using errcode = '55000'; end if;
  select jsonb_build_object(
    'processing_run_id', run.id, 'application_id', run.application_id, 'resume_file_id', run.resume_file_id,
    'scorecard_version_id', run.scorecard_version_id, 'pipeline_version', run.pipeline_version,
    'criteria', (select jsonb_agg(jsonb_build_object('criterion_id', criterion.id, 'type', criterion.type::text, 'definition', criterion.definition, 'accepted_evidence', criterion.accepted_evidence, 'alternative_evidence', criterion.alternative_evidence, 'resume_assessable', criterion.resume_assessable, 'suggested_interview_question', criterion.suggested_interview_question) order by criterion.display_order) from public.criteria criterion where criterion.scorecard_version_id = run.scorecard_version_id),
    'pages', (select jsonb_agg(jsonb_build_object('page_id', page.id, 'page_number', page.page_number, 'normalized_text', page.normalized_text, 'normalized_text_sha256', page.normalized_text_sha256) order by page.page_number) from public.resume_pages page where page.processing_run_id = run.id)
  ) into result;
  if result -> 'criteria' is null or result -> 'pages' is null then raise exception 'approved criteria and extracted pages are required' using errcode = '55000'; end if;
  return result;
end $$;

create function public.mark_evidence_validating(target_processing_run_id uuid, prompt_version_value text, schema_version_value text, model_id_value text, provider_request_id_value text, input_tokens_value integer, output_tokens_value integer, total_tokens_value integer, estimated_cost_microusd_value bigint, duration_ms_value integer)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_worker_service_role();
  if trim(coalesce(prompt_version_value, '')) = '' or trim(coalesce(schema_version_value, '')) = '' or trim(coalesce(model_id_value, '')) = '' then raise exception 'AI versions are required' using errcode = '22023'; end if;
  if input_tokens_value < 0 or output_tokens_value < 0 or total_tokens_value <> input_tokens_value + output_tokens_value or estimated_cost_microusd_value < 0 or duration_ms_value < 0 then raise exception 'AI usage metadata is invalid' using errcode = '22023'; end if;
  update public.processing_runs set status = 'VALIDATING'::public.processing_run_status, prompt_version = prompt_version_value, schema_version = schema_version_value, model_id = model_id_value, provider_request_id = provider_request_id_value, input_tokens = input_tokens_value, output_tokens = output_tokens_value, total_tokens = total_tokens_value, estimated_cost_microusd = estimated_cost_microusd_value, analysis_duration_ms = duration_ms_value
  where id = target_processing_run_id and status = 'ANALYZING'::public.processing_run_status;
  if not found then raise exception 'processing run is not analyzing' using errcode = '55000'; end if;
end $$;

create function public.persist_validated_evidence(target_processing_run_id uuid, evidence_results jsonb)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare run public.processing_runs%rowtype; result jsonb; source jsonb; criterion_row public.criteria%rowtype; page_row public.resume_pages%rowtype; result_index integer := 0; source_index integer; normalized_quote text; seen_ids uuid[] := '{}';
begin
  perform public.require_worker_service_role();
  select * into run from public.processing_runs where id = target_processing_run_id for update;
  if not found then raise exception 'processing run not found' using errcode = 'P0002'; end if;
  if run.status = 'COMPLETED'::public.processing_run_status then return; end if;
  if run.status <> 'VALIDATING'::public.processing_run_status then raise exception 'processing run is not validating' using errcode = '55000'; end if;
  if jsonb_typeof(evidence_results) <> 'array' or jsonb_array_length(evidence_results) = 0 then raise exception 'evidence results are required' using errcode = '22023'; end if;
  if jsonb_array_length(evidence_results) <> (select count(*) from public.criteria where scorecard_version_id = run.scorecard_version_id) then raise exception 'every approved criterion must occur exactly once' using errcode = '22023'; end if;
  delete from public.evidence_items where processing_run_id = run.id;
  for result in select value from jsonb_array_elements(evidence_results) loop
    if (select count(*) from jsonb_object_keys(result)) <> 6 then raise exception 'evidence result has unknown or missing keys' using errcode = '22023'; end if;
    select * into criterion_row from public.criteria where id = (result ->> 'criterion_id')::uuid and scorecard_version_id = run.scorecard_version_id;
    if not found or criterion_row.id = any(seen_ids) then raise exception 'unknown or duplicate criterion' using errcode = '22023'; end if;
    seen_ids := array_append(seen_ids, criterion_row.id);
    if not criterion_row.resume_assessable and result ->> 'status' <> 'HUMAN_ONLY' then raise exception 'non-resume-assessable criterion must be HUMAN_ONLY' using errcode = '22023'; end if;
    if result ->> 'status' in ('NOT_FOUND', 'HUMAN_ONLY') then
      if jsonb_typeof(result -> 'evidence') <> 'array' or jsonb_array_length(result -> 'evidence') <> 0 then raise exception 'source-free status cannot contain evidence' using errcode = '22023'; end if;
      insert into public.evidence_items (processing_run_id, criterion_id, status, source_ordinal, interpretation, uncertainty, suggested_interview_question)
      values (run.id, criterion_row.id, (result ->> 'status')::public.evidence_status, 0, nullif(trim(result ->> 'interpretation'), ''), nullif(trim(result ->> 'uncertainty'), ''), nullif(trim(result ->> 'suggested_interview_question'), ''));
    else
      if jsonb_typeof(result -> 'evidence') <> 'array' or jsonb_array_length(result -> 'evidence') = 0 or jsonb_array_length(result -> 'evidence') > 16 then raise exception 'evidence-bearing status requires bounded sources' using errcode = '22023'; end if;
      source_index := 0;
      for source in select value from jsonb_array_elements(result -> 'evidence') loop
        source_index := source_index + 1;
        if (select count(*) from jsonb_object_keys(source)) <> 4 then raise exception 'evidence source has unknown or missing keys' using errcode = '22023'; end if;
        select * into page_row from public.resume_pages where processing_run_id = run.id and page_number = (source ->> 'page_number')::integer;
        if not found then raise exception 'evidence page is outside source bounds' using errcode = '22023'; end if;
        normalized_quote := regexp_replace(trim(source ->> 'exact_quote'), '[[:space:]]+', ' ', 'g');
        if normalized_quote = '' or position(normalized_quote in page_row.normalized_text) = 0 then raise exception 'evidence quote does not match source page' using errcode = '22023'; end if;
        if lower(source ->> 'source_quote_hash') <> encode(extensions.digest(normalized_quote, 'sha256'), 'hex') or lower(source ->> 'source_page_hash') <> page_row.normalized_text_sha256 then raise exception 'evidence source hash mismatch' using errcode = '22023'; end if;
        insert into public.evidence_items (processing_run_id, criterion_id, status, source_ordinal, resume_page_id, exact_quote, interpretation, uncertainty, suggested_interview_question, source_quote_hash, source_page_hash)
        values (run.id, criterion_row.id, (result ->> 'status')::public.evidence_status, source_index, page_row.id, source ->> 'exact_quote', nullif(trim(result ->> 'interpretation'), ''), nullif(trim(result ->> 'uncertainty'), ''), nullif(trim(result ->> 'suggested_interview_question'), ''), lower(source ->> 'source_quote_hash'), lower(source ->> 'source_page_hash'));
      end loop;
    end if;
    result_index := result_index + 1;
  end loop;
  update public.processing_runs set status = 'COMPLETED'::public.processing_run_status, completed_at = now(), error_category = null, error_detail_safe = null where id = run.id;
  perform public.append_safe_audit('EVIDENCE_PROCESSING_COMPLETED', 'application', run.application_id, jsonb_build_object('processing_run_id', run.id, 'evidence_result_count', result_index), null, null, null, 'evidence_worker', run.prompt_version);
end $$;

create function public.record_evidence_processing_failure(target_processing_run_id uuid, failure_category public.processing_error_category, is_retryable boolean, should_quarantine boolean, safe_detail text)
returns void language plpgsql security definer set search_path = public, auth, pgmq as $$
declare run public.processing_runs%rowtype; terminal_status public.processing_run_status;
begin
  perform public.require_worker_service_role();
  select * into run from public.processing_runs where id = target_processing_run_id for update;
  if not found then raise exception 'processing run not found' using errcode = 'P0002'; end if;
  if run.status in ('COMPLETED'::public.processing_run_status, 'NEEDS_OCR'::public.processing_run_status, 'FAILED'::public.processing_run_status, 'QUARANTINED'::public.processing_run_status) then return; end if;
  if run.status not in ('EXTRACTING'::public.processing_run_status, 'ANALYZING'::public.processing_run_status, 'VALIDATING'::public.processing_run_status) then raise exception 'processing run is not active' using errcode = '55000'; end if;
  if should_quarantine then terminal_status := 'QUARANTINED'::public.processing_run_status;
  elsif is_retryable and run.attempt_count < 2 then
    update public.processing_runs set status = 'RETRY_PENDING'::public.processing_run_status, extracting_at = null, error_category = failure_category, error_detail_safe = left(nullif(trim(coalesce(safe_detail, '')), ''), 500) where id = run.id;
    perform public.enqueue_resume_processing_run(run.id);
    perform public.append_safe_audit('PROCESSING_RETRY_PENDING', 'application', run.application_id, jsonb_build_object('processing_run_id', run.id, 'attempt_count', run.attempt_count, 'error_category', failure_category::text), null, null, null, 'evidence_worker', run.pipeline_version);
    return;
  else terminal_status := 'FAILED'::public.processing_run_status; end if;
  update public.processing_runs set status = terminal_status, extracting_at = null, completed_at = now(), error_category = failure_category, error_detail_safe = left(nullif(trim(coalesce(safe_detail, '')), ''), 500) where id = run.id;
  insert into public.notifications (recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata)
  select profile.id, 'PROCESSING_FAILED', 'application', run.application_id, run.id::text, jsonb_build_object('processing_run_id', run.id, 'status', terminal_status::text, 'error_category', failure_category::text, 'attempt_count', run.attempt_count)
  from public.profiles profile where profile.role = 'ADMIN'::public.app_role on conflict do nothing;
  perform public.append_safe_audit(case when terminal_status = 'QUARANTINED' then 'PROCESSING_QUARANTINED' else 'PROCESSING_FAILED' end, 'application', run.application_id, jsonb_build_object('processing_run_id', run.id, 'attempt_count', run.attempt_count, 'error_category', failure_category::text), null, null, null, 'evidence_worker', run.pipeline_version);
end $$;

revoke execute on function public.claim_evidence_processing_run(uuid), public.complete_resume_extraction_for_evidence(uuid, jsonb), public.load_evidence_analysis_context(uuid), public.mark_evidence_validating(uuid, text, text, text, text, integer, integer, integer, bigint, integer), public.persist_validated_evidence(uuid, jsonb), public.record_evidence_processing_failure(uuid, public.processing_error_category, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_evidence_processing_run(uuid), public.complete_resume_extraction_for_evidence(uuid, jsonb), public.load_evidence_analysis_context(uuid), public.mark_evidence_validating(uuid, text, text, text, text, integer, integer, integer, bigint, integer), public.persist_validated_evidence(uuid, jsonb), public.record_evidence_processing_failure(uuid, public.processing_error_category, boolean, boolean, text) to service_role;

-- The worker role intentionally retains no human review/outcome/decision table write grant.

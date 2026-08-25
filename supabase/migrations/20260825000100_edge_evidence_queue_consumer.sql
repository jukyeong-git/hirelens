-- Replace long-running queue polling with a lease-fenced Edge consumer.
-- Forward-fix rollback: unschedule the cron job and deploy a later migration;
-- never remove durable runs, queue quarantine rows, evidence, or audit events.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.processing_runs
  add column lease_token uuid,
  add column lease_expires_at timestamptz;
create index processing_runs_active_lease_idx
  on public.processing_runs (lease_expires_at)
  where status in ('EXTRACTING', 'ANALYZING', 'VALIDATING');

-- Existing active rows are deliberately made stale so the first Edge call can
-- recover work left by a terminated Node worker.
update public.processing_runs
set lease_token = gen_random_uuid(), lease_expires_at = now()
where status in ('EXTRACTING', 'ANALYZING', 'VALIDATING');

create table public.evidence_queue_quarantine (
  id bigint generated always as identity primary key,
  queue_message_id bigint not null unique,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('MALFORMED_MESSAGE', 'UNKNOWN_PROCESSING_RUN')),
  created_at timestamptz not null default now()
);
alter table public.evidence_queue_quarantine enable row level security;
revoke all on public.evidence_queue_quarantine from anon, authenticated, service_role;

create table public.evidence_consumer_control (
  singleton boolean primary key default true check (singleton),
  consumer_mode text not null check (consumer_mode in ('NODE', 'EDGE')),
  updated_at timestamptz not null default now()
);
insert into public.evidence_consumer_control(singleton, consumer_mode) values (true, 'NODE');
alter table public.evidence_consumer_control enable row level security;
revoke all on public.evidence_consumer_control from anon, authenticated, service_role;

create function public.recover_stale_evidence_processing_runs(recovery_limit integer default 10)
returns integer language plpgsql security definer set search_path = public, auth, pgmq as $$
declare run public.processing_runs%rowtype; recovered integer := 0; terminal_status public.processing_run_status;
begin
  perform public.require_worker_service_role();
  if recovery_limit < 1 or recovery_limit > 100 then raise exception 'invalid recovery limit' using errcode = '22023'; end if;
  for run in
    select * from public.processing_runs
    where (status in ('EXTRACTING', 'ANALYZING', 'VALIDATING') and lease_expires_at <= now())
       or (status in ('QUEUED', 'RETRY_PENDING') and attempt_count >= 2)
    order by coalesce(lease_expires_at, created_at), created_at
    for update skip locked limit recovery_limit
  loop
    if run.attempt_count < 2 then
      update public.processing_runs set status = 'RETRY_PENDING', extracting_at = null,
        lease_token = null, lease_expires_at = null, error_category = 'EVIDENCE_PERSISTENCE_FAILED',
        error_detail_safe = 'PROCESSING_LEASE_EXPIRED'
      where id = run.id;
      perform public.enqueue_resume_processing_run(run.id);
      perform public.append_safe_audit('PROCESSING_RETRY_PENDING', 'application', run.application_id,
        jsonb_build_object('processing_run_id', run.id, 'attempt_count', run.attempt_count,
          'error_category', 'EVIDENCE_PERSISTENCE_FAILED'), null, null, null,
        'evidence_edge_worker', run.pipeline_version);
    else
      terminal_status := 'FAILED';
      update public.processing_runs set status = terminal_status, extracting_at = null,
        lease_token = null, lease_expires_at = null, completed_at = now(),
        error_category = 'EVIDENCE_PERSISTENCE_FAILED', error_detail_safe = 'PROCESSING_LEASE_EXPIRED'
      where id = run.id;
      insert into public.notifications (recipient_id, event_type, aggregate_type, aggregate_id, relevant_version, safe_metadata)
      select profile.id, 'PROCESSING_FAILED', 'application', run.application_id, run.id::text,
        jsonb_build_object('processing_run_id', run.id, 'status', 'FAILED',
          'error_category', 'EVIDENCE_PERSISTENCE_FAILED', 'attempt_count', run.attempt_count)
      from public.profiles profile where profile.role = 'ADMIN' on conflict do nothing;
      perform public.append_safe_audit('PROCESSING_FAILED', 'application', run.application_id,
        jsonb_build_object('processing_run_id', run.id, 'attempt_count', run.attempt_count,
          'error_category', 'EVIDENCE_PERSISTENCE_FAILED'), null, null, null,
        'evidence_edge_worker', run.pipeline_version);
    end if;
    recovered := recovered + 1;
  end loop;
  return recovered;
end $$;

create function public.dequeue_evidence_queue_message(
  visibility_timeout_seconds integer default 360,
  expected_consumer_mode text default 'EDGE'
)
returns table(msg_id bigint, message jsonb)
language plpgsql security definer set search_path = public, auth, pgmq as $$
begin
  perform public.require_worker_service_role();
  if visibility_timeout_seconds < 60 or visibility_timeout_seconds > 900 then raise exception 'invalid visibility timeout' using errcode = '22023'; end if;
  if expected_consumer_mode not in ('NODE', 'EDGE') or not exists (
    select 1 from public.evidence_consumer_control
    where singleton and consumer_mode = expected_consumer_mode
  ) then
    raise exception 'evidence consumer mode is not active' using errcode = '55000';
  end if;
  perform public.recover_stale_evidence_processing_runs(10);
  return query select item.msg_id, item.message
    from pgmq.read('resume_analysis', visibility_timeout_seconds, 1) item;
end $$;

create function public.renew_evidence_processing_lease(
  target_processing_run_id uuid,
  expected_lease_token uuid,
  lease_seconds integer default 300
)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_worker_service_role();
  if lease_seconds < 60 or lease_seconds > 900 then raise exception 'invalid lease duration' using errcode = '22023'; end if;
  update public.processing_runs
  set lease_expires_at = now() + make_interval(secs => lease_seconds)
  where id = target_processing_run_id
    and lease_token = expected_lease_token
    and lease_expires_at > now()
    and status in ('EXTRACTING', 'ANALYZING', 'VALIDATING');
  if not found then
    raise exception 'processing lease is missing, stale, or in the wrong state' using errcode = '55000';
  end if;
end $$;

create function public.claim_evidence_processing_run(target_processing_run_id uuid, lease_seconds integer)
returns table(processing_run_id uuid, resume_file_id uuid, storage_path text, attempt_count smallint, stage text, pipeline_version text, lease_token uuid)
language plpgsql security definer set search_path = public, auth as $$
declare new_lease uuid := gen_random_uuid();
begin
  perform public.require_worker_service_role();
  if lease_seconds < 60 or lease_seconds > 900 then raise exception 'invalid lease duration' using errcode = '22023'; end if;
  return query with claimed as (
    update public.processing_runs run set
      status = case when exists (select 1 from public.resume_pages page where page.processing_run_id = run.id) then 'ANALYZING'::public.processing_run_status else 'EXTRACTING'::public.processing_run_status end,
      attempt_count = run.attempt_count + 1,
      extracting_at = case when exists (select 1 from public.resume_pages page where page.processing_run_id = run.id) then null else now() end,
      completed_at = null, error_category = null, error_detail_safe = null,
      lease_token = new_lease, lease_expires_at = now() + make_interval(secs => lease_seconds)
    where run.id = target_processing_run_id and run.status in ('QUEUED', 'RETRY_PENDING') and run.attempt_count < 2
    returning run.*
  ) select claimed.id, claimed.resume_file_id, resume.storage_path, claimed.attempt_count,
      claimed.status::text, claimed.pipeline_version, claimed.lease_token
    from claimed join public.resume_files resume on resume.id = claimed.resume_file_id;
end $$;

create function public.assert_evidence_processing_lease(target_processing_run_id uuid, expected_lease_token uuid, expected_statuses text[])
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.require_worker_service_role();
  if not exists (select 1 from public.processing_runs run where run.id = target_processing_run_id
    and run.lease_token = expected_lease_token and run.lease_expires_at > now()
    and run.status::text = any(expected_statuses)) then
    raise exception 'processing lease is missing, stale, or in the wrong state' using errcode = '55000';
  end if;
end $$;

create function public.complete_resume_extraction_for_evidence(target_processing_run_id uuid, extracted_pages jsonb, expected_lease_token uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.assert_evidence_processing_lease(target_processing_run_id, expected_lease_token, array['EXTRACTING']);
  perform public.complete_resume_extraction_for_evidence(target_processing_run_id, extracted_pages);
  update public.processing_runs set lease_expires_at = now() + interval '5 minutes' where id = target_processing_run_id and lease_token = expected_lease_token;
end $$;
create function public.load_evidence_analysis_context(target_processing_run_id uuid, expected_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.assert_evidence_processing_lease(target_processing_run_id, expected_lease_token, array['ANALYZING']);
  update public.processing_runs set lease_expires_at = now() + interval '5 minutes' where id = target_processing_run_id and lease_token = expected_lease_token;
  return public.load_evidence_analysis_context(target_processing_run_id);
end $$;
create function public.mark_evidence_validating(target_processing_run_id uuid, prompt_version_value text, schema_version_value text, model_id_value text, provider_request_id_value text, input_tokens_value integer, output_tokens_value integer, total_tokens_value integer, estimated_cost_microusd_value bigint, duration_ms_value integer, expected_lease_token uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.assert_evidence_processing_lease(target_processing_run_id, expected_lease_token, array['ANALYZING']);
  perform public.mark_evidence_validating(target_processing_run_id, prompt_version_value, schema_version_value, model_id_value, provider_request_id_value, input_tokens_value, output_tokens_value, total_tokens_value, estimated_cost_microusd_value, duration_ms_value);
  update public.processing_runs set lease_expires_at = now() + interval '5 minutes' where id = target_processing_run_id and lease_token = expected_lease_token;
end $$;
create function public.persist_validated_evidence(target_processing_run_id uuid, evidence_results jsonb, expected_lease_token uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if exists (
    select 1 from public.processing_runs run
    where run.id = target_processing_run_id and run.status = 'COMPLETED'
  ) then return; end if;
  perform public.assert_evidence_processing_lease(target_processing_run_id, expected_lease_token, array['VALIDATING']);
  perform public.persist_validated_evidence(target_processing_run_id, evidence_results);
  update public.processing_runs set lease_token = null, lease_expires_at = null where id = target_processing_run_id;
end $$;
create function public.mark_evidence_needs_ocr(target_processing_run_id uuid, expected_lease_token uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.assert_evidence_processing_lease(target_processing_run_id, expected_lease_token, array['EXTRACTING']);
  perform public.mark_evidence_needs_ocr(target_processing_run_id);
  update public.processing_runs set lease_token = null, lease_expires_at = null where id = target_processing_run_id;
end $$;
create function public.record_evidence_processing_failure(target_processing_run_id uuid, failure_category public.processing_error_category, is_retryable boolean, should_quarantine boolean, safe_detail text, expected_lease_token uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.assert_evidence_processing_lease(target_processing_run_id, expected_lease_token, array['EXTRACTING','ANALYZING','VALIDATING']);
  perform public.record_evidence_processing_failure(target_processing_run_id, failure_category, is_retryable, should_quarantine, safe_detail);
  update public.processing_runs set lease_token = null, lease_expires_at = null where id = target_processing_run_id;
end $$;

create function public.quarantine_malformed_evidence_queue_message(target_message_id bigint)
returns void language plpgsql security definer set search_path = public, auth, pgmq, extensions as $$
declare payload jsonb;
begin
  perform public.require_worker_service_role();
  select message into payload from pgmq.q_resume_analysis where msg_id = target_message_id for update;
  if not found then return; end if;
  if jsonb_typeof(payload) = 'object'
     and (select count(*) from jsonb_object_keys(payload)) = 1
     and payload ? 'processing_run_id'
     and payload ->> 'processing_run_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'valid queue payload cannot be quarantined as malformed' using errcode = '22023';
  end if;
  insert into public.evidence_queue_quarantine(queue_message_id, payload_sha256, reason)
  values (target_message_id, encode(extensions.digest(payload::text, 'sha256'), 'hex'), 'MALFORMED_MESSAGE')
  on conflict (queue_message_id) do nothing;
  perform pgmq.archive('resume_analysis', target_message_id);
end $$;

create function public.settle_evidence_queue_message(target_message_id bigint, target_processing_run_id uuid)
returns boolean language plpgsql security definer set search_path = public, auth, pgmq, extensions as $$
declare payload jsonb; run public.processing_runs%rowtype;
begin
  perform public.require_worker_service_role();
  select message into payload from pgmq.q_resume_analysis where msg_id = target_message_id for update;
  if not found then return true; end if;
  if jsonb_typeof(payload) <> 'object' or payload ->> 'processing_run_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (payload ->> 'processing_run_id')::uuid <> target_processing_run_id then
    raise exception 'queue payload does not match processing run' using errcode = '22023';
  end if;
  select * into run from public.processing_runs where id = target_processing_run_id;
  if not found then
    insert into public.evidence_queue_quarantine(queue_message_id, payload_sha256, reason)
    values (target_message_id, encode(extensions.digest(payload::text, 'sha256'), 'hex'), 'UNKNOWN_PROCESSING_RUN')
    on conflict (queue_message_id) do nothing;
    perform pgmq.archive('resume_analysis', target_message_id);
    return true;
  end if;
  if run.status in ('COMPLETED','NEEDS_OCR','FAILED','QUARANTINED')
     or (run.status = 'RETRY_PENDING' and run.queue_message_id is distinct from target_message_id) then
    perform pgmq.archive('resume_analysis', target_message_id);
    return true;
  end if;
  return false;
end $$;

revoke execute on function public.claim_evidence_processing_run(uuid),
  public.complete_resume_extraction_for_evidence(uuid,jsonb), public.load_evidence_analysis_context(uuid),
  public.mark_evidence_validating(uuid,text,text,text,text,integer,integer,integer,bigint,integer),
  public.persist_validated_evidence(uuid,jsonb), public.mark_evidence_needs_ocr(uuid),
  public.record_evidence_processing_failure(uuid,public.processing_error_category,boolean,boolean,text)
  from service_role;
revoke all on function public.recover_stale_evidence_processing_runs(integer), public.dequeue_evidence_queue_message(integer,text),
  public.claim_evidence_processing_run(uuid,integer), public.assert_evidence_processing_lease(uuid,uuid,text[]),
  public.renew_evidence_processing_lease(uuid,uuid,integer),
  public.complete_resume_extraction_for_evidence(uuid,jsonb,uuid), public.load_evidence_analysis_context(uuid,uuid),
  public.mark_evidence_validating(uuid,text,text,text,text,integer,integer,integer,bigint,integer,uuid),
  public.persist_validated_evidence(uuid,jsonb,uuid), public.mark_evidence_needs_ocr(uuid,uuid),
  public.record_evidence_processing_failure(uuid,public.processing_error_category,boolean,boolean,text,uuid),
  public.quarantine_malformed_evidence_queue_message(bigint), public.settle_evidence_queue_message(bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.recover_stale_evidence_processing_runs(integer), public.dequeue_evidence_queue_message(integer,text),
  public.claim_evidence_processing_run(uuid,integer), public.assert_evidence_processing_lease(uuid,uuid,text[]),
  public.renew_evidence_processing_lease(uuid,uuid,integer),
  public.complete_resume_extraction_for_evidence(uuid,jsonb,uuid), public.load_evidence_analysis_context(uuid,uuid),
  public.mark_evidence_validating(uuid,text,text,text,text,integer,integer,integer,bigint,integer,uuid),
  public.persist_validated_evidence(uuid,jsonb,uuid), public.mark_evidence_needs_ocr(uuid,uuid),
  public.record_evidence_processing_failure(uuid,public.processing_error_category,boolean,boolean,text,uuid),
  public.quarantine_malformed_evidence_queue_message(bigint), public.settle_evidence_queue_message(bigint,uuid)
  to service_role;

-- Vault values are provisioned operationally as `hirelens_project_url` and
-- `hirelens_edge_invocation_secret`. The schedule is inert until both exist.
select cron.unschedule(jobid) from cron.job where jobname = 'hirelens-evidence-edge-consumer';
select cron.schedule('hirelens-evidence-edge-consumer', '* * * * *', $cron$
  select net.http_post(
    url := secrets.project_url || '/functions/v1/process-evidence-queue',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-hirelens-invocation-secret', secrets.invocation_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (
    select max(decrypted_secret) filter (where name = 'hirelens_project_url') project_url,
           max(decrypted_secret) filter (where name = 'hirelens_edge_invocation_secret') invocation_secret
    from vault.decrypted_secrets
  ) secrets
  cross join public.evidence_consumer_control control
  where control.singleton and control.consumer_mode = 'EDGE'
    and secrets.project_url is not null and secrets.invocation_secret is not null
$cron$);

-- Edge uses only the fenced service-role RPCs above. It intentionally retains
-- no grant on human_reviews or interview-progression/decision functions.

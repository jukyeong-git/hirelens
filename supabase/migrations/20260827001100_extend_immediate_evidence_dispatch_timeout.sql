-- Allow the immediate wake-up request to remain connected through the bounded
-- AI timeout. The durable queue and one-minute Cron remain the fallback.
-- Forward-fix rollback: replace the function in a later migration with a
-- shorter timeout; queued processing state is unaffected.

create or replace function public.enqueue_resume_processing_run(target_run_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq, vault, net
as $$
declare
  message_id bigint;
  project_url text;
  invocation_secret text;
begin
  select pgmq.send(
    'resume_analysis',
    jsonb_build_object('processing_run_id', target_run_id)
  ) into message_id;

  update public.processing_runs
  set queue_message_id = message_id
  where id = target_run_id;

  if not found then
    raise exception 'processing run not found' using errcode = 'P0002';
  end if;

  select
    max(decrypted_secret) filter (where name = 'hirelens_project_url'),
    max(decrypted_secret) filter (where name = 'hirelens_edge_invocation_secret')
  into project_url, invocation_secret
  from vault.decrypted_secrets;

  if project_url is not null and invocation_secret is not null then
    perform net.http_post(
      url := project_url || '/functions/v1/process-evidence-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-hirelens-invocation-secret', invocation_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 45000
    );
  end if;

  return message_id;
end;
$$;

revoke all on function public.enqueue_resume_processing_run(uuid)
from public, anon, authenticated, service_role;

-- Use the named idempotency constraint in the internal finalizer so its
-- resume_file_id parameter cannot conflict with the processing_runs column.

do $$
declare
  target_function regprocedure := 'public.finalize_uploaded_resume(uuid)'::regprocedure;
  current_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(target_function) into current_definition;
  updated_definition := replace(
    current_definition,
    'on conflict (application_id, resume_file_id, scorecard_version_id, pipeline_version) do nothing',
    'on conflict on constraint processing_runs_application_id_resume_file_id_scorecard_ver_key do nothing'
  );
  if updated_definition = current_definition
    or updated_definition like '%on conflict (application_id, resume_file_id,%' then
    raise exception 'processing-run conflict target was not replaced';
  end if;
  execute updated_definition;
end;
$$;

-- Qualify the internal finalization parameter so PL/pgSQL does not confuse it
-- with the resume_files.resume_file_id column used later in the function.

do $$
declare
  target_function regprocedure := 'public.finalize_uploaded_resume(uuid)'::regprocedure;
  current_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(target_function) into current_definition;
  updated_definition := replace(
    current_definition,
    'where resume_file.id = resume_file_id for update',
    'where resume_file.id = finalize_uploaded_resume.resume_file_id for update'
  );
  updated_definition := replace(
    updated_definition,
    'where id = resume_file_id;',
    'where id = resume.id;'
  );
  if updated_definition = current_definition
    or updated_definition like '%resume_file.id = resume_file_id%'
    or updated_definition like '%where id = resume_file_id;%' then
    raise exception 'internal resume finalization ambiguity was not fully replaced';
  end if;
  execute updated_definition;
end;
$$;

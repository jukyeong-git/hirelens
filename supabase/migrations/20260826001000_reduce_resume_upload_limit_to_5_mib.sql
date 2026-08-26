-- Reduce the MVP resume upload boundary from 10 MiB to 5 MiB.
-- Rollback note: restoring the previous limit requires a new forward migration;
-- do not edit or revert this applied migration.

update storage.buckets
set file_size_limit = 5242880
where id = 'resumes';

alter table public.resume_files
  drop constraint if exists resume_files_byte_size_check;

alter table public.resume_files
  add constraint resume_files_byte_size_check
  check (byte_size > 0 and byte_size <= 5242880);

do $$
declare
  target_function regprocedure;
  current_definition text;
  updated_definition text;
begin
  foreach target_function in array array[
    'public.create_resume_upload_reservation(uuid,uuid,uuid,uuid,text,text,text,integer,text)'::regprocedure,
    'public.create_public_resume_submission(text,uuid,uuid,uuid,text,text,integer,text)'::regprocedure
  ] loop
    select pg_get_functiondef(target_function) into current_definition;
    updated_definition := replace(current_definition, '10485760', '5242880');
    if updated_definition = current_definition then
      raise exception 'resume size validation was not found in %', target_function;
    end if;
    execute updated_definition;
  end loop;
end;
$$;

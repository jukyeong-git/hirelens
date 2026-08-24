-- Fix two latent success-path defects exposed by strict pgTAP failure parsing:
-- a doubly escaped PDF filename regex and a reference to a helper that was
-- never created. Keep both intake RPC signatures and grants unchanged.

do $$
declare
  target_function regprocedure;
  current_definition text;
  updated_definition text;
begin
  target_function :=
    'public.create_resume_upload_reservation(uuid,uuid,uuid,uuid,text,text,text,integer,text)'::regprocedure;
  select pg_get_functiondef(target_function) into current_definition;
  updated_definition := replace(
    current_definition,
    $needle$normalized_filename !~* '\\.pdf$'$needle$,
    $replacement$normalized_filename !~* '[.]pdf$'$replacement$
  );
  if updated_definition = current_definition then
    raise exception 'internal PDF filename validation pattern was not found';
  end if;
  execute updated_definition;

  target_function :=
    'public.create_public_resume_submission(text,uuid,uuid,uuid,text,text,integer,text)'::regprocedure;
  select pg_get_functiondef(target_function) into current_definition;
  updated_definition := replace(
    current_definition,
    $needle$normalized_filename !~* '\\.pdf$'$needle$,
    $replacement$normalized_filename !~* '[.]pdf$'$replacement$
  );
  updated_definition := replace(
    updated_definition,
    'and public.is_public_job_posting_content_complete(posting)',
    $replacement$and trim(coalesce(posting.public_title, '')) <> ''
    and trim(coalesce(posting.public_summary, '')) <> ''
    and trim(coalesce(posting.public_responsibilities, '')) <> ''
    and trim(coalesce(posting.public_requirements, '')) <> ''
    and trim(coalesce(posting.public_location, '')) <> ''
    and trim(coalesce(posting.public_employment_type, '')) <> ''$replacement$
  );
  if updated_definition = current_definition
    or updated_definition like '%is_public_job_posting_content_complete%'
    or updated_definition like $pattern$%normalized_filename !~* '\\.pdf$'%$pattern$ then
    raise exception 'public intake validation patterns were not fully replaced';
  end if;
  execute updated_definition;
end;
$$;

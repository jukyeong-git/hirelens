-- New intake is classification-free. Keep historical attestation columns for
-- existing audit history, but write NULL for every legacy attestation field on
-- new reservations so false is not mistaken for a real/test classification.

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
    updated_definition := replace(
      current_definition,
      $needle$byte_size, normalized_sha256, 'PENDING_UPLOAD', false, null, null$needle$,
      $replacement$byte_size, normalized_sha256, 'PENDING_UPLOAD', null, null, null$replacement$
    );

    if updated_definition = current_definition then
      raise exception 'classification-free intake function pattern was not found: %', target_function;
    end if;

    execute updated_definition;
  end loop;
end;
$$;

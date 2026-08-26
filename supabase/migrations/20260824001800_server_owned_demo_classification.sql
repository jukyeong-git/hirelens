-- HL-028 security correction: the synthetic-demo classification is server-owned.
-- Rollback note: retain the classification trigger; correct forward only.

create or replace function public.enforce_synthetic_demo_job_classification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'postgres' then
    if tg_op = 'INSERT' then
      -- All Jobs created through the P0 demo application are synthetic.
      new.is_synthetic_demo := true;
    elsif old.is_synthetic_demo is distinct from new.is_synthetic_demo then
      raise exception 'synthetic demo classification is server-owned' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_server_owned_demo_classification on public.jobs;
create trigger jobs_server_owned_demo_classification
before insert or update on public.jobs
for each row execute function public.enforce_synthetic_demo_job_classification();

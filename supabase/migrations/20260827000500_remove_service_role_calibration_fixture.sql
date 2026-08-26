-- Security forward-fix: deterministic fixture data belongs in seed.sql.
-- A service-role RPC must never provide a path to human observations or
-- decisions, even when all rows are synthetic.

revoke execute on function public.install_criterion_calibration_demo_fixture()
  from public, anon, authenticated, service_role;
drop function public.install_criterion_calibration_demo_fixture();

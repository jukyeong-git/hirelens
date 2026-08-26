-- Security forward-fix: deterministic fixture data belongs in seed.sql.
-- A service-role RPC must never provide a path to human observations or
-- decisions, even when all rows are synthetic.
--
-- 20260827000400 is now inert, so this drop is conditional: it cleans up
-- databases that applied the earlier version of that migration and is a no-op
-- on databases created after this fix.

drop function if exists public.install_criterion_calibration_demo_fixture();

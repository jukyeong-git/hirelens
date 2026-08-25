-- MVP product decision: each Job uses one human-approved Review Framework.
-- Drafts remain editable until approval; approval is final for that Job.
-- Historical version identifiers remain on existing records and processing runs
-- for traceability, but no workflow may create a replacement version.
-- Rollback: restore the RPC only through a forward migration and a new product
-- decision. Existing approved data is not modified by this migration.

drop function if exists public.create_scorecard_revision(
  uuid, integer, public.scorecard_status, text
);

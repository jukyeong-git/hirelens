-- Rows with false plus no actor/timestamp can only have been created by the
-- short-lived classification-free reservation functions from migration 026.
-- Normalize them to NULL so no new intake row carries a content classification.

update public.resume_files
set synthetic_or_anonymized_attested = null
where synthetic_or_anonymized_attested is false
  and attested_by is null
  and attested_at is null;

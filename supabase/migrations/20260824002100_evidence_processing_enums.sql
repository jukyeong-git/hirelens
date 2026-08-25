-- HL-033~035 enum expansion. PostgreSQL requires new enum values to be committed
-- before later migrations use them. Roll back with a forward migration only.

alter type public.processing_run_status add value if not exists 'ANALYZING';
alter type public.processing_run_status add value if not exists 'VALIDATING';
alter type public.processing_run_status add value if not exists 'RETRY_PENDING';
alter type public.processing_run_status add value if not exists 'QUARANTINED';

alter type public.processing_error_category add value if not exists 'AI_TIMEOUT';
alter type public.processing_error_category add value if not exists 'AI_RATE_LIMIT';
alter type public.processing_error_category add value if not exists 'AI_NETWORK_ERROR';
alter type public.processing_error_category add value if not exists 'AI_PROVIDER_ERROR';
alter type public.processing_error_category add value if not exists 'AI_REFUSAL';
alter type public.processing_error_category add value if not exists 'AI_INCOMPLETE';
alter type public.processing_error_category add value if not exists 'AI_SCHEMA_INVALID';
alter type public.processing_error_category add value if not exists 'AI_UNKNOWN_CRITERION';
alter type public.processing_error_category add value if not exists 'AI_INVALID_PAGE';
alter type public.processing_error_category add value if not exists 'AI_QUOTE_MISMATCH';
alter type public.processing_error_category add value if not exists 'AI_BUDGET_EXCEEDED';
alter type public.processing_error_category add value if not exists 'AI_USAGE_INVALID';
alter type public.processing_error_category add value if not exists 'EVIDENCE_PERSISTENCE_FAILED';

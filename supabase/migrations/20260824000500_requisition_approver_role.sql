-- HL-024: add the business approval role before it is referenced by later DDL.
-- Rollback note: PostgreSQL enum labels are not removed automatically. Use a
-- forward migration to retire this role only after all dependent data is gone.

alter type public.app_role add value if not exists 'REQUISITION_APPROVER';

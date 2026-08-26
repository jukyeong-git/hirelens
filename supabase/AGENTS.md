# Supabase Instructions

These instructions extend the repository root `AGENTS.md` for `supabase`.

## Migration rules

- All database changes must be represented by new, committed migrations.
- Never edit an already-applied migration.
- Migrations must work from a clean local reset.
- Add down/rollback notes in the migration comment when automatic rollback is unsafe.
- Do not rely on dashboard-only schema or policy changes.

## RLS rules

- RLS must be enabled for every exposed application table.
- Default to deny.
- `RECRUITER` may access applications for assigned jobs.
- `HIRING_MANAGER` may access only assigned jobs/applications and may create human reviews.
- Only authorized human roles may create decisions.
- Browser clients must never use a Supabase secret key.
- Add SQL tests for allowed and denied paths.

## Storage rules

- Resume buckets are private.
- Access uses short-lived signed URLs or authorized server streaming.
- File paths must use opaque IDs, not names or email addresses.
- Upload type and size must be validated.
- Deletion must remove the file and related derived artifacts according to the retention workflow.

## History rules

- Do not add or restore a generic audit-event table.
- Keep required history in typed domain tables with explicit RLS.
- Human decisions retain actor, reason, timestamp, and supersession linkage.
- Do not copy raw resume text into history or error payloads.

## Seed rules

- Seed data must be synthetic.
- Do not include the confidential challenge PDF or customer identifiers.
- Seed users and resume fixtures must be clearly labeled as demo data.

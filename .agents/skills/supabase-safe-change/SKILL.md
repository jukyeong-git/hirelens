---
name: supabase-safe-change
description: "Make a safe HireLens Supabase schema, migration, RLS, storage, queue, or seed change. Use for DB·RLS·스토리지 변경; requires clean reset and authorization tests."
---

# Supabase Safe Change Workflow

## Steps

1. Read `supabase/AGENTS.md` and `docs/04_DATA_MODEL.md`.
2. Define data and authorization impact.
3. Create a new migration; never edit an applied migration.
4. Enable RLS and use default deny.
5. Add explicit policies for each role.
6. Add indexes and constraints.
7. Keep audit rows append-only.
8. Update synthetic seed data only.
9. Run clean reset.
10. Run allowed and denied authorization tests.

## Secret boundary

- browser uses only the publishable key,
- server/worker secret key is never exposed,
- privileged key does not replace user authorization.

## Required report

- migration name,
- tables/policies changed,
- clean reset result,
- RLS tests,
- rollback or forward-fix note.

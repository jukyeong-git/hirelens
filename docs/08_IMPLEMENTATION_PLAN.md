# Implementation Plan — HireLens MVP

## Guiding principle

Build one vertical slice to completion before adding breadth.

## Phase 0 — Foundation

### Deliverables

- pnpm workspace,
- Next.js web app,
- TypeScript worker,
- shared packages,
- environment validation,
- CI,
- local database start/reset.

### Exit criteria

- `pnpm lint`, `typecheck`, `test`, and `build` exist and pass.
- A blank authenticated shell can run locally.
- Worker starts and performs a no-op health task.
- No product feature or cloud integration is required yet.

## Phase 1 — Data and access

### Deliverables

- P0 migrations,
- roles and demo users,
- RLS,
- private storage,
- audit table,
- deterministic seed/reset.

### Exit criteria

- assigned access works,
- unauthorized access fails in tests,
- browser never receives a secret key,
- audit update/delete is impossible for application roles.

## Phase 2 — Job and scorecard vertical slice

### Deliverables

- job create/list/detail,
- scorecard AI draft adapter,
- ambiguity UI,
- criterion editor,
- approval and version history.

### Exit criteria

- draft cannot analyze resumes,
- approval is human-authored,
- approved version is immutable,
- changing criteria creates a new version.

## Phase 3 — Resume intake

### Deliverables

- multi-file upload,
- private file storage,
- application records,
- queue task,
- progress UI,
- text extraction.

### Exit criteria

- 20 synthetic PDFs can be submitted,
- each file has independent state,
- image-only fixture becomes `NEEDS_OCR`,
- duplicate task does not duplicate the run.

## Phase 4 — Evidence pipeline

### Deliverables

- versioned evidence prompt,
- strict schema,
- Responses API adapter,
- source quote validator,
- evidence persistence,
- quarantine state,
- golden eval command.

### Exit criteria

- every persisted quote matches a source page,
- model output has no decision field,
- invalid output is quarantined,
- evidence contains uncertainty and follow-up question where relevant.

## Phase 5 — Human judgment UI

### Deliverables

- evidence-first candidate list,
- split source/evidence detail,
- 60-second review card,
- decision change history,
- audit timeline.

### Exit criteria

- only human roles write decisions,
- `DO_NOT_PROCEED` requires a reason,
- prior decision remains visible,
- AI result and human decision are visually distinct.

## Phase 6 — Hardening and demo

### Deliverables

- full E2E,
- RLS tests,
- AI eval report,
- error recovery,
- deployed demo,
- demo reset,
- presentation script.

### Exit criteria

All release blockers in the PRD are cleared.

## Suggested implementation tickets

### Foundation

- `HL-001` Initialize workspace and commands
- `HL-002` Add environment schema
- `HL-003` Add CI
- `HL-004` Add local Supabase workflow

### Data

- `HL-010` Add jobs and profiles
- `HL-011` Add scorecard tables
- `HL-012` Add applications and resume files
- `HL-013` Add processing and evidence tables
- `HL-014` Add reviews and audit
- `HL-015` Add RLS and tests

### Scorecard

- `HL-020` Job create/list UI
- `HL-021` Scorecard draft contract
- `HL-022` Ambiguity review UI
- `HL-023` Approval and versioning

### Pipeline

- `HL-030` Batch upload
- `HL-031` Queue contract
- `HL-032` PDF page extraction
- `HL-033` AI evidence contract
- `HL-034` Quote validation
- `HL-035` Retry/quarantine

### Review

- `HL-040` Candidate list
- `HL-041` Evidence/source split view
- `HL-042` Human review card
- `HL-043` Audit timeline

### Quality

- `HL-050` Synthetic golden set
- `HL-051` AI eval runner
- `HL-052` Playwright flow
- `HL-053` Privacy/security review
- `HL-054` Demo seed and reset
- `HL-055` Deployment smoke test

## Scope cut order

If time is short, cut in this order:

1. Slack
2. Calendar
3. email
4. OCR
5. advanced dashboard
6. multi-job templates
7. real platform adapters

Do not cut:

- scorecard approval,
- evidence source validation,
- human-only decision,
- audit trail,
- RLS,
- synthetic data policy.

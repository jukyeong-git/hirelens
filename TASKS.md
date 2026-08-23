# HireLens MVP Backlog

This is the execution checklist. Product behavior is defined in `docs/01_PRD.md`.

## Phase 0 — Repository foundation

- [x] Record accepted product and architecture decisions in `docs/10_DECISIONS.md`.
- [x] Use one hosted Alpha Supabase project for local development and Alpha; retain Docker only for explicit integration tests.
- [x] Configure local environment values for the shared hosted Alpha project outside Git.
- [x] Apply the committed migrations and synthetic seed to the shared hosted Alpha project.
- [x] Initialize pnpm workspace.
- [x] Scaffold `apps/web` with Next.js App Router and strict TypeScript.
- [x] Scaffold `apps/worker` as a long-running TypeScript worker.
- [x] Create `packages/domain`, `packages/ai`, `packages/database`, `packages/pdf`.
- [x] Add shared lint, format, typecheck, test, and build commands.
- [x] Add environment validation and `.env.example`.
- [x] Add CI for lint, typecheck, unit tests, and build.
- [x] Confirm Codex detects custom agents and repo skills.

## Phase 1 — Auth, roles, and data foundation

- [x] Create initial Supabase migrations.
- [x] Add roles: `ADMIN`, `RECRUITER`, `HIRING_MANAGER`.
- [ ] Add the full Admin permission matrix, including initial and changed human decisions.
- [x] Add synthetic demo users.
- [x] Add RLS policies and denial tests.
- [x] Add private `resumes` storage bucket.
- [x] Add append-only `audit_events`.
- [x] Add SCIM-style audit event fields and coverage for all material state-changing actions.
- [x] Enforce that audit events cannot be updated or deleted by any application role, including Admin.
- [ ] Add versioned Recruiter review notes with soft delete and restore history.
- [ ] Add internal notifications and role-based recipients; processing failures notify Admin only in P0.
- [x] Add synthetic demo seed and reset command.

## Phase 2 — Job and scorecard

- [x] Create job form and list.
- [x] Create scorecard draft schema.
- [x] Implement ambiguous phrase detection.
- [x] Implement criterion types: `REQUIRED`, `PREFERRED`, `INTERVIEW_ONLY`.
- [x] Implement HL-022 human ambiguity review and resolution audit path.
- [x] Implement human scorecard approval.
- [x] Implement immutable scorecard versions.
- [x] Block Job intake and expose no analysis-ready version when no approved scorecard exists; Phase 3 enqueue repeats this gate.
- [x] Add unit, integration, and E2E tests.

## Phase 3 — Resume intake and processing

- [ ] Add multi-PDF upload.
- [ ] Add per-file status and progress.
- [ ] Extract page text using PDF.js.
- [ ] Store page text and normalized text hashes.
- [ ] Mark image-only PDFs as `NEEDS_OCR`.
- [ ] Enqueue one idempotent task per application and scorecard version.
- [ ] Add bounded retry and dead-letter/error state.
- [ ] Enforce one retry maximum per application and scorecard version.
- [ ] Add `gpt-5.6-luna` configuration, per-attempt token caps, usage tracking, and demo cost budget gate.
- [ ] Notify Admin in-app after the bounded retry is exhausted.
- [ ] Prove duplicate delivery does not duplicate results.

## Phase 4 — Evidence extraction

- [ ] Define strict evidence JSON schema and Zod contract.
- [ ] Add versioned prompt files.
- [ ] Call OpenAI Responses API with `store: false`.
- [ ] Validate criterion IDs and page bounds.
- [ ] Validate each quote against source page text.
- [ ] Store uncertainty and suggested interview question.
- [ ] Quarantine invalid model output.
- [ ] Add golden AI fixtures and eval command.

## Phase 5 — Human review and audit

- [ ] Build evidence-first candidate list.
- [ ] Build split-view candidate detail page.
- [ ] Build 60-second review card.
- [ ] Require a reason for every initial decision and decision change.
- [ ] Allow decision writes for authenticated `HIRING_MANAGER` and `ADMIN`; deny Recruiter, AI, and worker identities.
- [ ] Record decision change history.
- [ ] Show Recruiter note history separately from AI evidence and human decisions.
- [ ] Show audit timeline.
- [ ] Prove AI processing never writes a human decision.

## Phase 6 — Demo hardening

- [ ] Generate 20 synthetic resumes with controlled evidence cases.
- [ ] Add demo reset and deterministic seed.
- [ ] Add Playwright happy path.
- [ ] Add Playwright retry/error path.
- [ ] Verify Admin-only processing failure notification and responsible-user workflow notifications.
- [ ] Verify demo API cost cap and maximum two attempts per file/version.
- [ ] Run privacy and secret scan.
- [ ] Run AI eval gate.
- [ ] Run build and smoke test on deployed URL.
- [ ] Rehearse `docs/09_DEMO_SCRIPT.md`.
- [ ] Prepare offline fallback screenshots or recorded flow.

## P1 — After the core flow works

- [ ] Slack review request and reminder.
- [ ] Google Calendar free/busy and scheduling.
- [ ] Candidate email notifications.
- [ ] CSV intake adapter.
- [ ] OCR adapter.
- [ ] Basic operational dashboard.

## Explicit non-tasks for the demo

- [ ] Do not build automatic rejection or acceptance.
- [ ] Do not build a global candidate fit score.
- [ ] Do not build face, voice, photo, or personality analysis.
- [ ] Do not build payroll, onboarding, offer, or HRIS features.
- [ ] Do not integrate all recruiting platforms before the vertical slice works.

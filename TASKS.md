# HireLens MVP Backlog

This is the execution checklist. Product behavior is defined in `docs/01_PRD.md`.

## Phase 0 — Repository foundation

- [ ] Initialize pnpm workspace.
- [ ] Scaffold `apps/web` with Next.js App Router and strict TypeScript.
- [ ] Scaffold `apps/worker` as a long-running TypeScript worker.
- [ ] Create `packages/domain`, `packages/ai`, `packages/database`, `packages/pdf`.
- [ ] Add shared lint, format, typecheck, test, and build commands.
- [ ] Add environment validation and `.env.example`.
- [ ] Add CI for lint, typecheck, unit tests, and build.
- [ ] Confirm Codex detects custom agents and repo skills.

## Phase 1 — Auth, roles, and data foundation

- [ ] Create initial Supabase migrations.
- [ ] Add roles: `ADMIN`, `RECRUITER`, `HIRING_MANAGER`.
- [ ] Add synthetic demo users.
- [ ] Add RLS policies and denial tests.
- [ ] Add private `resumes` storage bucket.
- [ ] Add append-only `audit_events`.
- [ ] Add synthetic demo seed and reset command.

## Phase 2 — Job and scorecard

- [ ] Create job form and list.
- [ ] Create scorecard draft schema.
- [ ] Implement ambiguous phrase detection.
- [ ] Implement criterion types: `REQUIRED`, `PREFERRED`, `INTERVIEW_ONLY`.
- [ ] Implement human scorecard approval.
- [ ] Implement immutable scorecard versions.
- [ ] Block analysis when no approved scorecard exists.
- [ ] Add unit, integration, and E2E tests.

## Phase 3 — Resume intake and processing

- [ ] Add multi-PDF upload.
- [ ] Add per-file status and progress.
- [ ] Extract page text using PDF.js.
- [ ] Store page text and normalized text hashes.
- [ ] Mark image-only PDFs as `NEEDS_OCR`.
- [ ] Enqueue one idempotent task per application and scorecard version.
- [ ] Add bounded retry and dead-letter/error state.
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
- [ ] Require reason for `DO_NOT_PROCEED`.
- [ ] Restrict decision writes by role.
- [ ] Record decision change history.
- [ ] Show audit timeline.
- [ ] Prove AI processing never writes a human decision.

## Phase 6 — Demo hardening

- [ ] Generate 20 synthetic resumes with controlled evidence cases.
- [ ] Add demo reset and deterministic seed.
- [ ] Add Playwright happy path.
- [ ] Add Playwright retry/error path.
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

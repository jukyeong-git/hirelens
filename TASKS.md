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
- [x] Add the full Admin permission matrix, including initial and changed human decisions.
- [x] Add synthetic demo users.
- [x] Add RLS policies and denial tests.
- [x] Add private `resumes` storage bucket.
- [x] Add append-only `audit_events`.
- [x] Add SCIM-style audit event fields and coverage for all material state-changing actions (legacy implementation; no longer an active P0 requirement).
- [x] Retain minimal append-only change history without expanding the SCIM-style audit schema.
- [x] Enforce that audit events cannot be updated or deleted by any application role, including Admin.
- [x] Add versioned Recruiter review notes with soft delete and restore history.
- [x] Add internal notifications and role-based recipients; processing failures notify Admin only in P0 (the failure producer is completed with the Phase 3 bounded-retry worker).
- [x] Add synthetic demo seed and reset command.

## Phase 2 — Job and scorecard

- [x] Add `REQUISITION_APPROVER` role, independent Job Requisition approval state, designated business approval/return, and append-only minimal change history (HL-024; Alpha rollback-only pgTAP and authenticated role E2E complete).
- [x] Build the Hiring Manager Requisition workspace: HM-only creation, recruiter and approver assignment, approved-Review Framework handoff gate, and submission UI (HL-025; Alpha rollback-only pgTAP and authenticated role E2E complete).
- [x] Build the designated Requisition Approver queue, required-reason approval/return form, append-only status history UI, and safe audit events (HL-026; Alpha rollback-only pgTAP and authenticated role E2E complete).
- [x] Add Job Posting draft/publish/close state gated by Requisition and Review Framework approval (HL-027; Recruiter default with Admin operational override; `CLOSED` is terminal; Alpha rollback-only pgTAP and authenticated role E2E complete).
- [x] Add HL-028 public careers route, candidate-facing posting editor/preview, and opaque slug (anonymous read projection; no upload).
- [x] Supersede synthetic-only intake: accept valid PDFs without content classification; keep presentation fixtures synthetic.
- [x] Add HL-029 anonymous submission form, private server-side upload flow, and public-route/RLS/E2E tests for submission denial and no internal-data leakage (Alpha rollback-only pgTAP and public E2E complete).
- [x] Create job form and list.
- [x] Add explicit, editable AI Job Requisition/job-description drafting with a
      versioned strict contract, no auto-save, and AI eval coverage.
- [x] Create scorecard draft schema.
- [x] Add a shared structured Review Framework draft editor: manual entry and
      explicit AI proposals fill the unsaved editor; Hiring Manager/Admin save
      explicitly and Recruiter remains read-only.
- [x] Implement ambiguous phrase detection.
- [x] Implement criterion types: `REQUIRED`, `PREFERRED`, `INTERVIEW_ONLY`.
- [x] Implement HL-022 human ambiguity review and resolution audit path.
- [x] Implement human scorecard approval.
- [x] Implement immutable scorecard versions.
- [x] Block Job intake and expose no analysis-ready version when no approved scorecard exists; Phase 3 enqueue repeats this gate.
- [x] Add unit, integration, and E2E tests.

## Phase 3 — Resume intake and processing

- [x] Add multi-PDF upload to private Storage for approved, intake-ready Jobs.
- [x] Add the synthetic Candidate, Application, and Hiring Manager review-assignment foundation used by the Phase 1 review workflow.
- [x] Add per-file `UPLOADED` status and batch upload completion/error feedback.
- [x] Extract page text using PDF.js.
- [x] Store page text and normalized text hashes.
- [x] Mark image-only PDFs as `NEEDS_OCR`.
- [x] Enqueue one idempotent task per application and scorecard version.
- [x] Add bounded retry and terminal failure/quarantine state.
- [x] Enforce one retry maximum per application and scorecard version.
- [x] Add environment-configured model, per-attempt token caps, usage tracking, and demo cost budget gate.
- [x] Notify Admin in-app after the bounded retry is exhausted.
- [x] Prove duplicate delivery does not duplicate results.

## Phase 4 — Evidence extraction

- [x] Define strict evidence JSON schema and Zod contract.
- [x] Add versioned prompt files.
- [x] Call OpenAI Responses API with `store: false`.
- [x] Validate criterion IDs and page bounds.
- [x] Validate each quote against source page text.
- [x] Store uncertainty and suggested interview question.
- [x] Quarantine invalid model output.
- [x] Add golden AI fixtures and eval command.

## Phase 5 — Human review and audit

- [x] Build evidence-first candidate list.
- [x] Build split-view candidate detail page.
- [x] Let a Recruiter request Hiring Manager review without creating an interview or hiring decision.
- [x] Let only the assigned Hiring Manager record `INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED` with a reason; retain its history separately from the final human decision.
- [x] Build 60-second review card.
- [x] Require a reason for every initial decision and decision change.
- [x] Allow decision writes for authenticated `HIRING_MANAGER` and `ADMIN`; deny Recruiter, AI, and worker identities.
- [x] Record decision change history.
- [x] Show Recruiter note history separately from AI evidence and human decisions.
- [x] Show audit timeline.
- [x] Prove AI processing never writes a human decision.

## Phase 6 — Demo hardening

- [x] Generate 20 synthetic resumes with controlled evidence cases.
- [ ] Add demo reset and deterministic seed.
- [ ] Add Playwright happy path.
- [ ] Add Playwright retry/error path.
- [x] Verify Admin-only processing failure notification and responsible-user workflow notifications.
- [x] Verify demo API cost cap and maximum two attempts per file/version.
- [x] Run privacy and secret scan (`pnpm privacy:scan`; also enforced in CI).
- [x] Run AI eval gate.
- [ ] Run build and smoke test on deployed URL.
- [ ] Rehearse `docs/09_DEMO_SCRIPT.md`.
- [x] Prepare offline fallback screenshots with an explicitly labeled, source-validated preprocessed synthetic result.

## P1 — After the core flow works

- [ ] Slack review request and reminder.
- [ ] Google Calendar free/busy and scheduling.
- [ ] Candidate email notifications.
- [ ] CSV intake adapter.
- [ ] OCR adapter.
- [ ] Basic operational dashboard.

## Explicit non-tasks for the demo

- [x] Do not build automatic rejection or acceptance.
- [x] Do not build a global candidate fit score.
- [x] Do not build face, voice, photo, or personality analysis.
- [x] Do not build payroll, onboarding, offer, or HRIS features.
- [x] Do not integrate all recruiting platforms before the vertical slice works.

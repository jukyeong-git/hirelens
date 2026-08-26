# Implementation Plan — HireLens MVP

## Guiding principle

Build one **business-workflow vertical slice** to completion before beginning
the next one. A slice is complete only when its role permissions, state
transitions, UI states, audit behavior, and relevant tests are complete.

This plan is the delivery roadmap. `TASKS.md` is the lower-level execution
checklist.

## Workflow roadmap

| Slice                                       | Business outcome                                              | Depends on | Exit gate                                                                         |
| ------------------------------------------- | ------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| 0. Foundation and safe access               | A synthetic, role-aware demo can run safely                   | —          | Auth, RLS, private Storage, audit, and commands work                              |
| 1. Opening definition and business approval | An approved opening has explicit screening criteria           | Slice 0    | A Requisition Approver approves or returns an HM-authored requisition             |
| 2. Posting and candidate application        | A candidate can apply to an approved opening                  | Slice 1    | A published posting accepts a valid PDF without content classification            |
| 3. Evidence processing and Recruiter triage | Every submitted PDF becomes reviewable or visibly exceptional | Slice 2    | Recruiter can inspect validated evidence and request HM review                    |
| 4. Hiring Manager interview gate            | The right human authorizes interview progression              | Slice 3    | HM records a reasoned `INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED` outcome |
| 5. Final human judgment and record          | Final decision remains human-only and traceable               | Slice 4    | Reasoned decision history and audit timeline are visible                          |
| 6. Criterion calibration core               | Interview evidence diagnoses weak criteria                    | Slice 5    | Confirmed observations produce guarded lineage-based findings                     |
| 7. Demo hardening                           | The complete synthetic flow is reliable live                  | Slices 1–6 | E2E, privacy, AI-eval, retry, reset, and fallback gates pass                      |

## Slice 0 — Foundation and safe access

### Outcome

Synthetic demo users can sign in, authorized access is enforced, and the web
app and Supabase Edge worker can use the hosted Alpha backend without exposing secrets.

### Exit criteria

- roles, synthetic users, RLS, private resume Storage, and append-only audit
  protection are present;
- local web and deployed Edge worker use validated environment variables;
- unauthorized reads and writes are denied in tests; and
- the shared Alpha presentation dataset remains synthetic-only.

## Slice 1 — Opening definition and screening criteria

### Outcome

The Hiring Manager creates a Job Requisition and its initial screening criteria.
The separate `REQUISITION_APPROVER` business workflow is deferred from the MVP;
the human-approved Review Framework is the gate for intake and posting. Admin
operates the system but does not act as a business approver.

### Tickets

- `HL-024` Retain requisition approval structures for future enterprise use;
  keep the role and state machine inactive in the MVP
- `HL-025` Build Hiring Manager requisition workspace and criteria handoff
- `HL-026` Build approval/return work queue and tests for the deferred future slice

### Exit criteria

- requisition approval structures remain available for future use but are not an
  MVP exit gate;
- a requisition includes one approved immutable screening-criteria version;
- the Review Framework approval is the active human gate;
- Recruiter can see approved work but cannot alter approval; and
- UI, RLS, audit, unit, Alpha rollback-only integration, and E2E coverage prove the path.

## Slice 2 — Posting and synthetic application

### Outcome

The Recruiter publishes an approved opening. A candidate can submit only
real application or test material through the public posting.

### Tickets

- `HL-027` Add independent posting state, Recruiter publish/close controls, and Admin operational override
- `HL-028` Add Recruiter public-content editor, candidate preview, and narrow public careers route
- `HL-029` Add private server-side submission and public-route security tests — complete: server-only reservation/finalization RPCs, private Storage write, anonymous candidate form, and Alpha rollback-only authorization coverage

### Exit criteria

- posting state is `DRAFT → PUBLISHED → CLOSED`;
- publishing requires an approved requisition and screening-criteria version;
- publishing requires complete candidate-facing content;
- public users can read only the narrow projection for a published posting and
  cannot access internal data or upload through internal paths;
- a closed posting accepts no application; and
- no public submission creates a decision.

## Slice 3 — Evidence processing and Recruiter triage

### Outcome

Each submitted PDF has an independent processing state. Validated evidence is
available to the Recruiter, who can request Hiring Manager review.

### Tickets

- `HL-030` Batch/public application upload and application registration
- `HL-031` Idempotent queue contract and worker claim
- `HL-032` PDF page extraction, text hashes, and `NEEDS_OCR`
- `HL-033` Versioned OpenAI evidence contract and cost gate
- `HL-034` Quote validation and evidence persistence
- `HL-035` Bounded retry, quarantine, and failure notification
- `HL-036` Supabase Edge queue consumer, fenced leases, Cron/Vault activation,
  and retained Node rollback
- `HL-040` Evidence-first Recruiter list and review-request action

### Exit criteria

- each file reaches a visible review-ready, partial, failed, OCR, or
  quarantined state;
- every saved quote matches its source page;
- AI does not write a review request, interview outcome, or decision; and
- Recruiter requests a specific Hiring Manager review with optional notes kept
  separate from AI evidence.

## Slice 4 — Hiring Manager interview gate

### Outcome

The assigned Hiring Manager reviews Recruiter-routed evidence and makes the
human interview-progression decision.

### Tickets

- `HL-041` Candidate evidence/source split view
- `HL-042` Hiring Manager review outcome and reason form
- `HL-043` Interview-progression history and authorization tests

### Exit criteria

- only the assigned Hiring Manager can record `INTERVIEW`, `HOLD`, or
  `MORE_INFORMATION_REQUIRED`;
- every outcome has a reason and is append-only; and
- the Recruiter can coordinate the next step only after `INTERVIEW`.

Candidate email and interview scheduling are P1 and are deliberately excluded
from this slice.

## Slice 5 — Final human judgment and record

### Outcome

After interview activity outside P0, the authorized human records the final
hiring decision and its reason without overwriting prior history.

### Tickets

- `HL-044` Final human decision card and reason validation
- `HL-045` Decision supersession history and audit timeline

### Exit criteria

- `PROCEED`, `HOLD`, and `DO_NOT_PROCEED` remain distinct from the interview
  outcome;
- AI and worker identities have no decision-write path; and
- prior value, actor, time, and reason remain visible.

## Slice 6 — Criterion calibration core

### Outcome

Confirmed post-interview observations reveal repeated gaps in an approved
Review Framework without changing past evidence or human decisions.

### Tickets

- `FW-0` Restore human-created Review Framework revisions and criterion lineage
- `FW-1` Capture complete criterion-level interview observations with the
  existing final human decision
- `FW-2` Diagnose repeated evidence-to-interview mismatches with deterministic
  SQL thresholds

### Exit criteria

- approved and superseded framework versions remain immutable;
- only an assigned Hiring Manager or Admin can record confirmed observations;
- the final decision remains `PROCEED`, `HOLD`, or `DO_NOT_PROCEED`;
- `FALSE_CLAIM`, `AI_MISREAD`, and unconfirmed observations cannot trigger a
  revision finding; and
- diagnostics never change a criterion, analysis result, or hiring decision.

## Slice 6B — Framework revision learning loop

### Outcome

A review-required criterion finding can produce a transient, finding-bound AI
proposal or a manual revision draft. A human edits and approves the replacement
version, then explicitly requests version-isolated reanalysis and inspects a
v1/v2 evidence comparison.

### Tickets

- `FW-3` Generate and validate a finding-bound revision proposal; retain manual
  revision and no-action paths
- `FW-4` Enqueue idempotent replacement-version runs and compare criterion-level
  evidence by lineage

### Exit criteria

- AI cannot save or approve a revision, and every proposal is linked to an
  active deterministic finding;
- protected-trait language, invalid criterion type transitions, and unbounded
  model usage are rejected;
- only an assigned Hiring Manager or Admin can create, approve, or enqueue a
  replacement version;
- reanalysis creates new processing runs and never mutates interview
  observations, outcomes, or human decisions; and
- comparison shows evidence counts and processing states without scores,
  rankings, or recommendations.

## Slice 7 — Demo hardening

### Tickets

- `HL-050` Synthetic golden set
- `HL-051` AI eval runner
- `HL-052` Workflow E2E and retry/error path
- `HL-053` Privacy/security review
- `HL-054` Deterministic synthetic demo reset
- `HL-055` Deployment smoke test and fallback rehearsal

### Exit criteria

All P0 quality gates in `docs/07_TEST_AND_EVAL_PLAN.md` pass, including the
full workflow from requisition to reasoned human outcome.

## P1 after P0

- Candidate email notifications
- Candidate self-service interview scheduling
- Google Calendar free/busy integration
- Slack reminders
- OCR and external recruiting-platform integrations

## Implementation status — 2026-08-24

- HL-026 and HL-030 through HL-045 are implemented in the workspace.
- FW-0 through FW-2 are implemented: criterion lineage, explicit immutable
  Review Framework revisions, atomic post-interview observations with the
  existing final decision, and deterministic SQL calibration diagnostics.
- Hiring Manager requisition drafting is a separate `/jobs/new` route; the workspace page no longer renders the long creation form inline.
- Internal and public UI copy now uses one concise page title, noun-based section titles, and Korean role/workflow terms; repeated decorative labels and non-operational descriptions are removed while state, authorization, validation, and AI/human boundary messages remain.
- Alpha contains forward migrations through
  `20260827000500_remove_service_role_calibration_fixture.sql`; rollback-only
  pgTAP also covers framework lineage, atomic post-interview observations,
  calibration thresholds, and the absence of worker/service-role decision
  paths.
- HL-050 has a deterministic 20-file synthetic golden set and HL-051 has an
  offline contract eval.
- HL-053 has passed its privacy/secret scan and security review with no
  remaining High or Medium finding.
- The 15 role/public Playwright scenarios pass against the locally served web
  app connected to Alpha. The full state-changing P0 workflow and partial-batch
  retry scenario remain HL-052 release gates.
- Alpha has an idempotent service-role-only preprocessed synthetic evidence
  fixture, and the three fallback screenshots in `docs/demo-fallback/` were
  captured and visually checked.
- HL-052, HL-054, and HL-055 remain release gates: authenticated full-flow
  E2E, guarded hosted-Alpha reseed/reset semantics, deployed smoke test,
  rehearsal, and offline screenshots.
- The internal landing workspace now uses role-specific data projections:
  Recruiters manage their assigned requisitions, newly received applications,
  published postings, and related tasks; Hiring Managers manage assigned
  requisitions, Review Framework approvals, and candidate review requests;
  Admins see the cross-workflow operational summary and processing failures.
  This is a presentation-layer role split on top of existing RLS and does not
  grant any new data access or decision authority.
- P1 remains gated until those P0 release checks pass.

## Scope-cut order

If time is short, preserve Slices 1–5 and cut in this order:

1. Slack
2. Calendar
3. candidate email
4. OCR
5. advanced dashboard
6. multi-job templates
7. real platform adapters

Do not cut approved criteria, source validation, human-only outcomes and
decisions, audit history, RLS, or the synthetic-data policy.

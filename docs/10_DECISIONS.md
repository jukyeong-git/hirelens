# Architecture and Product Decision Log

Use this file for lightweight ADRs. Do not rewrite history; append a new decision that supersedes an old one.

## ADR template

```text
## ADR-XXX — Title

- Status: Proposed | Accepted | Superseded
- Date:
- Decision owner:
- Supersedes:

### Context

### Decision

### Consequences

### Open follow-up
```

## ADR-001 — Final hiring decision is human-only

- Status: Accepted
- Date: Starter
- Decision owner: Product team

### Context

The problem brief explicitly states that final selection and rejection should not be delegated to a machine.

### Decision

Only authenticated human roles can create hiring decisions. Worker and AI service credentials have no decision-write path.

### Consequences

- AI output is evidence, not a verdict.
- E2E and authorization tests must prove this separation.
- No automatic rejection feature is built.

## ADR-002 — Evidence-first UI instead of authoritative fit score

- Status: Accepted
- Date: Starter
- Decision owner: Product team

### Context

A single score hides ambiguity, criteria quality, and missing source support.

### Decision

The primary UI shows criterion statuses, quotes, pages, uncertainty, and questions. A global fit score is out of P0 scope.

### Consequences

- More explainable review.
- List filtering requires criterion-level summaries.
- Demo narrative focuses on evidence coverage.

## ADR-003 — One backend-engineer vertical slice

- Status: Accepted
- Date: Starter
- Decision owner: Product team

### Context

A full ATS or all job families would exceed the demo scope.

### Decision

Build one job flow end-to-end before adding job templates or integrations.

### Consequences

- Faster validation.
- Criteria and fixtures can be controlled.
- Generalization remains future work.

## ADR-004 — Page-aware PDF extraction before AI

- Status: Accepted
- Date: Starter
- Decision owner: Engineering

### Context

The UI must show exact source pages and validate model quotes.

### Decision

Extract and preserve page text before the AI call. Validate every quote against the referenced page.

### Consequences

- Better traceability.
- Image-only PDFs require a separate OCR path.
- Direct whole-file summarization is not the primary P0 path.

## ADR-005 — Web application plus background worker

- Status: Superseded by ADR-030
- Date: Starter
- Decision owner: Engineering

### Context

Batch analysis must not block a browser request and must tolerate partial failures.

### Decision

Use Next.js for web/API boundaries and a separate queue-consuming TypeScript worker.

### Consequences

- Clear processing states and retries.
- One additional deployable service.
- Shared TypeScript contracts reduce drift.

## ADR-006 — Synthetic data only in the demo

- Status: Accepted
- Date: Starter
- Decision owner: Security/Product

### Context

The source material is confidential and resumes contain personal data.

### Decision

Use generated resumes and fake accounts only.

### Consequences

- Demo does not prove production privacy readiness.
- A later pilot requires a separate data and legal review.

## ADR-007 — Admin operational authority with append-only audit

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product team
- Supersedes: None

### Context

The demo requires an Admin to operate the full synthetic environment, correct human records, manage roles, and reset the demo. Broad Admin access must not weaken audit integrity or allow AI/worker identities to make hiring decisions.

### Decision

`ADMIN` may perform all product operations, including creating and changing human decisions, managing users and roles, editing scorecards, retrying or quarantining processing, managing review notes, and resetting the demo.

Every material Admin action and every other privileged or state-changing action creates an append-only audit event. Audit events cannot be updated or deleted by Admin, browser, worker, or application roles.

Audit events use a SCIM-style actor/action/target/result shape and include actor ID and role, action, target type and ID, before/after values when applicable, reason when applicable, UTC timestamp, request/correlation ID, source, and result. Audit payloads never contain raw resume text, secrets, tokens, or signed URLs.

### Consequences

- Admin can repair demo state without direct database intervention.
- Admin-created or changed decisions remain attributable to a human actor and require a reason.
- Database constraints and RLS must enforce audit append-only behavior, not only the UI.
- The audit timeline must distinguish AI/worker events, Recruiter activity, Hiring Manager decisions, and Admin operations.

### Open follow-up

- Define the exact audit event enum and retention policy during the Phase 1 migration.

## ADR-008 — Versioned Recruiter review notes

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product team
- Supersedes: None

### Context

Recruiters need temporary opinions that are separate from the final human decision, while later reviewers must be able to understand how those opinions changed.

### Decision

Recruiters may create, edit, and soft-delete their own temporary review notes. Admins may create, edit, soft-delete, and restore any review note. Hiring Managers may view notes but notes never become an automatic decision.

Each note version is retained. Note create, edit, soft-delete, and restore actions create audit events. Audit events store note and version identifiers rather than note text; note versions are stored in a separate access-controlled table.

### Consequences

- Deleting a note removes it from the active UI without destroying history.
- The UI must separate Recruiter notes from AI evidence and human decisions.
- Note version history needs authorization and privacy tests.

### Open follow-up

- Define whether a Recruiter may edit only their own notes; the demo default is yes, while Admin may manage all notes.

## ADR-009 — Cost-bounded OpenAI evidence processing

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Engineering/Product
- Supersedes: None

### Context

The demo needs a current OpenAI model with Structured Outputs while preventing retries or Admin operations from creating an unbounded API bill.

### Decision

Use `OPENAI_MODEL=gpt-5.6-luna`. Process one application and approved scorecard version per model request. Permit at most one retry after the initial attempt, for a maximum of two attempts per file and scorecard version.

For the demo, cap each attempt at 16,000 input tokens and 4,000 output tokens, and enforce an application-level demo budget gate of approximately $1. Record model ID, prompt/schema versions, token usage, estimated cost, attempt number, and processing run ID without storing resume text in telemetry.

Retry only bounded transient failures such as timeout, network failure, or 5xx. Policy refusals, schema failures, invalid criterion IDs, invalid pages, or fabricated quotes are quarantined rather than retried as network failures.

### Consequences

- The expected maximum model cost for 20 synthetic PDFs plus one scorecard draft is approximately $0.33 under the demo caps; unlimited manual reruns are not part of the bounded demo run.
- Evidence processing must expose `attempt_count`, failure category, and quarantine state.
- A model or prompt change requires the AI regression process in the test plan.

### Open follow-up

- Verify the configured model is available to the deployment account before demo rehearsal.

## ADR-010 — Internal notifications in P0; Slack and email in P1

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product team
- Supersedes: None

### Context

The core demo needs clear ownership of work and processing failures, but external notification integrations add setup and delivery risk.

### Decision

P0 uses in-app notifications and processing-list states only. Processing failures notify Admin only. Normal workflow notifications go to the responsible user: scorecard approval to the Hiring Manager, assignments and review requests to the assigned reviewer, upload/process completion to the responsible Recruiter, and decision-related work to the assigned Hiring Manager.

Slack and email delivery are explicitly P1 and are not required for the P0 demo gate. If added later, their delivery attempts and outcomes become audit events and messages must exclude resume text and PII.

### Consequences

- P0 needs an internal notification model and recipient rules.
- A failed notification must not change the underlying processing or decision state.
- Slack webhook/API and transactional email provider selection are deferred to P1.

### Open follow-up

- Define notification read/unread, deduplication, and retention behavior during the Phase 1 implementation.

## ADR-011 — Recruiter job form and approved scorecard workflow

- Status: Superseded in its Job-authoring portion by ADR-022 and ADR-024
- Date: 2026-08-23
- Decision owner: Product team
- Supersedes: None

### Context

The MVP needs a realistic way to create a backend-engineer opening while keeping public job content separate from internal evidence criteria. Recruiters normally own job intake, while hiring managers define and approve what counts as evidence for the role.

### Decision

Use two linked workflows:

1. **Job form** — Recruiters create and edit a job draft with required title, department, raw job description, recruiter, and hiring manager fields. Location, employment type, openings, start date, and public notes are optional. P0 stores the internal job record and does not publish to external job boards.
2. **Scorecard builder** — The system generates an AI draft from the raw job description and optional Recruiter clarification. Each criterion contains a name, type, definition, accepted evidence, alternative evidence, resume-assessable flag, source phrase, ambiguity note, and optional interview question.

Job states are `DRAFT`, `SCORECARD_PENDING_APPROVAL`, `READY_FOR_INTAKE`, and `ARCHIVED`. Scorecard version states are `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, and `SUPERSEDED`.

An assigned Hiring Manager or Admin may remove an unsubmitted draft from the active workspace. The UI labels this action `삭제`, while the database transitions the job to `ARCHIVED`, hides it from active lists, and appends an audit event. A job with a posting, an application, or a completed hiring request cannot be deleted through this path.

Recruiters may create and edit job drafts and request a scorecard draft. Hiring Managers normally edit and approve scorecards. Admins may perform all operations, including approval override, with an audit event and a reason for the override.

Ambiguous criteria must be resolved, redefined, classified as `INTERVIEW_ONLY`, or excluded before approval. Human qualities that cannot be verified from a resume default to `INTERVIEW_ONLY`. An unresolved ambiguity blocks approval.

Approved scorecards are immutable. Editing an approved scorecard creates a new draft version. Only an approved version may be used for resume analysis. No global fit score or criterion weight is part of this workflow.

### Consequences

- Job authoring and internal evaluation policy remain visibly separate.
- The normal workflow is Recruiter draft → AI scorecard draft → Hiring Manager approval.
- UI must include loading, empty, partial, retryable/fatal error, unauthorized, and stale-version states and remain keyboard accessible.
- Tests must prove draft analysis is blocked, approval is role-controlled, approved versions are immutable, new versions are created on edit, and unresolved ambiguity prevents approval.

### Open follow-up

- Implement `HL-020` through `HL-023` and add the synthetic Backend Engineer job and scorecard fixture.

## ADR-012 — Hosted Supabase projects for development and Alpha

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product/Engineering
- Supersedes: The local Supabase instance as the default application database

### Context

Running the full Supabase stack in Docker makes the developer laptop heavy. The application still needs real Auth, PostgreSQL, Storage, and REST behavior for the job and scorecard work.

### Decision

Use two separate hosted Supabase projects:

1. `hosted-dev` — the database used by a local web/worker session.
2. `hosted-alpha` — the database used by the Alpha deployment.

Both projects receive the same committed migrations. They have separate project refs, publishable keys, server keys, Auth users, Storage buckets, and synthetic seed data. Docker Supabase remains available only for explicit local pgTAP/RLS and clean-reset verification.

`pnpm db:start` must not start Docker for hosted environments. Remote migration application requires an explicit project ref and `SUPABASE_CONFIRM_MIGRATION=YES`. Remote reset is not supported; only the guarded local demo reset may be destructive.

### Consequences

- Normal local development no longer consumes resources from a local Supabase stack.
- A developer can accidentally affect shared hosted-dev data, so all data remains synthetic and hosted-dev writes need normal RLS protection.
- Alpha cannot be refreshed with `db:reset`; use forward migrations and an explicit operational seed/reset workflow later.
- Integration tests retain an isolated local Docker path and are not part of every `pnpm dev` session.

### Open follow-up

- Create the two Supabase projects in the correct organization and region.
- Add local-only environment values without committing keys.
- Apply migrations and synthetic seed to hosted-dev, then separately to hosted-alpha.

## ADR-013 — Shared hosted Alpha backend for local and Alpha

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product/Engineering
- Supersedes: ADR-012

### Context

The current hosted Supabase project has the complete HireLens foundation, migration history, and synthetic demo data. Maintaining a second hosted development project would add setup and data synchronization overhead for the current demo.

### Decision

Use the current hosted Supabase project as the shared backend for both local development and the Alpha deployment. Both environments use the same project ref, URL, keys, Auth users, PostgreSQL database, private Storage bucket, and synthetic seed. `APP_ENV=development` identifies local execution and `APP_ENV=alpha` identifies the Alpha deployment; `SUPABASE_ENV=hosted-alpha` is used in both.

Docker Supabase remains an optional isolated environment for migration and pgTAP tests. Hosted Alpha does not support destructive reset. All local and Alpha data must remain synthetic during the demo.

### Consequences

- Local changes are immediately visible to Alpha and can affect the shared demo state.
- Developers must not run reset commands against the hosted project.
- A later production pilot must create a separate project and data boundary before real applicant data is used.
- Migration history and synthetic seed have one deployment target for this demo.

### Open follow-up

- Add an explicit shared-environment banner and demo reset authorization flow before wider access.

## ADR-026 — Alpha-only database verification

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product/Engineering

### Decision

Local Docker Supabase is not used for development or verification. The local
web, worker, migration checks, and integration checks use the shared hosted
Alpha Supabase project. `pnpm test:integration` runs only the HL-024 and HL-025
pgTAP files through `DATABASE_URL`; each test is wrapped in a transaction and
rolls back its synthetic fixtures. `pnpm db:start` and `pnpm db:reset` are
disabled.

Browser authentication E2E also targets the locally running web app configured
against Alpha. It requires the existing synthetic demo credentials but does
not create a second database or reset Alpha.

### Consequences

- Alpha must remain synthetic-only and migration-compatible with the repository.
- The verification suite cannot prove clean-seed reset or repair a corrupted
  Alpha state; those concerns require an explicitly approved forward migration
  or a separate disposable Supabase project.
- Connection strings and secret keys remain outside Git and are never printed.

## ADR-014 — Admin authority, Recruiter note history, and internal notifications

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product/Engineering
- Refines: ADR-007, ADR-008, ADR-010, ADR-013

### Context

The Phase 1 foundation has roles, RLS, append-only audit events, and a shared hosted Alpha backend. The remaining product decisions need one consistent contract before implementing human decisions, Recruiter notes, and workflow notifications.

### Decision

#### Admin authority

`ADMIN` may view and operate all demo product resources: jobs, scorecards, candidates, applications, resume files and pages, processing runs, evidence, Recruiter notes, notifications, users, and human decisions.

Admin may create the first human decision and change an existing human decision. Every first decision and change requires a non-empty reason and records actor, role, prior value, new value, reason, UTC timestamp, correlation ID, source, and result in an append-only audit event. Admin may change a decision created by Admin, but AI and worker identities never receive a decision-write path.

Admin may manage user roles, except an Admin cannot demote or remove their own account or remove the last remaining Admin. Audit events cannot be edited or deleted by Admin or any other application role. Product records use archive or soft delete where removal is needed; hard deletion is not part of the demo workflow.

The shared hosted Alpha project cannot be physically reset by an Admin or application command. Any future Admin reset must be a scoped, synthetic-fixture reset with explicit confirmation and an audit event. Local Docker is not used for development or verification, and `db:reset` remains disabled.

#### Recruiter temporary notes

Recruiters may create, edit, soft-delete, and restore their own temporary notes. Admins may create, edit, soft-delete, and restore any note. Hiring Managers may read active notes for assigned applications but cannot edit, delete, restore, or view deleted history by default.

Every edit creates a new immutable note version. Delete and restore require a reason and create audit events. The note body is stored in an access-controlled note/version table and is never copied into audit metadata; audit events reference note and version IDs only. Notes remain separate from AI evidence and human decisions, and changing a note never changes a decision.

#### Internal notifications

P0 notifications use the in-app notification center and processing-list status only. Slack and email remain P1.

| Event                                      | Recipient                                   |
| ------------------------------------------ | ------------------------------------------- |
| Scorecard approval request                 | Assigned Hiring Manager                     |
| Job, application, or review assignment     | Assigned responsible user                   |
| Processing completion                      | Responsible Recruiter                       |
| Processing failure after the bounded retry | Admin only                                  |
| Decision-related follow-up                 | Assigned Hiring Manager or responsible user |
| Unassigned operational event               | Admin fallback                              |

Notifications have `unread` and `read` states. Creation is idempotent by recipient, event type, aggregate ID, and relevant version; duplicate deliveries do not create duplicate active notifications. Reading a notification is not an audit event. Failure notifications contain only safe error categories and opaque processing IDs, never resume text, quotes, signed URLs, or other personal data.

### Consequences

- The Admin route is broad but remains attributable and auditable.
- Recruiter notes preserve an editable working opinion without turning it into a hiring decision.
- Human decision, processing state, AI evidence, notes, and notifications remain separate data and UI concepts.
- The shared hosted Alpha environment requires synthetic data discipline and prevents destructive reset.

### Open follow-up

- Implement the permission matrix and decision reason validation.
- Add versioned note tables, RLS, and note history tests.
- Add notification tables, recipient rules, deduplication, and failure-path tests.

## ADR-015 — HL-020 Job draft creation and list workspace

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product/Engineering
- Refines: ADR-011, ADR-013, ADR-014

### Context

The next vertical slice needs a small, role-aware Job workspace that can be demonstrated against the shared hosted Alpha Supabase project. Optional recruiting fields and later scorecard behavior are not required to prove Job creation and assignment.

### Decision

HL-020 includes:

- a Job list showing title, department, status, Recruiter, Hiring Manager, and last updated time;
- a Job draft form requiring title, department, raw job description, Recruiter, and Hiring Manager;
- new Jobs always starting in `DRAFT`;
- Recruiters creating Jobs only for themselves as `recruiter_id`;
- Admin creating Jobs for any valid Recruiter and Hiring Manager;
- Hiring Managers seeing assigned Jobs in read-only mode;
- no status transition, scorecard approval, resume processing, ranking, fit score, or human decision UI in this slice;
- append-only database audit events for Job creation and updates, with no raw job description in audit metadata or list responses.

The Job list uses only a summary projection and does not fetch the raw job description. Job form writes use the authenticated session and RLS; the browser never receives the Supabase secret key.

### Consequences

- HL-021 can consume the stored raw description to create a scorecard draft without changing the HL-020 list contract.
- The current shared Alpha data remains synthetic and is changed through forward migrations only.
- Job edit and state-transition controls remain intentionally deferred until the scorecard contract is implemented.

### Open follow-up

- Add scorecard draft creation and its immutable version contract in HL-021.

## ADR-016 — HL-021 scorecard draft contract

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product/Engineering
- Refines: ADR-011, ADR-015

### Context

HL-021 needs a stable contract between the Job description, the OpenAI draft
response, the database, and the later human approval workflow. The contract
must preserve evidence traceability and prevent an AI-generated draft from
becoming a hiring decision.

### Decision

- The draft contract is versioned as `scorecard-draft-prompt-v1` and
  `scorecard-draft-schema-v1`. It accepts only strict Structured Output fields:
  criteria, criterion type, definition, accepted/alternative evidence,
  evidence fields, resume-assessable flag, source phrase, ambiguity metadata,
  and an optional interview question.
- Ambiguity is explicit. `CLEAR` means no review concern was detected;
  `AMBIGUOUS` means a human must clarify or rewrite the criterion; and
  `HUMAN_ONLY` means the criterion must be verified in an interview and cannot
  be assessed from a resume. `INTERVIEW_ONLY` is a criterion type, not an
  ambiguity status.
- The AI response is draft-only. It cannot contain a fit score, ranking,
  accept/reject/advance decision, or protected-trait inference. The server
  validates the response before persistence and stores the source job
  description SHA-256, prompt version, schema version, and model identifier.
- Recruiters and Admins may request a draft. Hiring Managers can read an
  assigned draft. Human approval and Admin approval override remain in
  HL-023; this slice does not make a scorecard usable for analysis.
- Draft creation is an atomic, security-definer RPC. Direct application
  insert/update/delete access to scorecard versions and criteria is revoked.
  The RPC creates the next immutable version number, writes criteria, moves a
  `DRAFT` Job to `SCORECARD_PENDING_APPROVAL`, and emits safe append-only audit
  metadata without raw Job description text.
- A transient OpenAI network/timeout/HTTP/incomplete response may be retried
  once. Refusals, schema failures, and fabricated source phrases are terminal
  draft-generation errors. Requests use `store: false` and the configured
  `OPENAI_MODEL`.
- A Job cannot transition to `READY_FOR_INTAKE` without an approved scorecard.
  The actual approval transition, approved-version immutability enforcement,
  and analysis-worker gate are completed in HL-023/Phase 3.

### Consequences

- The UI can clearly separate AI draft metadata from human review and later
  human decisions.
- Any prompt/schema/model change requires a new version and the AI contract
  evals must be updated before release.
- Local pgTAP remains the clean-reset verification path; hosted Alpha receives
  the same committed migration and synthetic fixture.

### Open follow-up

- Implement HL-022 ambiguity review editing and HL-023 human approval,
  immutable approved-version changes, audit reasons, and analysis gating.

## ADR-017 — HL-022 human ambiguity review

- Status: Accepted
- Date: 2026-08-23
- Decision owner: Product/Engineering
- Refines: ADR-011, ADR-016

### Context

HL-021 exposes AI-detected ambiguous phrases, but a draft cannot be approved
until a human decides how each phrase should be handled. The review must keep
the original AI signal visible, prevent Recruiter edits, and avoid turning a
human clarification into an automatic hiring decision.

### Decision

- The detail screen links each AI `source_phrase` to its persisted criterion,
  definition, ambiguity reason, current status, evidence fields, and suggested
  interview question.
- The assigned `HIRING_MANAGER` or `ADMIN` may save one of two draft-only
  resolutions: `CLARIFY` or `INTERVIEW_ONLY`. `CLARIFY` requires a human
  definition and may use `REQUIRED` or `PREFERRED`; it sets ambiguity to
  `CLEAR`. `INTERVIEW_ONLY` sets criterion type to `INTERVIEW_ONLY`, forces
  `resume_assessable=false`, and sets ambiguity to `HUMAN_ONLY`.
- Recruiters can see the review state but cannot save a resolution. No
  resolution changes the Job status to ready or permits resume analysis;
  approval remains an explicit HL-023 human action.
- Every save requires a non-empty human reason. The security-definer RPC locks
  the draft version and criterion, compares an expected criterion snapshot,
  rejects stale edits with a retryable conflict, and rejects non-draft or
  cross-Job access.
- The original AI `ambiguous_phrases` array is retained unchanged. The human
  result is stored on the criterion and an append-only
  `SCORECARD_AMBIGUITY_REVIEWED` audit event stores actor role, resolution,
  safe IDs, before/after status/type, reason, correlation ID, and version
  reference. Raw Job description and criterion text are excluded from audit
  metadata.
- The UI distinguishes AI output from human resolution, uses text plus status
  labels rather than color alone, and exposes loading, error, unauthorized,
  and stale-version feedback. Approved-scorecard approval and immutable
  revision creation remain part of HL-023 rather than this slice; a broader
  criterion editor or explicit exclusion control is a later extension.

### Consequences

- Hiring Managers can make ambiguous language reviewable without granting AI
  or Recruiters decision authority.
- A clarified criterion is not automatically approved; it remains in the draft
  workflow until HL-023.
- The RPC is a forward-compatible boundary for later approval/version APIs and
  preserves an audit trail without copying job content.

### Open follow-up

- Completed by ADR-018.

## ADR-018 — HL-023 human approval and immutable scorecard versions

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product/Engineering
- Refines: ADR-011, ADR-016, ADR-017

### Context

AI scorecard drafts and human ambiguity resolutions must not become active
evaluation policy without an explicit human approval. Approved policy also
needs an immutable history while a replacement is prepared.

### Decision

- The assigned `HIRING_MANAGER` or `ADMIN` may approve a `DRAFT`. Recruiters,
  unassigned managers, anonymous users, AI, and worker identities cannot
  approve. The user-facing action is `채용 요청`; it requires all Job
  Description and Evaluation Criteria confirmation items to be acknowledged
  and does not collect a free-text reason.
- Approval is a direct `DRAFT → APPROVED` transition. `PENDING_APPROVAL`
  remains reserved until a distinct submission action and owner are defined.
- Approval is blocked while any criterion is `AMBIGUOUS`. `HUMAN_ONLY` is a
  resolved state only when the criterion is `INTERVIEW_ONLY` and is not
  resume-assessable.
- Approval atomically stores approver and UTC time, sets the Job to
  `READY_FOR_INTAKE`, and appends a safe `SCORECARD_APPROVED` event. If another
  approved version exists, it becomes `SUPERSEDED` in the same transaction.
- Approved and superseded scorecard rows and criteria are immutable. Their
  original approver and approval time remain intact. A partial unique index
  permits at most one active `APPROVED` version per Job.
- A Hiring Manager or Admin creates changes from an approved version through
  `create_scorecard_revision`, with a required reason. It copies the source
  into the next `DRAFT` version with new row IDs. The approved source remains
  active until the replacement is separately approved.
- The UI separates the working draft, active approved version, and immutable
  history. It shows version, approver, approval time, and role-aware actions.
  Stale expected version/status values are rejected and surfaced as reloadable
  conflicts.
- Draft criterion changes increment a `content_revision` token. Approval must
  match the token displayed to the reviewer, preventing unseen concurrent
  criterion edits from being approved. The original Recruiter/Admin draft RPC
  is limited to the first version; replacement drafts use only the reasoned
  Hiring Manager/Admin revision path.
- Job readiness requires an approved scorecard. Phase 3 processing enqueue and
  worker claim must independently require the active approved version and
  preserve the exact version on historical runs.

### Consequences

- AI output cannot activate evaluation policy by itself.
- Preparing a replacement does not interrupt intake against the existing
  approved policy.
- Candidate ranking, final hiring decisions, processing implementation,
  external notifications, and AI prompt/schema changes remain outside HL-023.

### Open follow-up

- Phase 3 must enforce the approved-version gate when creating and claiming a
  processing run.
- A broader criterion editor or explicit criterion exclusion control can be
  added to a revision without changing approved history.

## ADR-019 — HireLens is the evidence-review module in the target process

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team
- Refines: ADR-003, ADR-005, ADR-011

### Context

The Builderthon Judgment Track asks for relief from review-coverage, evidence,
feedback, and decision-record bottlenecks. It does not require recreating the
full enterprise ATS process of requisition approval, job posting, candidate
communication, scheduling, offer, or HRIS administration.

### Decision

HireLens owns the evidence-review portion of the target operating process:
approved Scorecard policy, application evidence processing, Recruiter triage,
reasoned human judgment, and minimal append-only change history. An enterprise ATS or the
manual synthetic-demo flow owns the upstream job/application intake. A future
external integration may receive a human-approved downstream status.

The full process and its gates are defined in
`docs/12_TARGET_OPERATING_PROCESS.md`. Candidate self-service apply and public
job posting are not implied by this decision and remain separate scope
decisions.

### Consequences

- P0 can demonstrate the Judgment Track outcome without claiming to be a
  system of record for requisitions, postings, candidate messaging, scheduling,
  offers, or HRIS.
- Current Recruiter Job creation and managed synthetic PDF upload are manual
  demo adapters, not the enterprise operating claim.
- Future integration work must define source-of-truth identifiers, status
  handoff, and conflict resolution before code is added.

### Open follow-up

- Decide whether the first production-style intake adapter is an external ATS
  import or a candidate self-service application.

## ADR-020 — Remove the SCIM-style audit contract from P0

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team
- Supersedes: The SCIM-style event-shape portion of ADR-007

### Context

The minimal Judgment Track process needs attributable human decisions,
Scorecard approvals, and processing history. It does not need a SCIM-like
actor/action/target/result audit protocol or its further schema expansion.

### Decision

P0 retains minimal append-only change history for material workflow actions,
including a decision's actor, timestamp, required reason, and prior value when
changed. Audit storage remains protected from application update and delete
paths.

SCIM-style audit event fields, their complete event-coverage requirement, and
any work to expose or extend a SCIM-like audit log are removed from P0 scope.
Existing database fields remain in place as legacy implementation detail; they
are not a required P0 user-facing contract and will not be removed through a
destructive rewrite.

### Consequences

- The product retains decision accountability without presenting itself as a
  SCIM/audit platform.
- Future changes need only record the minimal change history needed by the
  workflow, privacy, and human-decision invariants.
- Removing stored legacy fields, if ever desired, requires a separately
  approved migration and retention decision.

## ADR-021 — Synthetic-only requisition, posting, and candidate intake in P0

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team
- Supersedes: The upstream-boundary portion of ADR-019

### Context

The demo needs to show the full path from an approved opening to a submitted
resume, while preserving the synthetic-data-only policy. Candidate direct
submission should demonstrate the product workflow without turning the demo
into a real applicant-data service.

### Decision

P0 includes a minimal Job Requisition workflow, internal Job Posting, and
account-free candidate submission:

- the Hiring Manager creates a requisition;
- the Admin approves or returns it with a required reason;
- the assigned Recruiter publishes or closes a posting only after requisition
  approval and Scorecard approval;
- anonymous candidates may submit only synthetic or explicitly anonymized
  demo data, after an explicit attestation; and
- a new narrow server-side submission path creates private resume storage and
  an internal application without revealing internal identifiers.

The existing internal Recruiter/Admin batch upload remains a demo-operations
path. HireLens does not accept real applicant data, send candidate messages,
post to external job boards, schedule interviews, make offers, or perform
budget/HRIS approval in P0.

### Consequences

- Requisition, Posting, Scorecard, Processing, and Decision states must remain
  separate state machines.
- Existing internal upload RPCs and Storage RLS must not be made anonymous.
- Public posting routes require narrow projections and dedicated RLS/E2E tests.
- A later real-data pilot needs separate privacy, retention, deletion,
  withdrawal, abuse-control, and operational approvals.

## ADR-022 — Business-owned requisition approval and Hiring Manager interview gate

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team
- Supersedes: the Job-authoring portion of ADR-011 and the requisition-approval
  portion of ADR-021

### Context

HireLens needs a workflow consistent with normal ATS accountability without
turning a system administrator into a business approver or letting an AI make
an interview decision. Recruiter triage should prepare a decision, not replace
the Hiring Manager's role-specific review.

### Decision

- The Hiring Manager creates the Job Requisition and the initial versioned
  screening criteria (currently called Scorecard in implementation).
- A designated `REQUISITION_APPROVER`, such as an organizational leader,
  budget owner, or HRBP, approves or returns the submitted requisition with a
  required reason. `ADMIN` is not in this business-approval path.
- Self-approval is prohibited. Only the assigned Hiring Manager may resubmit a
  returned requisition, and the designated approver may change only while the
  requisition is `DRAFT` or `RETURNED`; it cannot change while pending.
- The Recruiter prepares and publishes the posting after requisition and
  screening-criteria approval, performs evidence-based triage, and can request
  a Hiring Manager review.
- The assigned Hiring Manager alone records the resulting interview-progression
  outcome: `INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED`, with a required
  reason. This outcome is separate from the final human hiring decision.
- AI and worker identities may provide validated criterion-level evidence only;
  they cannot request, approve, imply, or save an interview outcome.
- Candidate email and interview scheduling remain P1. In P0 a Recruiter may
  only see the authorized handoff state.

### Consequences

- Add the `REQUISITION_APPROVER` role, requisition-approval state machine, and
  authorization/RLS tests in the requisition slice.
- Preserve separate state histories for requisition approval, screening
  criteria, processing, Hiring Manager interview-progression review, and final
  human decision.
- The UI must label the AI evidence, Recruiter review request, and Hiring
  Manager outcome separately so a user cannot mistake one for another.

## ADR-023 — `Review Framework` replaces `Scorecard` as the internal concept

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team

### Context

`Scorecard` is a common ATS term, but it suggests a numerical score, ranking,
or automated pass/fail outcome. HireLens instead keeps a versioned set of
criteria, evidence definitions, resume-assessability rules, and human approval
history. Its user-facing term is `지원서 평가 기준`.

### Decision

The internal product concept is `Review Framework` and its user-facing label is
`지원서 평가 기준`. An AI may explicitly propose a draft Review Framework; a
human must resolve ambiguity and approve a version before it affects resume
analysis.

Existing database objects, RPCs, TypeScript types, and historical records that
use `scorecard` remain compatible legacy identifiers. They will be renamed only
through a separately planned, forward-only compatibility migration after the
P0 workflow is stable.

### Consequences

- New product documentation and UI use `Review Framework` or `지원서 평가 기준`.
- No AI output is represented as a score, rank, recommendation, or decision.
- A future terminology migration must preserve version IDs, RLS, immutable
  history, AI prompt/schema version references, and existing integrations.

## ADR-024 — Explicit AI Job Requisition drafting before human save

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team

### Context

Hiring Managers need a faster way to turn a role title and hiring need into a
first Job Requisition description. This assistance must not obscure who owns
the requisition, introduce discriminatory or invented policy language, or allow
AI to change a workflow state.

### Decision

An authenticated Hiring Manager may explicitly request an AI-generated Job
Requisition/job-description draft after entering title and department. The
result contains exactly four editable sections—역할 개요, 주요 책임, 자격 요건,
and 우대 사항—and is visibly labeled AI-generated,
editable, and transient. Only the existing explicit `Job 초안 저장` action
persists a requisition and creates the existing human-authored audit event.

The AI contract is distinct from `Review Framework` drafting and returns only a
strict `JOB_REQUISITION_DRAFT` object containing `raw_job_description`. It uses
the configured server-only model, `store: false`, versioned prompt/schema, and
bounded failure handling. It must not generate a recruiter, approver, status,
scorecard, candidate rank, decision, compensation, legal or eligibility term,
company-policy commitment, or protected-trait preference.

### Consequences

- Requisition generation never automatically saves, submits, approves,
  returns, publishes, assigns people, or changes a candidate decision.
- Invalid, incomplete, refused, or failed generation leaves the form and all
  persistence unchanged; no raw prompt or output is written to application logs
  or audit metadata.
- Human review and approval of the separate `Review Framework` remain required
  before resume analysis.

## ADR-025 — Review Framework draft editor separates generation from save

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team

### Decision

Only the assigned Hiring Manager or an Admin may create and save the initial
Review Framework draft. They can start from a blank structured editor or ask
AI to propose content. AI output fills that same editor but is never persisted
automatically; the person must explicitly save the edited form before the
existing ambiguity-review, approval, immutable-version, and audit path starts.
Recruiters are read-only for Review Framework creation and approval.

Editing an already saved draft does not ask for or store a free-text change
reason. The append-only audit event records the actor, time, version, content
revision, and before/after criterion counts. The final draft activation action
is labeled `채용 요청`; it also does not collect a free-text reason and records
the actor, time, version, and state transition.

AI-generated confirmation items are split into Job Description and Evaluation
Criteria scopes. The assigned Hiring Manager or Admin confirms each item
individually. Confirmed items leave the outstanding list but remain preserved
in the AI source metadata and append-only audit trail. `채용 요청` is blocked
until every outstanding item in both scopes is confirmed. Editing the draft
resets all prior confirmations so changed content must be reviewed again.

### Consequences

- The structured form records criteria, evidence definitions, resume
  assessability, and suggested interview questions without introducing a global
  fit score or hiring verdict.
- A saved manual draft is recorded with explicit human-authored provenance. A
  saved AI-assisted, human-edited draft retains its signed generation model,
  prompt, and schema provenance rather than false human metadata.
- This does not alter the approval gate: only an approved version can drive
  resume evidence analysis.

## ADR-027 — Recruiter-owned posting with Admin operational override

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team

### Decision

Job Posting is an independent operational aggregate. The assigned Recruiter is
the default operator for creating a posting draft, publishing it, and closing
it. Admin may perform the same operations only as a system-operations override;
Admin is not a Requisition business approver.

A posting moves only `DRAFT → PUBLISHED → CLOSED`. `CLOSED` is terminal for
P0: reopening is not supported, and a later hiring need uses a new posting.
Publishing requires an approved Requisition and an approved immutable Review
Framework version. Closing needs no free-text reason in P0. Every posting
transition is human-operated and creates append-only status history plus safe
audit metadata.

### Consequences

- Posting status never reuses Job intake, Requisition, Review Framework,
  candidate-processing, interview, or final-decision state.
- No AI or worker identity can create, publish, close, or reopen a posting.
- HL-027 remains internal only. The narrow anonymous projection, candidate
  attestation, and public submission route are deferred to HL-028/HL-029.

## ADR-028 — Candidate-facing posting content is a separate public projection

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team

### Context

The internal Requisition contains source material and operational fields that
must not be exposed to an anonymous candidate. Workday-style posting uses a
candidate-facing template and lifecycle rather than publishing the entire
internal record.

### Decision

HL-028 stores complete candidate-facing posting content on the Job Posting
aggregate: `public_slug`, `public_title`, `public_summary`,
`public_responsibilities`, `public_requirements`, `public_location`, and
`public_employment_type`. The slug is opaque and immutable. Recruiter is the
default editor and Admin is an operational exception; neither role may edit a
closed posting.

Only a `PUBLISHED` posting is returned by the anonymous
`get_public_job_posting` projection. The projection returns no Job/Requisition
ID, internal description, users, Review Framework, candidates, files,
processing state, evidence, or decisions. HL-028 provides the public page and
synthetic-data notice. Anonymous submission, attestation persistence, and
private upload remain HL-029.

Public projection eligibility also requires the Job's explicit
`is_synthetic_demo = true` classification. The notice is not the enforcement
mechanism; the publication RPC and anonymous projection enforce the boundary.

### Consequences

- Publication is blocked until both approval gates and all public fields are
  complete.
- Public content changes are authenticated, role-checked, and safely audited.
- A public URL remains stable once issued; corrections use a forward update to
  the content, not slug replacement.

## ADR-029 — Classification-free resume intake

- Status: Accepted
- Date: 2026-08-24
- Decision owner: Product team
- Supersedes: the synthetic-only intake and attestation portions of ADR-006,
  ADR-021, and ADR-028

### Decision

HireLens presentations, seed/reset data, committed fixtures, and fallback
artifacts remain synthetic. Runtime intake accepts technically valid PDFs
without asking, storing, or inferring whether their content is real, test,
synthetic, or anonymized.

Private Storage, opaque paths, PDF type/size/signature checks, access control,
safe audit metadata, AI `store: false`, evidence validation, and human-only
decisions remain mandatory. Historical synthetic attestations are preserved;
new real submissions are never falsely marked as synthetic.

### Consequences

- Synthetic-only warnings, classification controls, and synthetic attestation
  gates are removed from public and internal intake.
- The shared Alpha presentation dataset remains synthetic even though the code
  path can accept real resumes.
- Privacy notice ownership, retention/deletion/withdrawal, abuse controls,
  provider review, and production environment separation remain release risks
  and `TBD`; this decision alone does not establish production legal readiness.

## ADR-030 — Supabase Edge Function evidence consumer

- Status: Accepted
- Date: 2026-08-25
- Decision owner: Product/Engineering
- Supersedes: ADR-005's long-running Node deployment choice; the asynchronous
  queue boundary itself remains accepted

### Decision

Use a secret-protected Supabase Edge Function, invoked every minute by
Vault-backed `pg_cron`/`pg_net`, as the P0 `resume_analysis` queue consumer.
Each invocation reads at most one message. Processing uses a database lease and
fenced service-role RPCs with a periodic heartbeat; a message is archived only after a durable terminal
state, explicit retry handoff, or safe malformed-message quarantine.

The existing Node processor remains a rollback path until deployed Alpha proves
PDF.js bundle, CPU, memory, duration, retry, and 20-file partial-batch behavior.
Node polling and Edge Cron must never consume the same queue concurrently. A
singleton database consumer-mode gate enforces this rule at dequeue time.

### Consequences

- Alpha no longer requires Railway or another always-on Worker host.
- Forced Edge termination is recoverable through an expiring lease and still
  obeys the two-attempt maximum.
- The AI prompt, Structured Output schema, source validation, model version,
  and human-only decision boundary are unchanged.
- Edge runtime limits remain a release gate; failed Alpha smoke testing causes
  a rollback to the retained Node entrypoint rather than silent degradation.

## ADR-024 — Defer Requisition Approver from the MVP

- Status: Accepted
- Date: 2026-08-25
- Decision owner: Product team

The MVP keeps the requisition-approval tables, state enum, history, and legacy
RPCs for future enterprise approval requirements, but removes the
`REQUISITION_APPROVER` role from the active product flow. Hiring Manager creates
and saves the requisition; human approval of the Review Framework moves the Job
to `READY_FOR_INTAKE`. Posting and resume intake do not depend on the dormant
requisition status.

The role is not deleted from the database because that would be a destructive
compatibility change. It is denied an active workspace and detail flow in the
MVP, and the former approval queue is not presented to users.

## ADR-031 — Review Framework as the primary evidence-analysis contract

- Status: Accepted
- Date: 2026-08-25
- Decision owner: Product team

### Decision

The approved immutable Review Framework is the primary input for resume
evidence analysis. The job description is supporting context and cannot create
or silently expand evaluation criteria. Each resume-assessable criterion stores
its name, importance/type, definition, accepted evidence, optional alternative
evidence, optional partial-evidence guidance, and named extraction fields.

The authoring UI offers `직접 작성` and `AI 초안`, but both populate the same
editable unsaved form. A human explicitly saves, resolves ambiguity, and
approves the framework before analysis. AI generation never saves or approves
it.

### Consequences

- Evidence extraction returns criterion-level evidence states and source
  traceability only.
- `REQUIRED` describes importance; it is not an automatic knockout rule.
- No authoritative total score, automatic ranking, automatic filtering,
  acceptance, rejection, or advancement is introduced.
- Evidence prompt/schema versions advance to v2 so partial-evidence guidance
  and extraction fields are traceable inputs.

## ADR-032 — One final Review Framework per Job

- Status: Accepted
- Date: 2026-08-25
- Decision owner: Product team
- Supersedes: the replacement-version workflow in ADR-018

### Decision

Each Job uses one Review Framework. The assigned Hiring Manager or Admin may
edit the saved draft until approval. Approval permanently locks the framework
for that Job; the MVP provides no replacement draft, reapproval, or visible
version-history workflow. All applications received for the Job are analyzed
against that single approved framework.

Internal identifiers remain on the approved framework and processing records
only to reproduce which contract an analysis used. They are not presented as a
user-managed version history. Existing records are preserved rather than
destructively rewritten.

### Consequences

- The `create_scorecard_revision` RPC and all UI/server entry points are removed.
- The Review Framework history panel and version labels are removed from the UI.
- A changed hiring need requires a new Job rather than changing the approved
  criteria for applicants already entering the current Job.
- AI remains draft-only and the human approval gate remains unchanged.

## ADR-033 — Editable Job basic information before hiring request

- Status: Accepted
- Date: 2026-08-26
- Decision owner: Product team

The assigned Hiring Manager or Admin may edit the Job title, department,
Recruiter, job description, and internal request reason until the Review
Framework is approved. The Hiring Manager assignment remains fixed. The UI
uses the same explicit `수정` → `저장` interaction as the Review Framework.

A job-description change removes description confirmation items derived from
the prior text, clears prior confirmations, updates the source hash, and
advances the draft Review Framework revision. Approved, intake-ready, and
archived Jobs remain immutable. The update is concurrency checked and audited
without storing raw job-description or request-reason text in audit payloads.

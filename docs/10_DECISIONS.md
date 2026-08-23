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

- Status: Accepted
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

- Status: Accepted
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

The shared hosted Alpha project cannot be physically reset by an Admin or application command. Any future Admin reset must be a scoped, synthetic-fixture reset with explicit confirmation and an audit event; `db:reset` remains limited to the isolated local Docker test environment.

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
  approve. Every approval requires a non-empty human reason.
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

# Data Model — HireLens MVP

This document defines the conceptual P0 model. SQL migrations remain the executable source of truth once implemented.

## Terminology

The versioned evaluation-policy aggregate is called **Review Framework** in the
product and `지원서 검토 기준` in the user interface. Existing schema names such
as `scorecard_versions` and `criteria` are legacy implementation identifiers;
they retain the same Review Framework meaning until a separately approved
forward-only compatibility migration replaces them.

## 1. Core enums

### Roles

```text
ADMIN
RECRUITER
HIRING_MANAGER
REQUISITION_APPROVER
```

### Requisition status

```text
DRAFT
PENDING_APPROVAL
APPROVED
RETURNED
```

### Posting status

```text
DRAFT
PUBLISHED
CLOSED
```

### Review Framework status (`scorecard_status` legacy enum)

```text
DRAFT
PENDING_APPROVAL
APPROVED
SUPERSEDED
```

### Criterion type

```text
REQUIRED
PREFERRED
INTERVIEW_ONLY
```

### Processing status

```text
UPLOADED
QUEUED
EXTRACTING
ANALYZING
VALIDATING
COMPLETED
NEEDS_OCR
RETRY_PENDING
FAILED
QUARANTINED
```

### Evidence status

```text
SUPPORTED
PARTIAL
NOT_FOUND
CONTRADICTED
HUMAN_ONLY
```

### Human decision

```text
PROCEED
HOLD
DO_NOT_PROCEED
```

### Hiring Manager review outcome

```text
INTERVIEW
HOLD
MORE_INFORMATION_REQUIRED
```

### Review confidence

```text
HIGH
MEDIUM
LOW
```

## 2. Tables

### `profiles`

- `id`
- `display_name`
- `role`
- `created_at`

Do not use real personal profiles in seed data.

For the HL-020 Job workspace, Admin can read all profiles, Recruiters can read
Hiring Manager profiles for assignment, and authorized Job participants can read
the other participant profile needed to render the list. Browser access remains
publishable-key plus authenticated-session only.

For HL-025, a Hiring Manager may read the display name and role of
`REQUISITION_APPROVER` profiles solely to designate an approver. This does not
grant access to any requisition, scorecard, candidate, resume, or evidence data.

### `jobs`

- `id`
- `title`
- `department`
- `raw_job_description`
- `requisition_status`
- `recruiter_id`
- `hiring_manager_id`
- `requisition_approver_id`
- `is_synthetic_demo` (explicit public-demo classification)
- `submitted_at`
- `approval_reason`
- `approved_or_returned_at`
- `created_at`
- `updated_at`

`jobs` is the implementation's current name for the Job Requisition aggregate.
The requisition, screening-criteria, and posting states are independent.

### `job_postings`

- `id`
- `job_id` (one posting aggregate per Job Requisition in P0)
- `status` (`DRAFT`, `PUBLISHED`, `CLOSED`)
- `public_slug` (opaque, immutable public URL identifier)
- `public_title`, `public_summary`
- `public_responsibilities`, `public_requirements`
- `public_location`, `public_employment_type`
- `created_by`
- `published_by`, `published_at`
- `closed_by`, `closed_at`
- `created_at`, `updated_at`

The assigned Recruiter creates, publishes, and closes the posting; Admin has an
operational override. Posting is never a Requisition approval action. A posting
may publish only after its Requisition and an immutable Review Framework version
are approved. `CLOSED` is terminal in P0. Only Jobs explicitly classified as
synthetic demo data can be published to the public projection. There is no anonymous table access in
HL-027. The public fields are candidate-facing content and must not copy the
internal `raw_job_description` implicitly. HL-028 exposes only a separately
approved narrow projection through `/careers/[slug]`; HL-029 owns candidate
submission and private upload.

### `job_posting_status_history`

Each status transition records `actor_id`, `actor_role`, `prior_status`,
`new_status`, and `created_at` in an append-only history. Safe audit events
retain IDs and state changes only, with no job-description, candidate, resume,
or free-text content.

### `requisition_status_history`

- `id`
- `job_id`
- `actor_id`
- `actor_role`
- `prior_status`
- `new_status`
- `reason`
- `created_at`

This is an append-only business-approval history. Only the assigned Hiring
Manager may append `DRAFT` or `RETURNED` to `PENDING_APPROVAL`; only the
designated `REQUISITION_APPROVER` may append `PENDING_APPROVAL` to `APPROVED`
or `RETURNED`, with a bounded human-written reason. Self-approval is prohibited;
the Hiring Manager may change the approver only in `DRAFT` or `RETURNED`, and
may resubmit only after return. It is separate from
Scorecard approval history and does not grant the approver scorecard,
application, resume, or evidence access.

Approver designation or replacement is recorded separately as an append-only
job audit event with the assigning actor and prior/new approver IDs. A former
approver may retain read access only to status-history rows they personally
acted on; this does not restore access to the requisition, scorecard, or
candidate data. Submission, approval, and return create additional safe audit
events containing only the status transition; the free-text business reason is
not duplicated into `audit_events`.

### `scorecard_versions`

- `id`
- `job_id`
- `version_number`
- `status`
- `source_job_description_hash`
- `prompt_version`
- `schema_version`
- `model_id`
- `ambiguous_phrases`
- `created_by`
- `approved_by`
- `approved_at`
- `content_revision`
- `created_at`

`ambiguous_phrases` stores only structured review metadata: the original source
phrase when available, why it is ambiguous, the `CLEAR`, `AMBIGUOUS`, or
`HUMAN_ONLY` status, and an optional interview question. It does not store a
model verdict or a hiring decision.

Invariant: `(job_id, version_number)` is unique and a draft is never used for
resume analysis. Only an approved version may be consumed by the processing
pipeline.

Invariant: an approved version cannot be updated.

### `criteria`

- `id`
- `scorecard_version_id`
- `name`
- `type`
- `definition`
- `accepted_evidence`
- `alternative_evidence`
- `evidence_fields`
- `resume_assessable`
- `source_phrase`
- `ambiguity_note`
- `ambiguity_status`
- `suggested_interview_question`
- `display_order`
- `created_at`

`accepted_evidence`, `alternative_evidence`, and `evidence_fields` are
structured JSON arrays validated by the shared Zod contract and the database
boundary. `INTERVIEW_ONLY` and `HUMAN_ONLY` criteria cannot be marked as
resume-assessable. A criterion marked resume-assessable must include accepted
evidence.

For the initial Review Framework version, only the assigned Hiring Manager or
an Admin may use the atomic `create_scorecard_draft` RPC. They may save either
a structured manual draft or an AI proposal that they have reviewed and edited;
an AI generation request itself never calls this RPC. Manual snapshots use the
explicit legacy metadata sentinels `human-authored`,
`review-framework-manual-v1`, and `HUMAN_AUTHORED`; a saved AI-assisted draft
retains the authenticated generation's actual model, prompt, and schema
versions. Direct application writes to scorecard versions and criteria are
revoked. Recruiters and other assigned participants may read the result through
RLS but cannot create or save this initial version. The RPC validates the full
structured draft contract again at the database boundary.

For HL-022, only the assigned Hiring Manager or Admin may resolve a non-`CLEAR`
criterion through the `review_scorecard_ambiguity` RPC. A clarification changes
the criterion to `CLEAR`; an interview-only resolution changes its type to
`INTERVIEW_ONLY`, sets `resume_assessable` to false, and uses `HUMAN_ONLY` for
the ambiguity status. The RPC accepts an expected criterion snapshot and
rejects stale edits. It retains the original AI `ambiguous_phrases` metadata
and writes a safe before/after audit event with the human reason.

For HL-023, the assigned Hiring Manager or Admin approves a `DRAFT` through
the atomic `approve_scorecard` RPC. Every approval requires a reason and is
blocked while any criterion remains `AMBIGUOUS`. Approval sets the Job to
`READY_FOR_INTAKE`; when a replacement draft is approved, the prior active
version becomes `SUPERSEDED` while retaining its original approver and time.
There is at most one active `APPROVED` version per Job.

`content_revision` is a positive concurrency token incremented whenever draft
criteria change. Approval compares the value shown to the reviewer with the
locked database value so a criterion changed after page load cannot be
silently approved. The original `create_scorecard_draft` entry point is
initial-only; after any version exists, subsequent drafts must use the
reasoned Hiring Manager/Admin revision workflow.

Approved and superseded versions and their criteria are immutable at the
database boundary. `create_scorecard_revision` copies an active approved
version into the next `DRAFT` version without changing the source. The source
remains active for analysis until the replacement draft is explicitly
approved. New processing may use only the active `APPROVED` version; future
processing tables must retain the exact historical version reference after
supersession.

### `candidates`

- `id`
- `demo_label`
- `created_at`

For P0, avoid duplicating raw name/email fields unless required for the demo. Use a synthetic label.

### Evidence processing additions

`processing_runs` advances independently from the human workflow through
`QUEUED → EXTRACTING → ANALYZING → VALIDATING → COMPLETED`, with explicit
`RETRY_PENDING`, `NEEDS_OCR`, `FAILED`, and `QUARANTINED` alternatives.
Its idempotency key binds application, file, approved Review Framework version,
and pipeline version. It stores model/prompt/schema identifiers, bounded token
usage, estimated micro-USD cost, and a safe error category without raw resume
text. Edge processing also stores a short-lived `lease_token` and
`lease_expires_at`. Every worker RPC is fenced by that token, and a periodic
heartbeat extends only the currently owned unexpired lease. Expired active
runs become the one allowed retry or a terminal Admin-visible failure, so an
Edge runtime shutdown cannot leave a run permanently active. The singleton
`evidence_consumer_control` row selects `NODE` or `EDGE`; dequeue rejects the
inactive runtime so rollback and Edge consumers cannot race.

`evidence_items` stores one criterion result and zero or more source rows.
`NOT_FOUND` and `HUMAN_ONLY` use a source-free row. Evidence-bearing statuses
retain the exact quote, source page, quote hash, and page hash. Browser roles
have read-only RLS access through the assigned application; only worker RPCs
can persist validated rows.

`evidence_queue_quarantine` stores only queue message ID, payload SHA-256, and
a bounded safe reason for malformed or unknown queue messages. It stores no
resume text and exposes no browser policy. Queue messages are archived only
after a durable terminal state, retry handoff, or quarantine record exists.

`interview_progression_reviews` is append-only and distinct from
`human_reviews`. A Recruiter review request creates an active
`review_assignments` row; only the assigned Hiring Manager may append
`INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED` with a reason.

### `applications`

- `id`
- `candidate_id`
- `job_id`
- `source`
- `submitted_at`
- `workflow_state`
- `created_at`

Invariant: one candidate may have one application per job in the demo. Public
candidate submission uses the source value `PUBLIC_POSTING`; it creates a
synthetic candidate label server-side and does not retain candidate identity
fields. Production duplicate resolution is deferred.

### `resume_files`

- `id`
- `application_id`
- `storage_path`
- `original_filename`
- `mime_type`
- `byte_size`
- `sha256`
- `synthetic_or_anonymized_attested` (nullable legacy history; new intake does not request this attestation)
- `attested_by` (nullable legacy history)
- `attested_at` (nullable legacy history)

HL-029 derives the opaque Storage path from the published posting's internal
Job ID and generated application/file IDs in a server-only RPC. Anonymous
users receive no direct table or Storage grants; the web server writes the
private object using its secret key and returns no application, file, path, or
processing identifiers.

New intake does not ask for, infer, or persist a real-versus-test content
classification. Existing synthetic attestation values remain historical and
must not be rewritten or treated as a classification for later files.

- `intake_status`
- `created_at`

Storage path uses opaque IDs. Do not embed names or emails.

For the first intake slice, `intake_status` is `UPLOADED` only: the object and
durable metadata exist, but queueing, PDF extraction, and AI processing have
not started. The existing 10 MiB bucket limit is a demo technical limit;
customer file-size policy remains TBD. Original filenames are restricted
application metadata and never copied into audit payloads.

### `resume_pages`

- `id`
- `resume_file_id`
- `page_number`
- `raw_text`
- `normalized_text`
- `normalized_text_hash`
- `created_at`

`raw_text` is sensitive even in a demo. Access is role-restricted and it must not be copied into logs or audit payloads.

### `processing_runs`

- `id`
- `application_id`
- `resume_file_id`
- `scorecard_version_id`
- `pipeline_version`
- `prompt_version`
- `schema_version`
- `model_id`
- `status`
- `attempt_number`
- `idempotency_key`
- `error_category`
- `error_detail_safe`
- `started_at`
- `completed_at`
- `created_at`

Invariant: idempotency key is unique for the active intended run.

### `evidence_items`

- `id`
- `processing_run_id`
- `criterion_id`
- `status`
- `resume_page_id`
- `exact_quote`
- `interpretation`
- `uncertainty`
- `suggested_interview_question`
- `source_quote_hash`
- `created_at`

Rules:

- `SUPPORTED`, `PARTIAL`, and `CONTRADICTED` normally require a valid page and quote.
- `NOT_FOUND` must not fabricate a quote.
- `HUMAN_ONLY` must not contain an AI capability judgment.
- Exact quote must pass server-side source validation before insert.

### `review_assignments`

- `id`
- `application_id`
- `assigned_to`
- `assigned_by`
- `due_at`
- `status`
- `created_at`
- `completed_at`

For the initial demo, a Hiring Manager needs an active assignment for the
application and must also be the Job's assigned Hiring Manager to write an
interview-progression outcome. Recruiters can create the review assignment but
cannot write an outcome or a human hiring decision. Admin may inspect all demo
data, but does not participate in requisition business approval or write a
Hiring Manager interview-progression outcome.

### `hiring_manager_review_outcomes`

- `id`
- `application_id`
- `review_assignment_id`
- `hiring_manager_id`
- `outcome` (`INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED`)
- `reason_detail`
- `created_at`
- `supersedes_outcome_id`

This append-only table records the Hiring Manager's decision about whether to
start an interview. It is separate from `human_reviews`, which records the
later human hiring decision. A change appends a row referencing the prior
outcome.

### `human_reviews`

- `id`
- `application_id`
- `scorecard_version_id`
- `reviewer_id`
- `decision`
- `reason_code`
- `reason_detail`
- `confidence`
- `note`
- `created_at`
- `supersedes_review_id`

A changed decision appends a new row and references the prior review.

Every initial decision and every changed decision requires both a bounded
reason code and non-empty human-written detail. Decisions are append-only and
are stored against the active approved Scorecard version for the application's
Job. The safe audit record captures actor, timestamp, prior decision, new
decision, confidence, and reason code; it does not copy free-form decision
detail or Recruiter-note bodies.

### `review_notes` and `review_note_versions`

`review_notes` holds the lifecycle record (`author_id`, `deleted_at`,
`deleted_by`) and `review_note_versions` holds immutable, numbered text
versions. A Recruiter may create, edit, soft-delete, and restore only their
own notes; Admin may manage all notes. Assigned Hiring Managers may read active
notes only. Delete and restore each require a reason and create a safe audit
event without copying note text.

### `notifications`

In-app notifications use a recipient, event type, aggregate reference,
relevant version, safe metadata, and read timestamp. The recipient marks only
their own notification read; reading does not create an audit event. Delivery
is idempotent by recipient/event/aggregate/version. Creating a Scorecard draft
notifies the assigned Hiring Manager. The Phase 3 worker will create the
processing-completion and Admin-only processing-failure events after bounded
retries exist.

### `audit_events`

- `id`
- `event_type`
- `actor_type`
- `actor_id`
- `aggregate_type`
- `aggregate_id`
- `correlation_id`
- `safe_metadata`
- `created_at`

No update/delete path for application roles.

## 3. Separation of concerns

Do not use one status field to represent both:

- AI processing state, and
- Recruiter review-request state,
- Hiring Manager interview-progression outcome, and
- human hiring decision.

They are independent dimensions.

## 4. Suggested indexes

- `applications(job_id, submitted_at)`
- `applications(job_id, workflow_state)`
- `processing_runs(application_id, created_at desc)`
- `processing_runs(status, created_at)`
- `evidence_items(processing_run_id, criterion_id)`
- `review_assignments(assigned_to, status, due_at)`
- `hiring_manager_review_outcomes(application_id, created_at desc)`
- `human_reviews(application_id, created_at desc)`
- `audit_events(aggregate_type, aggregate_id, created_at)`

Add indexes based on actual query plans, not only this list.

## 5. RLS access matrix

| Resource                       | Admin                               | Recruiter                           | Hiring manager                    | Requisition approver                                    |
| ------------------------------ | ----------------------------------- | ----------------------------------- | --------------------------------- | ------------------------------------------------------- |
| Requisitions                   | all demo jobs; no business approval | assigned                            | create/read assigned              | read; approve/return only designated requisitions       |
| Scorecards                     | all                                 | read assigned                       | create/read/edit/approve assigned | no access unless also assigned another role             |
| Applications                   | all                                 | assigned job                        | assigned job                      | no access by role alone                                 |
| Resume files/objects           | all assigned demo jobs              | assigned job                        | assigned job                      | no access by role alone                                 |
| Resume pages                   | all                                 | assigned job                        | assigned job                      | no access by role alone                                 |
| Evidence                       | all                                 | assigned job                        | assigned job                      | no access by role alone                                 |
| Review requests                | all read                            | create/read assigned job            | read/complete when assigned       | no access by role alone                                 |
| Interview-progression outcomes | read                                | read assigned job                   | create/read/change when assigned  | no access by role alone                                 |
| Human reviews                  | create/read/change                  | read only                           | read/create/change when assigned  | no access by role alone                                 |
| Recruiter notes                | create/read/edit/delete/restore     | own create/read/edit/delete/restore | assigned active notes read        | no access by role alone                                 |
| Notifications                  | all read; own read receipt          | own read; own read receipt          | own read; own read receipt        | own read; own read receipt                              |
| Audit                          | read                                | assigned aggregate read             | assigned aggregate read           | no access by role alone; use requisition status history |
| Audit update/delete            | never                               | never                               | never                             | never                                                   |

Server-side secret access does not replace user authorization. Privileged server operations must still verify the authenticated user or system task.

## 6. Deletion and retention

P0 provides an admin-only demo reset.

A production pilot must later define:

- retention duration,
- candidate deletion request flow,
- derived artifact deletion,
- backup deletion limitations,
- audit retention,
- legal hold.

Do not invent those values in the demo.

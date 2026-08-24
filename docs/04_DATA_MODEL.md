# Data Model — HireLens MVP

This document defines the conceptual P0 model. SQL migrations remain the executable source of truth once implemented.

## 1. Core enums

### Roles

```text
ADMIN
RECRUITER
HIRING_MANAGER
```

### Job status

```text
DRAFT
SCORECARD_PENDING_APPROVAL
READY_FOR_INTAKE
ARCHIVED
```

### Scorecard status

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

### `jobs`

- `id`
- `title`
- `department`
- `raw_job_description`
- `status`
- `recruiter_id`
- `hiring_manager_id`
- `created_at`
- `updated_at`

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

For HL-021, Recruiters and Admins request a draft through the atomic
`create_scorecard_draft` RPC. Direct application writes to scorecard versions
and criteria are revoked. Admin and assigned Job participants may read the
result through RLS; Hiring Manager approval and immutable edit/version UI are
implemented by HL-023.

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

### `applications`

- `id`
- `candidate_id`
- `job_id`
- `source`
- `submitted_at`
- `workflow_state`
- `created_at`

Invariant: one candidate may have one application per job in the demo. Production duplicate resolution is deferred.

### `resume_files`

- `id`
- `application_id`
- `storage_path`
- `original_filename`
- `mime_type`
- `byte_size`
- `sha256`
- `created_at`

Storage path uses opaque IDs. Do not embed names or emails.

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
application and must also be the Job's assigned Hiring Manager to save a human
decision. Admin may act across all demo data. Recruiters do not create or
change human decisions.

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
- human hiring decision.

They are independent dimensions.

## 4. Suggested indexes

- `applications(job_id, submitted_at)`
- `applications(job_id, workflow_state)`
- `processing_runs(application_id, created_at desc)`
- `processing_runs(status, created_at)`
- `evidence_items(processing_run_id, criterion_id)`
- `review_assignments(assigned_to, status, due_at)`
- `human_reviews(application_id, created_at desc)`
- `audit_events(aggregate_type, aggregate_id, created_at)`

Add indexes based on actual query plans, not only this list.

## 5. RLS access matrix

| Resource            | Admin         | Recruiter               | Hiring manager             |
| ------------------- | ------------- | ----------------------- | -------------------------- |
| Jobs                | all demo jobs | assigned/owned          | assigned                   |
| Scorecards          | all           | read/draft              | read/edit/approve assigned |
| Applications        | all           | assigned job            | assigned job               |
| Resume pages        | all           | assigned job            | assigned job               |
| Evidence            | all           | assigned job            | assigned job               |
| Human reviews       | create/read/change | read only            | read/create/change when assigned |
| Recruiter notes     | create/read/edit/delete/restore | own create/read/edit/delete/restore | assigned active notes read |
| Notifications       | all read; own read receipt | own read; own read receipt | own read; own read receipt |
| Audit               | read          | assigned aggregate read | assigned aggregate read    |
| Audit update/delete | never         | never                   | never                      |

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

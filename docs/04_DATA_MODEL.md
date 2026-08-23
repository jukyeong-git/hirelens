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
OPEN
PAUSED
CLOSED
```

### Scorecard status

```text
DRAFT
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
- `approved_by`
- `approved_at`
- `created_at`

Invariant: `(job_id, version_number)` is unique.

Invariant: an approved version cannot be updated.

### `criteria`

- `id`
- `scorecard_version_id`
- `name`
- `type`
- `definition`
- `accepted_evidence`
- `alternative_evidence`
- `resume_assessable`
- `display_order`
- `created_at`

`accepted_evidence` and `alternative_evidence` may be structured JSON arrays, validated at the application boundary.

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

### `human_reviews`

- `id`
- `application_id`
- `scorecard_version_id`
- `reviewer_id`
- `decision`
- `reason_code`
- `confidence`
- `note`
- `created_at`
- `supersedes_review_id`

A changed decision appends a new row and references the prior review.

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

| Resource | Admin | Recruiter | Hiring manager |
|---|---|---|---|
| Jobs | all demo jobs | assigned/owned | assigned |
| Scorecards | all | read/draft | read/edit/approve assigned |
| Applications | all | assigned job | assigned job |
| Resume pages | all | assigned job | assigned job |
| Evidence | all | assigned job | assigned job |
| Human reviews | all | read/create as self | read/create as self |
| Audit | read | assigned aggregate read | assigned aggregate read |
| Audit update/delete | never | never | never |

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

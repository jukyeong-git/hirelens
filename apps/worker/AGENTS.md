# Worker Instructions

These instructions extend the repository root `AGENTS.md` for `apps/worker`.

## Responsibility

The worker owns:

- queue consumption,
- PDF page-text extraction,
- PII minimization before model calls,
- structured AI calls,
- source quote validation,
- processing status transitions,
- bounded retries and failure recording.

It never owns or writes a human hiring decision.

## Processing contract

A task key must uniquely include:

```text
application_id + resume_file_id + scorecard_version_id + pipeline_version
```

Processing must be idempotent. Duplicate queue delivery must not duplicate evidence rows or audit events.

## Required state progression

```text
UPLOADED
→ QUEUED
→ EXTRACTING
→ ANALYZING
→ VALIDATING
→ COMPLETED
```

Recoverable alternatives:

```text
NEEDS_OCR
RETRY_PENDING
FAILED
QUARANTINED
```

Do not hide or collapse failure states.

## Queue behavior

- Acknowledge a message only after the durable result or durable failure state is committed.
- Use bounded concurrency.
- Use exponential backoff with a maximum retry count.
- Distinguish network/transient failures from schema, policy, or source-validation failures.
- Never retry an invalid quote as though it were a network timeout.
- Record attempt number and error category without logging resume text.

## PDF behavior

- Preserve page boundaries.
- Store normalized text and a hash.
- Reject invalid or encrypted files with a clear state.
- Mark image-only documents `NEEDS_OCR` in P0.
- Do not guess page numbers.

## AI behavior

- Send only the minimum fields required for the task.
- Use strict structured output.
- Set `store: false` unless an approved architecture decision changes it.
- Validate output before persistence.
- Exact evidence quotes must match normalized source text.
- Unknown criterion IDs or fabricated quotes go to `QUARANTINED`.
- Store model ID, prompt version, schema version, request ID if available, duration, and token usage.
- Never log raw prompt content when it contains resume text.

## Tests

- duplicate message idempotency,
- retry and final failure,
- image-only PDF handling,
- invalid page number rejection,
- fabricated quote rejection,
- model refusal and incomplete response handling,
- no decision write path from worker credentials.

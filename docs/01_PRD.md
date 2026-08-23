# Product Requirements Document — HireLens MVP

## 1. Product objective

Build a demo-quality ATS that proves this statement:

> AI can find and organize job-relevant evidence across every application, while humans retain the final hiring judgment and the organization retains the reason.

## 2. MVP boundary

### P0

1. Job creation
2. Scorecard draft from a job description
3. Human scorecard review, approval, and versioning
4. Multi-PDF upload
5. Per-file processing status
6. Page-level text extraction
7. Criterion-level evidence extraction with exact source quote
8. Recruiter and hiring-manager review
9. Human-only decision with reason
10. Append-only audit timeline
11. Synthetic demo seed and reset
12. Unit, integration, E2E, security, and AI eval gates

### P1

- Slack notification and reminder
- Google Calendar scheduling
- Candidate email
- CSV intake
- OCR
- Basic operations dashboard

### P2

- Real recruiting-platform connectors
- Multi-job templates
- Interviewer calibration analytics
- Post-hire outcome linkage
- Candidate experience survey

## 3. User roles

| Role | Main permissions |
|---|---|
| `ADMIN` | manage demo users, inspect all jobs, reset demo, view audit |
| `RECRUITER` | create jobs, upload applications, review evidence, request manager review |
| `HIRING_MANAGER` | approve scorecards, review assigned candidates, save human decisions |

The exact production organization and role model is not defined by the source brief. This role model is an MVP decision.

## 4. Domain definitions

### Criterion types

- `REQUIRED`: approved as required for this job.
- `PREFERRED`: useful but not mandatory.
- `INTERVIEW_ONLY`: must not be judged from the resume.

### Evidence statuses

- `SUPPORTED`: direct evidence matching the approved definition was found.
- `PARTIAL`: some evidence exists, but level or scope is unclear.
- `NOT_FOUND`: supporting evidence was not found in the submitted material.
- `CONTRADICTED`: the submitted material explicitly conflicts with the criterion.
- `HUMAN_ONLY`: the criterion is not eligible for resume-based AI judgment.

### Human decisions

- `PROCEED`
- `HOLD`
- `DO_NOT_PROCEED`

Only humans may create a decision.

## 5. Functional requirements

### FR-001 — Create and manage a job

The recruiter can create a job with title, department, owner, hiring manager, and raw job description.

Acceptance criteria:

- Required fields are validated.
- A job starts in `DRAFT`.
- A job cannot accept analysis until an approved scorecard version exists.
- Creation is written to the audit trail.

### FR-002 — Generate a scorecard draft

The system can generate a draft scorecard from a job description.

Acceptance criteria:

- Output uses a strict schema.
- The system identifies ambiguous phrases.
- Each criterion includes type, definition, accepted evidence, alternative evidence, and resume-assessable flag.
- Ambiguous human qualities default to `INTERVIEW_ONLY`.
- AI output remains a draft and has no effect until human approval.

### FR-003 — Approve and version a scorecard

A hiring manager can edit and approve a draft scorecard.

Acceptance criteria:

- Approval requires an authenticated hiring manager.
- An approved version is immutable.
- Editing an approved scorecard creates a new version.
- Every analysis references exactly one approved version.
- The UI displays version, approver, and approval time.

### FR-004 — Upload resumes in bulk

A recruiter can upload multiple PDF resumes.

Acceptance criteria:

- P0 supports text PDFs.
- File type and size are validated.
- Each file receives an independent processing state.
- Files are stored in a private bucket.
- Opaque IDs are used in paths.
- Image-only PDFs become `NEEDS_OCR`, not silently empty.

### FR-005 — Process resumes asynchronously

The system queues one analysis task for each application and scorecard version.

Acceptance criteria:

- Upload requests do not wait for all AI processing.
- Processing is idempotent.
- Duplicate task delivery does not duplicate evidence.
- Progress and failure reason are visible.
- Retries are bounded and categorized.

### FR-006 — Extract criterion-level evidence

The system analyzes resume page text against approved criteria.

Acceptance criteria:

- Each result contains criterion ID, status, exact quote when applicable, page number, interpretation, uncertainty, and optional interview question.
- Quotes are validated against source text before storage.
- Invalid criterion IDs or page numbers are quarantined.
- `NOT_FOUND` is not rendered as proof of lacking ability.
- AI does not create a human decision.

### FR-007 — Review candidates in an evidence-first list

A recruiter can view and filter all applications.

Acceptance criteria:

- Filters include processing status, review state, and criterion status.
- The primary display is criterion evidence state, not an authoritative total score.
- Partial and failed analyses remain visible.
- Late-arriving applications are not hidden because of submission order.

### FR-008 — Inspect a candidate and source evidence

A reviewer can inspect the resume and evidence together.

Acceptance criteria:

- Each evidence item opens the referenced page.
- The UI distinguishes source quote, AI interpretation, and human notes.
- The scorecard version is visible.
- Uncertainty is visible.
- `INTERVIEW_ONLY` criteria are clearly marked as not resume-assessed.

### FR-009 — Complete a 60-second structured review

A hiring manager can save a concise review.

Acceptance criteria:

- The reviewer selects a decision, structured reason, and confidence.
- `DO_NOT_PROCEED` requires a reason.
- An optional note and suggested interview question may be added.
- The review stores actor and time.
- The review can be changed only through a new decision event, not silent overwrite.

### FR-010 — Preserve audit history

The system records material events.

Minimum events:

- job created,
- scorecard drafted,
- scorecard approved,
- resume uploaded,
- processing started/completed/failed,
- review assigned,
- human decision created/changed.

Acceptance criteria:

- Events are append-only.
- Events contain aggregate ID, actor or system identity, timestamp, correlation ID, and version references.
- Audit payloads do not contain raw resume text.

### FR-011 — Recover from processing errors

A recruiter or admin can understand and retry eligible failures.

Acceptance criteria:

- Retryable and non-retryable failures are distinct.
- A retry creates a new processing attempt under the same idempotency key/version contract.
- Invalid model evidence is quarantined.
- A failed analysis never changes the human decision state.

### FR-012 — Reset a deterministic demo

An admin can reset the demo environment.

Acceptance criteria:

- Reset restores synthetic users, one job, one approved scorecard, and synthetic resumes.
- No external customer account is required for the core demo.
- Reset never targets a production environment.

## 6. Nonfunctional requirements

### Security

- RLS and role checks are mandatory.
- Secret keys are server-only.
- Resume files are private.
- No PII in logs.
- Demo uses synthetic data.

### Reliability

- Worker processing is idempotent.
- Task failures are observable.
- Partial batch completion is supported.
- Human decisions remain available when AI services are unavailable.

### Traceability

- AI and human outputs are distinguishable.
- Model, prompt, schema, scorecard, and source versions are recorded.

### Accessibility

- Core flow is keyboard accessible.
- Status is not represented by color alone.
- Forms have labels and error summaries.

### Maintainability

- Strict TypeScript.
- Runtime validation at boundaries.
- Migrations, prompts, and schemas are version-controlled.
- A complete local reset is possible.

## 7. Demo acceptance scenario

Given:

- one approved backend-engineer scorecard,
- 20 synthetic PDF resumes,
- one recruiter and one hiring manager,

When:

1. the recruiter uploads all resumes,
2. the worker extracts page text and evidence,
3. the hiring manager reviews one candidate,
4. the manager selects `PROCEED`, `HOLD`, or `DO_NOT_PROCEED`,

Then:

- all files have visible processing states,
- evidence is linked to exact pages,
- invalid evidence cannot be persisted,
- the final decision is human-authored,
- the audit timeline explains who did what and under which versions.

## 8. Product metrics

Business targets are TBD pending customer interview.

The MVP must at least capture:

- applications received,
- applications with completed analysis,
- applications opened by a human,
- average time from upload to ready-for-review,
- average manager response time,
- decisions with structured reasons,
- processing failure and quarantine rate.

## 9. Release blockers

Do not declare the MVP demo-ready if any of these is true:

- AI can write a final decision.
- A quote can be stored without matching the source page.
- Unauthorized users can read another assigned job’s resume.
- Real PII appears in fixtures or logs.
- An approved scorecard can be silently overwritten.
- The happy-path E2E test fails.
- Demo reset is nondeterministic.

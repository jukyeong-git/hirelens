# Product Requirements Document — HireLens MVP

## 1. Product objective

Build a demo-quality ATS that proves this statement:

> AI can find and organize job-relevant evidence across every application, while humans retain the final hiring judgment and the organization retains the reason.

## 2. MVP boundary

### P0

1. Human-created Job Requisition and approval
2. Internal Job Posting publish and close
3. Synthetic-only candidate self-service application
4. Scorecard draft from a job description
5. Human scorecard review, approval, and versioning
6. Multi-PDF upload
7. Per-file processing status
8. Page-level text extraction
9. Criterion-level evidence extraction with exact source quote
10. Recruiter and hiring-manager review
11. Human-only decision with reason
12. Minimal append-only change history
13. Synthetic demo seed and reset
14. Unit, integration, E2E, security, and AI eval gates
15. Internal in-app notifications with role-based recipients

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
| `ADMIN` | manage users and roles, inspect all jobs, reset demo, manage scorecards, processing, notes, decisions, and view audit |
| `RECRUITER` | prepare/publish postings, upload internal demo applications, review evidence, request manager review, manage own temporary notes, and coordinate a manager-approved interview handoff |
| `HIRING_MANAGER` | create requisitions and the screening criteria, review assigned candidates, decide whether to progress them to interview, and save and change human decisions |
| `REQUISITION_APPROVER` | approve or return a pending requisition as the designated business approver (for example an organizational leader, budget owner, or HRBP) |
| `CANDIDATE` | no account in P0; may submit synthetic/anonymized demo data only through a published public posting |

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

Only authenticated human roles may create or change a decision. `HIRING_MANAGER` and `ADMIN` may write decisions; AI and worker identities never have a decision-write path. Every initial decision and decision change requires a structured reason.

## 5. Functional requirements

### FR-001 — Create and manage a Job Requisition

The assigned hiring manager can create a Job Requisition with title,
department, hiring need, assigned recruiter, and raw job description. The
requisition includes the initial screening-criteria workflow.

Acceptance criteria:

- Required fields are validated.
- A requisition starts in `DRAFT`.
- A job cannot accept analysis until an approved scorecard version exists.
- Creation is written to the audit trail.

### FR-001A — Approve a Job Requisition

The assigned Hiring Manager submits a Job Requisition to a designated
`REQUISITION_APPROVER`, who approves or returns it with a reason. `ADMIN` is a
system-operations role and is not part of the business approval path.

Acceptance criteria:

- Requisition state is separate from Scorecard and Posting state.
- Only the designated authenticated `REQUISITION_APPROVER` can approve or
  return a pending requisition.
- Approval or return requires a non-empty reason and retains actor, time, and
  prior status in the minimal change history.
- AI and worker identities cannot approve a requisition.

### FR-001B — Publish an internal Job Posting

The assigned Recruiter can prepare and publish a Job Posting for an approved
requisition. A posting is public only after the requisition and one Scorecard
version are human-approved.

Acceptance criteria:

- Posting state is `DRAFT`, `PUBLISHED`, or `CLOSED`, separate from Job and
  Scorecard state.
- Only the assigned Recruiter or Admin may publish or close a posting.
- A closed or unpublished posting is not visible from the public route and
  accepts no new applications.
- The public route exposes a narrow posting projection, never internal users,
  applications, files, processing, or evaluation data.

### FR-001C — Submit a synthetic candidate application

An unauthenticated candidate can submit a synthetic or explicitly anonymized
PDF through a published posting without creating an account.

Acceptance criteria:

- The form requires a synthetic/anonymized-demo-data attestation; real
  applicant data is prohibited.
- Submission uses a new server-side path and private Storage reservation; it
  must not expose existing internal upload RPCs or Storage policies.
- File type and size are validated and the response does not disclose internal
  application, Storage, or processing identifiers.
- Submission creates an application in a visible internal processing state but
  never creates a human decision.
- Public-route tests prove unpublished/closed postings and unrelated internal
  data are inaccessible to anonymous users.

### FR-002 — Generate a scorecard draft

The system can generate a draft scorecard from a job description.

Acceptance criteria:

- Output uses a strict schema.
- The system identifies ambiguous phrases.
- Each criterion includes type, definition, accepted evidence, alternative evidence, and resume-assessable flag.
- Ambiguous human qualities default to `INTERVIEW_ONLY`.
- AI output remains a draft and has no effect until human approval.

### FR-003 — Approve and version a scorecard

An authorized hiring manager or admin can edit and approve a draft scorecard.

Acceptance criteria:

- Approval requires an authenticated hiring manager or admin.
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
- The demo uses `OPENAI_MODEL=gpt-5.6-luna` through a server-side environment variable.
- Each application and scorecard version has at most one retry after the initial attempt.
- Demo input and output token caps and an application-level cost budget prevent unbounded model spend.

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

### FR-008A — Route a candidate for Hiring Manager review

After reviewing evidence, a recruiter may request a Hiring Manager review. The
request is not an interview decision and cannot be created by AI or the worker.

Acceptance criteria:

- A review request identifies the assigned Hiring Manager and retains its
  requester, time, and optional recruiter note separately from AI evidence.
- The assigned Hiring Manager can record `INTERVIEW`, `HOLD`, or
  `MORE_INFORMATION_REQUIRED` with a required reason.
- Only a Hiring Manager's `INTERVIEW` outcome authorizes the Recruiter to make
  an interview handoff; candidate messaging and scheduling remain P1.
- AI analysis never creates, changes, or implies the review outcome.

### FR-009 — Complete a 60-second structured review

A hiring manager or admin can save a concise human review.

Acceptance criteria:

- The reviewer selects a decision, structured reason, and confidence.
- Every initial decision requires a structured reason.
- Every decision change requires a structured reason.
- An optional note and suggested interview question may be added.
- The review stores actor, role, reason, prior value when changed, and time.
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
- human decision created/changed,
- user or role created/changed/disabled,
- scorecard or job changed,
- processing retried/quarantined,
- evidence changed or restored,
- review note created/edited/soft-deleted/restored,
- demo reset,
- notification sent or failed.

Acceptance criteria:

- Events are append-only.
- Events contain aggregate ID, actor or system identity and role, action, target, before/after values when applicable, reason when applicable, timestamp, correlation ID, source, result, and version references.
- Admin may perform all product operations but may not update or delete audit events.
- Audit payloads do not contain raw resume text.

### FR-011 — Recover from processing errors

An admin can understand and retry eligible failures; the responsible user receives normal workflow notifications, while processing failures notify admin only in P0.

Acceptance criteria:

- Retryable and non-retryable failures are distinct.
- A retry creates a new processing attempt under the same idempotency key/version contract.
- Only bounded transient failures are retried; policy refusals, schema failures, invalid pages, and fabricated quotes are quarantined.
- After the single retry fails, the processing state becomes `FAILED` and an in-app admin notification is created.
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
- Audit events are append-only and protected at the database layer.
- Demo uses synthetic data.

### Reliability

- Worker processing is idempotent.
- Task failures are observable.
- Partial batch completion is supported.
- Human decisions remain available when AI services are unavailable.
- Internal notifications are delivered to the responsible role; processing failures are delivered to admins only in P0.

### Traceability

- AI and human outputs are distinguishable.
- Model, prompt, schema, scorecard, and source versions are recorded.
- Model token usage, attempt count, and estimated cost are recorded without resume text.

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
- one admin,

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

# Product Requirements Document — HireLens MVP

## 1. Product objective

Build a demo-quality ATS that proves this statement:

> AI can find and organize job-relevant evidence across every application, while humans retain the final hiring judgment and the organization retains the reason.

## 2. MVP boundary

### P0

1. Human-created Job Requisition
2. Internal Job Posting publish and close
3. Candidate self-service PDF application; presentation fixtures remain synthetic
4. AI-proposed application-review-criteria draft from a job description
5. Human review, approval, and versioning of application review criteria
6. Multi-PDF upload
7. Per-file processing status
8. Page-level text extraction
9. Criterion-level evidence extraction with exact source quote
10. Recruiter and hiring-manager review
11. Human-only decision with reason
12. Domain-owned workflow and decision histories
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

| Role                   | Main permissions                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN`                | manage users and roles, inspect all jobs, reset demo, and manage scorecards, processing, notes, and decisions                                                                         |
| `RECRUITER`            | prepare/publish postings, upload internal demo applications, review evidence, request manager review, manage own temporary notes, and coordinate a manager-approved interview handoff |
| `HIRING_MANAGER`       | create requisitions and the screening criteria, review assigned candidates, decide whether to progress them to interview, and save and change human decisions                         |
| `REQUISITION_APPROVER` | reserved for a future enterprise approval workflow; not available in the MVP                                                                                                          |
| `CANDIDATE`            | no account in P0; may submit a PDF resume through a published public posting                                                                                                          |

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
department, hiring need, assigned recruiter, and a structured job description
containing role summary, responsibilities, requirements, and preferred
qualifications. The
hiring need is retained as internal requisition context and is not sent to the
model. Before saving, they may explicitly request an AI-proposed, editable
job-description draft for those four fields from the title, department, and
any existing values in those four fields. Existing values are reference context
and blank fields are generated. The
requisition includes the initial screening-criteria workflow.

Acceptance criteria:

- Required fields are validated.
- A requisition starts in `DRAFT`.
- AI draft generation is explicit, labeled as AI-generated, editable, and
  transient until the Hiring Manager saves the requisition; it does not
  automatically save, approve, submit, publish, assign people, or change a
  hiring decision.
- AI must not invent compensation, legal/eligibility terms, company policy, or
  protected-trait preferences. Those terms remain human-provided or `TBD`.
- A job cannot accept analysis until an approved scorecard version exists.
- Creation stores its authenticated actor and timestamps on the requisition record.

### FR-002 — Create an editable Review Framework draft

The assigned Hiring Manager or an Admin may start the initial `지원서 평가 기준`
(Review Framework) either from a blank structured form or from an explicit AI
proposal. Recruiters can read the saved framework but cannot create, save, or
approve it.

Acceptance criteria:

- The form supports criterion name, importance/type, definition, accepted and
  alternative evidence, partial-evidence guidance, extraction fields,
  resume-assessability, and a suggested interview question.
- The approved Review Framework is the primary contract for resume evidence
  analysis. The job description is supporting context only and cannot replace
  or silently expand the approved criteria.
- The framework produces criterion-level evidence states and follow-up
  questions. It must not define an authoritative total score, automatic
  ranking, knockout rule, or automatic applicant decision.
- AI generation only fills the same editable, unsaved form. It never creates a
  version, approval, analysis run, ranking, or hiring decision.
- A human must explicitly save the form as a draft before the existing
  ambiguity-review and approval workflow begins.
- A manually saved draft is explicitly recorded as human-authored rather than
  being mislabeled as model output.

### FR-001A — Create a Job Requisition in the MVP

The Hiring Manager creates and saves the Job Requisition. The MVP does not
include a separate business approver or a requisition approval queue. A human-
approved Review Framework is the gate before intake and posting operations.

The `REQUISITION_APPROVER` role, requisition status fields, and append-only
history remain in the database as dormant compatibility structures for a future
enterprise approval slice. They are not exposed by the MVP UI or active posting
flow. `ADMIN` remains a system-operations role.

Acceptance criteria:

- Hiring Manager can create and save a requisition without assigning an approver.
- Review Framework approval moves the Job to `READY_FOR_INTAKE`.
- Posting and resume intake use the Job and Review Framework states, not a
  dormant requisition approval state.
- No AI, worker, or unsupported Requisition Approver path can create a hiring
  decision.

### FR-001B — Publish an internal Job Posting

The assigned Recruiter can prepare and publish a Job Posting after the Job's
Review Framework is human-approved. The separate requisition approval state is
not an MVP gate.

Acceptance criteria:

- Posting state is `DRAFT`, `PUBLISHED`, or `CLOSED`, separate from Job and
  Review Framework state.
- Only the assigned Recruiter or Admin may publish or close a posting.
- Recruiter or Admin must save complete candidate-facing posting content before
  publication: title, summary, responsibilities, requirements, location, and
  employment type.
- A closed or unpublished posting is not visible from the public route and
  accepts no new applications.
- The public route exposes a narrow posting projection, never internal users,
  applications, files, processing, or evaluation data.

### FR-001C — Submit a candidate application

An unauthenticated candidate can submit a PDF through a published posting
without creating an account. Intake neither asks for nor infers whether the
content is real, synthetic, or anonymized; presentation, seed, reset, and
committed fixtures remain synthetic.

Acceptance criteria:

- The candidate provides a name explicitly; the system never infers it from the resume or sends it to the AI evidence pipeline.
- Authorized internal reviewers see the provided name after ATS validation completes; existing unnamed applications remain explicitly labeled as unnamed.
- The form does not require a data classification or synthetic-data
  attestation. Historical synthetic attestations are preserved and are not
  reused for new submissions.
- Submission uses a new server-side path and private Storage reservation; it
  must not expose existing internal upload RPCs or Storage policies.
- File type and size are validated and the response does not disclose internal
  application, Storage, or processing identifiers.
- Submission creates an application in a visible internal processing state but
  never creates a human decision.
- Public-route tests prove unpublished/closed postings and unrelated internal
  data are inaccessible to anonymous users.

### FR-002 — Generate an application-review-criteria draft

The Hiring Manager explicitly requests an AI-proposed application-review-criteria
draft from a job description. `Scorecard` remains the internal contract name;
the user-facing term is `지원서 평가 기준`.

Acceptance criteria:

- Output uses a strict schema.
- AI runs only after an authenticated human explicitly requests a draft; it
  never runs automatically when a requisition is saved.
- The system identifies ambiguous phrases.
- Each criterion includes type, definition, accepted evidence, alternative evidence, and resume-assessable flag.
- Ambiguous human qualities default to `INTERVIEW_ONLY`.
- AI output remains a draft and has no effect until human approval.

### FR-003 — Approve and lock application review criteria

An authorized hiring manager or admin can edit and approve draft application
review criteria.

Acceptance criteria:

- Approval requires an authenticated hiring manager or admin.
- The approved framework is immutable and final for its Job.
- An approved framework cannot be edited, replaced, or versioned in the MVP.
- Every analysis references exactly one approved version.
- The UI displays the approver and approval time without exposing version-management controls.

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

### FR-010 — Preserve domain-owned history

The product does not maintain a generic audit-event log. Workflows that need
history keep it in their own typed records: requisition and posting status
history, review-note versions, processing attempts, interview progression, and
human decision supersession.

Acceptance criteria:

- Human decisions retain actor, reason, timestamp, and prior-value linkage.
- Processing attempts retain model, prompt, schema, pipeline, status, and error metadata.
- Workflow history tables remain role-protected and contain no raw resume text.
- No generic `audit_events` timeline or API is exposed.

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
- Presentation, seed, reset, and committed fixtures use synthetic data.

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
- typed workflow and decision histories explain the relevant human and processing changes.

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

# Target Operating Process — Judgment Track P0

## 1. Purpose and boundary

HireLens is a hiring workflow that uses synthetic presentation data and includes the smallest
requisition, posting, and candidate-intake path needed to demonstrate the
evidence-review and reasoned-decision module. It is not an enterprise ATS or
HRIS system of record.

This process intentionally addresses only the Builderthon Judgment Track bottlenecks:

- every received application must be visible and reviewable;
- repeated resume reading must be reduced without delegating a hiring decision to AI;
- Hiring Manager feedback must be fast, structured, and attributable; and
- the organization must retain evidence and reasons for decisions.

P0 includes a minimal business requisition approval, public posting, and
account-free candidate submission. Intake accepts real resumes as well as test
material, while seed, reset, committed fixtures, and presentations remain
synthetic. Budget approval, candidate communication, scheduling,
offer, hire, and HRIS records remain outside HireLens.

## 2. Minimal end-to-end process

```text
Hiring Manager requisition + screening criteria → business approval
  → Recruiter posting → candidate submission
  → Evidence processing and visible exception handling
  → Recruiter triage and review request
  → Hiring Manager’s interview-progression decision
  → later Hiring Manager’s reasoned hiring judgment
  → Immutable audit record and downstream status handoff
```

### Step 0 — Requisition and posting

The Hiring Manager creates a Job Requisition, assigns a Recruiter, and defines
the initial screening criteria. A designated `REQUISITION_APPROVER` (for
example an organizational leader, budget owner, or HRBP) approves or returns
the requisition with a reason. `ADMIN` is a system-operations role and does not
approve or return requisitions.

The Recruiter prepares a Job Posting and may publish or close it only after
both the requisition and one screening-criteria version are human-approved.
`ADMIN` may perform those actions only as a system-operations override. Closing
stops new submissions while preserving internal review data; the P0 posting is
terminal after close and is not reopened.
The candidate-facing copy is separate from the internal Requisition source.
HL-028 provides the public page. HL-029 provides the
one-PDF submission form, server-owned private upload
transaction, a server-verified demo access code, and a generic receipt that
reveals no internal IDs or processing details.

### Step 1 — Define and approve the evaluation policy

After the Hiring Manager explicitly requests it, HireLens creates a draft
screening-criteria version from the job description. The user-facing term is
`지원서 평가 기준` (`Scorecard` is the internal contract name). The Hiring Manager
reviews it, resolves ambiguous language,
and approves a version with a reason.

Gate: only one active, human-approved application-review-criteria version may
be used for intake and analysis. Approved versions are immutable.

Output: a versioned set of `REQUIRED`, `PREFERRED`, and `INTERVIEW_ONLY` criteria, including what counts as resume evidence.

### Step 2 — Candidate submission and application registration

An account-free candidate uses a published posting to submit a PDF without
classifying its content as real or test material. The server registers the application, stores the
resume in private Storage, and associates it with the active Scorecard version.
Recruiter/Admin batch upload remains a demo-operations path.

Gate: input must be an allowed PDF within the size limit. Content classification
and synthetic-data attestation are not intake gates. Every file receives a
visible processing state; no received application is silently dropped.

### Step 3 — Process evidence and handle exceptions

The Worker extracts page text asynchronously and records the processing run. The target evidence-processing capability compares approved criteria against page text and stores only validated, criterion-level evidence: source quote, page, status, uncertainty, and version references.

Gate: a quote must be an exact normalized substring of its referenced page. Invalid model output is quarantined; image-only PDFs become `NEEDS_OCR`; retryable failures are bounded and remain visible. None of these states can create or change a hiring decision.

Output: a review-ready, partial, failed, needs-OCR, or quarantined application.

### Step 4 — Recruiter triage

The Recruiter checks processing completeness, sees criterion-level evidence,
adds a temporary note if needed, and requests or re-requests Hiring Manager
review. A temporary note is never a decision and retains its own version
history.

Output: an accountable reviewer and a visible work item, while incomplete or failed processing remains visible to the responsible operator.

### Step 5 — Hiring Manager interview-progression review

The Hiring Manager reviews the criterion definition, source quote and page, AI
interpretation, uncertainty, and any Recruiter note. The Hiring Manager records
`INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED` with a required reason.
The Recruiter may coordinate an interview handoff only after `INTERVIEW`.

Gate: only the authenticated assigned Hiring Manager can write this outcome. It
is a new, reasoned event; it never overwrites the prior outcome. AI and Worker
identities have no write path.

Output: an attributable human interview-progression outcome and any follow-up
interview question.

### Step 6 — Record and hand off

HireLens preserves the screening-criteria version, processing history,
evidence, human notes, review outcomes, decision history, and minimal
append-only change history. P0 does not send candidate messages, schedule
interviews, make offers, or update an external ATS.

## 3. Ownership

| Activity                                 | Owner                           | HireLens responsibility                              |
| ---------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| Requisition creation                     | Hiring Manager                  | Create requisition and approve screening criteria    |
| Requisition approval                     | Requisition Approver            | Reasonedly approve or return a submitted requisition |
| Job posting and closure                  | Recruiter                       | Publish/close an approved posting                    |
| Intake completeness and review routing   | Recruiter                       | Register/import application, triage, assign review   |
| PDF and evidence processing              | System Worker                   | Extract and validate evidence only                   |
| Interview-progression review             | Hiring Manager                  | Decide interview, hold, or more information required |
| Hiring judgment                          | Hiring Manager; Admin exception | Record a separate reasoned human decision            |
| Access, failure recovery, change history | Admin                           | Operate safely without altering retained history     |

## 4. Explicitly outside this process

- requisition budget and organizational approval;
- external job-board posting and candidate communication;
- interview scheduling, offers, onboarding, and payroll;
- automated accept/reject/advance decisions or a global fit score;
- protected-trait, personality, face, voice, or performance inference.

These may be supplied by an enterprise ATS or evaluated as later integrations; they are not required to prove the Judgment Track outcome.

## 5. P0 proof points

The minimal demonstrable flow is one approved synthetic backend-engineer
screening-criteria version, a batch of synthetic text PDFs, page-level evidence
processing with visible failures, Recruiter review routing, one reasoned Hiring
Manager interview-progression outcome, and an immutable audit trail.

Business targets for coverage and turnaround remain `TBD` until confirmed by the customer. The demo is assessed using functional, security, and quality gates rather than invented business targets.

## 6. Current implementation note

The current evidence pipeline implements PDF page-text extraction, hashes,
versioned OpenAI Structured Output, exact source validation, evidence
persistence, bounded retries, and Admin-only terminal failure notification.
The queue consumer is moving to a one-message Supabase Edge Function with
lease recovery. The Node poller remains only as an Alpha rollback path until
the deployed Edge smoke and partial-batch gates pass.

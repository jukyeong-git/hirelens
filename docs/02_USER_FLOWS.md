# User Flows — HireLens MVP

## 1. Personas

### Recruiter

Primary job: make every application reviewable and route evidence to the correct human.

### Hiring manager

Primary job: create the requisition and screening criteria, then decide whether
an assigned candidate should proceed to interview.

### Requisition Approver

Primary job: perform the designated business approval or return of a submitted
requisition. This is an organizational role such as a leader, budget owner, or
HRBP, not a system-admin duty.

### Admin

Primary job: operate the demo, inspect failures, manage access, and review the audit trail.

### Candidate

Primary job: submit a PDF resume through a
published posting. The candidate has no account and cannot view internal
application, processing, or review data.

## 2. Flow A — Requisition, posting, and application-review-criteria setup

```text
Hiring Manager enters title, department, and hiring need
→ optionally and explicitly requests an editable AI Job Requisition/job-description draft
→ reviews or edits the description and explicitly saves the requisition
→ explicitly requests an AI-proposed application-review-criteria draft
→ system flags ambiguous phrases
→ hiring manager edits criteria
→ manager classifies each criterion
→ manager approves the review-criteria version
→ Requisition Approver approves or returns requisition with a reason
→ Recruiter publishes posting
```

### Key UX requirements

- Ambiguous phrases are shown alongside a proposed action.
- The system must not silently convert “good communication” into a resume score.
- Accepted evidence must be concrete enough to distinguish learning, use, operations, incident response, and architecture ownership when relevant.
- Approval makes the version immutable.

## 3. Flow B — Candidate application intake

```text
Candidate opens published posting
→ selects PDF
→ client validates basic type/size
→ server creates candidate/application/file rows
→ files upload to private storage
→ one queue task per application
→ UI shows per-file state
```

Recruiter/Admin batch upload does not classify file content; presentation fixtures remain synthetic.

### Failure branches

- unsupported format → `FAILED_UNSUPPORTED`
- encrypted/corrupt PDF → `FAILED_DOCUMENT`
- no extractable text → `NEEDS_OCR`
- transient worker/API error → `RETRY_PENDING`
- invalid structured evidence → `QUARANTINED`

The rest of the batch continues when one file fails.

## 4. Flow C — Evidence processing

```text
Worker extracts page text
→ minimizes direct identifiers for model input
→ sends approved criteria + page text
→ receives strict structured result
→ validates criterion IDs, page bounds, and quotes
→ persists validated evidence
→ marks application ready for review
```

The worker never assigns `PROCEED`, `HOLD`, or `DO_NOT_PROCEED`.

## 5. Flow D — Recruiter review

```text
Recruiter opens application list
→ filters by ready/partial/failure state
→ opens candidate detail
→ compares criterion status and source page
→ adds recruiter note if needed
→ requests Hiring Manager review
```

### Evidence presentation order

1. criterion definition,
2. status,
3. exact source quote and page,
4. AI interpretation,
5. uncertainty,
6. suggested interview question,
7. human notes.

## 6. Flow E — Hiring-manager review

```text
Manager opens assigned review
→ reads concise evidence summary
→ opens source pages where needed
→ selects `INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED`
→ records a required reason
→ Recruiter receives the outcome and coordinates the next step
```

### Interview-progression form

Required:

- outcome: `INTERVIEW`, `HOLD`, or `MORE_INFORMATION_REQUIRED`,
- reason.

Optional:

- note,
- interview question,
- request for more information.

This is distinct from the later human hiring decision (`PROCEED`, `HOLD`, or
`DO_NOT_PROCEED`), which remains a separate reasoned event. Target interaction
time is a product hypothesis, not a guaranteed source requirement.

## 7. Flow F — Decision change

```text
Authorized human opens previous decision
→ chooses “change decision”
→ selects new decision and change reason
→ system appends a new decision event
→ prior decision remains visible in timeline
```

No silent overwrite is allowed.

## 8. Flow G — Failure recovery

```text
Recruiter opens processing issue
→ sees error category and retry eligibility
→ retries eligible failure
→ new processing attempt starts
→ old attempt remains in history
```

A quarantined result requires a new analysis or human-only review; it is never treated as valid evidence.

## 9. Separate state sketch

```text
Processing: RECEIVED → PROCESSING → READY_FOR_RECRUITER_REVIEW
                              ├→ PARTIAL_REVIEW_AVAILABLE
                              ├→ NEEDS_OCR
                              └→ PROCESSING_FAILED

Recruiter review request: NOT_REQUESTED → REQUESTED → COMPLETED

Hiring Manager review outcome: INTERVIEW | HOLD | MORE_INFORMATION_REQUIRED

Final human hiring decision: PROCEED | HOLD | DO_NOT_PROCEED
```

Processing, Recruiter review request, Hiring Manager interview-progression
outcome, and final human hiring decision are separate dimensions. Do not
collapse them into one enum.

## 10. UX principles

- Evidence before interpretation
- Uncertainty before confidence theater
- Human action clearly separated from system output
- All 200 applications remain visible and countable
- Partial progress is better than a blank batch
- Reason capture must be fast enough to be used
- No design element should imply that AI made the final hiring decision

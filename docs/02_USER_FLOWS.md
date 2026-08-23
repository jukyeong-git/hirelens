# User Flows — HireLens MVP

## 1. Personas

### Recruiter

Primary job: make every application reviewable and route evidence to the correct human.

### Hiring manager

Primary job: define what counts for the role and make a fast, reasoned judgment.

### Admin

Primary job: operate the demo, inspect failures, manage access, and review the audit trail.

## 2. Flow A — Job and scorecard setup

```text
Recruiter creates job
→ enters raw job description
→ requests scorecard draft
→ system flags ambiguous phrases
→ hiring manager edits criteria
→ manager classifies each criterion
→ manager approves version
→ job becomes ready for intake
```

### Key UX requirements

- Ambiguous phrases are shown alongside a proposed action.
- The system must not silently convert “good communication” into a resume score.
- Accepted evidence must be concrete enough to distinguish learning, use, operations, incident response, and architecture ownership when relevant.
- Approval makes the version immutable.

## 3. Flow B — Bulk application intake

```text
Recruiter selects PDFs
→ client validates basic type/size
→ server creates candidate/application/file rows
→ files upload to private storage
→ one queue task per application
→ UI shows per-file state
```

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
→ adds recruiter note or assigns hiring-manager review
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
→ selects decision
→ selects structured reason
→ adds optional note/question
→ saves review
```

### Decision form

Required:

- decision,
- reason for `DO_NOT_PROCEED`,
- confidence: `HIGH`, `MEDIUM`, `LOW`.

Optional:

- note,
- interview question,
- request for more information.

Target interaction time is a product hypothesis, not a guaranteed source requirement. The UI is designed to make the review possible in about one minute when evidence is clear.

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

## 9. Application state sketch

```text
RECEIVED
  → PROCESSING
      → READY_FOR_RECRUITER_REVIEW
      → PARTIAL_REVIEW_AVAILABLE
      → NEEDS_OCR
      → PROCESSING_FAILED
  → MANAGER_REVIEW_REQUESTED
  → MANAGER_REVIEWED
  → INTERVIEW
  → HOLD
  → CLOSED
```

AI processing states and human hiring decisions are separate dimensions. Do not collapse them into one enum.

## 10. UX principles

- Evidence before interpretation
- Uncertainty before confidence theater
- Human action clearly separated from system output
- All 200 applications remain visible and countable
- Partial progress is better than a blank batch
- Reason capture must be fast enough to be used
- No design element should imply that AI made the final hiring decision

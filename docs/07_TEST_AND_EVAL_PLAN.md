# Test and Evaluation Plan — HireLens MVP

## 1. Quality strategy

HireLens has three independent quality dimensions:

1. normal software correctness,
2. authorization and privacy,
3. AI evidence faithfulness.

A green UI test alone is insufficient.

## 2. Required commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm eval:ai
pnpm build
```

## 3. Unit tests

### Domain

- valid and invalid state transitions,
- role permission functions,
- requisition approval and return reason requirement,
- Hiring Manager interview-progression reason requirement,
- decision reason requirement,
- scorecard version immutability,
- idempotency key construction.

### PDF

- page boundary preservation,
- text normalization,
- exact quote match,
- whitespace and Unicode normalization,
- empty/image-only document classification.

### AI contract

- schema accepts valid output,
- schema rejects unknown keys and invalid enums,
- unknown criterion ID rejection,
- page bounds rejection,
- no decision field allowed.

## 4. Integration tests

- Hiring Manager requisition creation, approved screening criteria, and
  Requisition Approver approval/return transaction,
- posting publication gate and synthetic public submission denial cases,
- upload metadata and private storage path,
- enqueue and worker claim,
- duplicate queue delivery,
- evidence persistence after source validation,
- quarantine on fabricated quote,
- human review append and supersession,
- Hiring Manager interview-progression outcome append and supersession,
- append-only audit enforcement,
- RLS allowed and denied cases.

Model calls should be mocked for most integration tests. A small explicit online eval suite may use the real API.

## 5. E2E scenarios

### E2E-01 — Happy path

```text
login as hiring manager
→ create requisition and request screening-criteria draft
→ resolve ambiguity and approve screening criteria
→ login/switch to Requisition Approver
→ approve requisition
→ login/switch to recruiter and publish posting
→ submit synthetic resume through public posting
→ wait for ready state
→ recruiter inspects evidence and requests manager review
→ hiring manager records `INTERVIEW` with a reason
→ inspect audit timeline
```

### E2E-02 — Missing evidence

- candidate has no direct evidence for one required criterion,
- UI renders “제출 자료에서 근거를 찾지 못함,”
- UI does not render “경험 없음.”

### E2E-03 — Invalid AI quote

- fixture returns a quote absent from the source,
- run becomes `QUARANTINED`,
- invalid evidence is not shown as trusted,
- no decision changes.

### E2E-04 — Authorization

- unassigned manager cannot open the resume,
- Recruiter cannot write an interview-progression outcome,
- Admin cannot approve or return a requisition merely through the Admin role,
- worker identity cannot create a human review,
- unauthenticated access redirects or denies.

### E2E-05 — Partial batch

- one PDF fails,
- remaining files complete,
- batch screen shows both success and failure.

## 6. Golden AI evaluation set

Create 20 synthetic resumes with controlled cases:

- 5 direct evidence cases,
- 5 partial/ambiguous scope cases,
- 4 genuine not-found cases,
- 2 contradiction cases,
- 2 interview-only cases,
- 1 image-only PDF,
- 1 malformed or encrypted PDF fixture.

For each criterion, a human-authored expectation file records:

- acceptable status set,
- required or forbidden source phrases,
- correct page,
- overclaims that must not appear,
- expected follow-up question theme.

The deterministic source PDFs and expectation manifest live under
`tests/fixtures/synthetic-resumes/`. The lightweight offline contract set is
`tests/ai-evals/evidence-golden.json` and runs with `pnpm eval:ai`.

The same command validates the Review Framework revision fixture. Revision
coverage must prove:

- the proposal lineage matches an active `REVIEW_REQUIRED` finding;
- the before snapshot exactly matches the approved criterion;
- `INTERVIEW_ONLY` proposals are not resume-assessable;
- protected-trait and job-irrelevant criterion language is rejected;
- the proposal remains transient until an explicit human draft save; and
- reanalysis leaves interview and human-decision row counts unchanged.

## 7. Proposed demo quality gates

These are team-proposed engineering gates, not customer-agreed business targets.

| Gate                                                         |       Proposed threshold |
| ------------------------------------------------------------ | -----------------------: |
| Structured output schema validity                            | 100% of accepted results |
| Persisted quote exists on referenced page                    |                     100% |
| Valid criterion IDs and page bounds                          |                     100% |
| Human decision written by AI/worker                          |            0 occurrences |
| Interview-progression outcome written by AI/worker/Recruiter |            0 occurrences |
| Protected-trait or personality inference in golden set       |            0 occurrences |
| Finding-free or lineage-mismatched revision proposal         |            0 occurrences |
| Human history changed by replacement-version reanalysis      |            0 occurrences |
| `NOT_FOUND` rendered as capability absence                   |            0 occurrences |
| Golden set page accuracy                                     |             at least 95% |
| RLS denial tests                                             |                100% pass |
| Happy-path E2E                                               |                     pass |
| Build, lint, typecheck                                       |                     pass |

If page accuracy is below the gate, do not hide it with a global score. Improve extraction or reduce the demo claim.

## 8. AI regression process

Any change to:

- prompt,
- model,
- schema,
- text normalization,
- page extraction,
- evidence mapping,

requires:

1. version bump,
2. golden set run,
3. comparison report,
4. review of changed failures,
5. explicit acceptance of regressions.

## 9. Performance checks

The demo does not invent a customer SLA.

It must demonstrate:

- upload request returns without waiting for full batch,
- per-file progress updates,
- bounded worker concurrency,
- no duplicate evidence on retries,
- UI remains usable during batch processing.

Record timing so targets can be agreed after the first interview.

## 10. Pre-demo checklist

- [x] Hosted Alpha migration/RLS suites pass with transaction rollback and no Docker.
- [ ] Scoped synthetic-fixture reset is guarded and audited; physical Alpha reset remains disabled.
- [ ] Synthetic PDFs open correctly.
- [ ] No real names or contact details.
- [ ] Online model quota and key verified.
- [ ] Offline/mocked fallback available.
- [ ] Happy-path E2E passed on deployment.
- [ ] Error-path E2E passed.
- [ ] AI eval report saved.
- [ ] Security reviewer has no unresolved blocker.

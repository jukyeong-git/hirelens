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

- job creation and scorecard approval transaction,
- upload metadata and private storage path,
- enqueue and worker claim,
- duplicate queue delivery,
- evidence persistence after source validation,
- quarantine on fabricated quote,
- human review append and supersession,
- append-only audit enforcement,
- RLS allowed and denied cases.

Model calls should be mocked for most integration tests. A small explicit online eval suite may use the real API.

## 5. E2E scenarios

### E2E-01 — Happy path

```text
login as recruiter
→ create job
→ request scorecard draft
→ login/switch to manager
→ approve scorecard
→ upload synthetic resumes
→ wait for ready state
→ inspect evidence and source page
→ save human decision
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

## 7. Proposed demo quality gates

These are team-proposed engineering gates, not customer-agreed business targets.

| Gate | Proposed threshold |
|---|---:|
| Structured output schema validity | 100% of accepted results |
| Persisted quote exists on referenced page | 100% |
| Valid criterion IDs and page bounds | 100% |
| Human decision written by AI/worker | 0 occurrences |
| Protected-trait or personality inference in golden set | 0 occurrences |
| `NOT_FOUND` rendered as capability absence | 0 occurrences |
| Golden set page accuracy | at least 95% |
| RLS denial tests | 100% pass |
| Happy-path E2E | pass |
| Build, lint, typecheck | pass |

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

- [ ] Local reset succeeds from a clean state.
- [ ] Deployed reset is guarded.
- [ ] Synthetic PDFs open correctly.
- [ ] No real names or contact details.
- [ ] Online model quota and key verified.
- [ ] Offline/mocked fallback available.
- [ ] Happy-path E2E passed on deployment.
- [ ] Error-path E2E passed.
- [ ] AI eval report saved.
- [ ] Security reviewer has no unresolved blocker.

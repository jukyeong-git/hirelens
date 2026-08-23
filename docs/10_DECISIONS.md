# Architecture and Product Decision Log

Use this file for lightweight ADRs. Do not rewrite history; append a new decision that supersedes an old one.

## ADR template

```text
## ADR-XXX — Title

- Status: Proposed | Accepted | Superseded
- Date:
- Decision owner:
- Supersedes:

### Context

### Decision

### Consequences

### Open follow-up
```

## ADR-001 — Final hiring decision is human-only

- Status: Accepted
- Date: Starter
- Decision owner: Product team

### Context

The problem brief explicitly states that final selection and rejection should not be delegated to a machine.

### Decision

Only authenticated human roles can create hiring decisions. Worker and AI service credentials have no decision-write path.

### Consequences

- AI output is evidence, not a verdict.
- E2E and authorization tests must prove this separation.
- No automatic rejection feature is built.

## ADR-002 — Evidence-first UI instead of authoritative fit score

- Status: Accepted
- Date: Starter
- Decision owner: Product team

### Context

A single score hides ambiguity, criteria quality, and missing source support.

### Decision

The primary UI shows criterion statuses, quotes, pages, uncertainty, and questions. A global fit score is out of P0 scope.

### Consequences

- More explainable review.
- List filtering requires criterion-level summaries.
- Demo narrative focuses on evidence coverage.

## ADR-003 — One backend-engineer vertical slice

- Status: Accepted
- Date: Starter
- Decision owner: Product team

### Context

A full ATS or all job families would exceed the demo scope.

### Decision

Build one job flow end-to-end before adding job templates or integrations.

### Consequences

- Faster validation.
- Criteria and fixtures can be controlled.
- Generalization remains future work.

## ADR-004 — Page-aware PDF extraction before AI

- Status: Accepted
- Date: Starter
- Decision owner: Engineering

### Context

The UI must show exact source pages and validate model quotes.

### Decision

Extract and preserve page text before the AI call. Validate every quote against the referenced page.

### Consequences

- Better traceability.
- Image-only PDFs require a separate OCR path.
- Direct whole-file summarization is not the primary P0 path.

## ADR-005 — Web application plus background worker

- Status: Accepted
- Date: Starter
- Decision owner: Engineering

### Context

Batch analysis must not block a browser request and must tolerate partial failures.

### Decision

Use Next.js for web/API boundaries and a separate queue-consuming TypeScript worker.

### Consequences

- Clear processing states and retries.
- One additional deployable service.
- Shared TypeScript contracts reduce drift.

## ADR-006 — Synthetic data only in the demo

- Status: Accepted
- Date: Starter
- Decision owner: Security/Product

### Context

The source material is confidential and resumes contain personal data.

### Decision

Use generated resumes and fake accounts only.

### Consequences

- Demo does not prove production privacy readiness.
- A later pilot requires a separate data and legal review.

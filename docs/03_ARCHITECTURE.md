# Architecture — HireLens MVP

## 1. Architecture goals

- Prove one complete hiring judgment flow.
- Process application batches without web-request timeouts.
- Preserve page-level evidence and version traceability.
- Keep final decisions in a human-authorized path.
- Remain simple enough for rapid Codex-driven development.

## 2. Context diagram

```text
Recruiter / Hiring Manager / Admin
                 │
                 ▼
        Next.js Web Application
      UI + server actions/handlers
          │         │        │
          │         │        └─────────────┐
          ▼         ▼                      ▼
     Supabase     Private Storage      OpenAI API
 Auth/Postgres      resume PDFs       scorecard/evidence
     │                 │                   ▲
     │                 ▼                   │
     └────────── Supabase Queue ──► Edge Function
                      Cron + PDF.js + validation
```

## 3. Component responsibilities

### `apps/web`

- authentication and role-aware routes,
- job/scorecard management,
- resume upload,
- progress and failure UI,
- evidence review,
- human decision forms,
- typed workflow and decision histories.

### `supabase/functions/process-evidence-queue`

- authenticated, scheduled single-message queue consumption,
- PDF extraction,
- model calls,
- structured output validation,
- evidence source validation,
- processing status updates,
- durable settlement only after a terminal result or explicit retry handoff.

`apps/worker` retains the shared processor and a temporarily available Node
poller solely as the rollback path until the deployed Alpha Edge smoke test
passes. It must not consume the queue at the same time as the Edge Function.

### `packages/domain`

- enums,
- state machines,
- domain errors,
- role and permission rules,
- shared DTOs that are not provider-specific.

### `packages/ai`

- JSON/Zod contracts,
- versioned prompts,
- model adapter,
- output normalization,
- eval utilities.

### `packages/pdf`

- page extraction,
- text normalization,
- quote matching helpers,
- PDF error classification.

### `packages/database`

- typed repositories,
- transaction helpers,
- typed workflow-history repositories,
- queue and storage adapters.

### `supabase`

- migrations,
- RLS policies,
- storage policies,
- synthetic seed data.

## 4. Why web app + worker

Analyzing 20–200 resumes is a batch process. A synchronous web request would create timeout, retry, and partial-failure problems.

The web app should:

1. create durable records,
2. upload files,
3. enqueue tasks,
4. return immediately.

The worker should:

1. pull a task,
2. claim an idempotent processing run,
3. extract pages,
4. call the model,
5. validate evidence,
6. commit results,
7. acknowledge the task.

## 5. Planned technology choices

| Concern            | Choice                           | Reason                                                     |
| ------------------ | -------------------------------- | ---------------------------------------------------------- |
| Web                | Next.js App Router + TypeScript  | one repository for UI and server boundaries                |
| UI                 | Tailwind + shadcn/ui             | fast, accessible business UI                               |
| Database           | Supabase PostgreSQL              | relational workflow and strong constraints                 |
| Auth               | Supabase Auth                    | role-backed demo authentication                            |
| Files              | Supabase Storage                 | private PDF storage                                        |
| Queue              | Supabase Queues                  | durable background jobs near the data                      |
| Worker             | Supabase Edge Function           | queue-local deployment without a separate always-on host   |
| PDF                | PDF.js                           | page-aware text extraction and rendering                   |
| AI                 | OpenAI Responses API             | direct structured model requests                           |
| Runtime validation | Zod + JSON Schema                | untrusted boundary validation                              |
| Unit tests         | Vitest                           | fast TypeScript tests                                      |
| E2E                | Playwright                       | real browser flow                                          |
| Hosting            | Vercel + Supabase Edge Functions | web and bounded background processing without a third host |

Package and service versions must be verified and pinned during scaffolding.

## 6. Request and processing sequence

```text
1. Web validates job and approved scorecard.
2. Web creates candidate/application/file records in a transaction.
3. Web uploads PDF to private storage.
4. Web enqueues a task containing opaque IDs, not resume text; the database schedules a secret-protected Edge invocation after the transaction commits.
5. The immediate Edge invocation reads one task and creates a leased processing attempt. The one-minute Cron remains a fallback for missed wake-ups, transient invocation failures, and lease recovery while consumer mode is `EDGE`.
6. The Edge consumer extracts and stores page text.
7. The Edge consumer calls AI with minimum required data.
8. The Edge consumer validates strict output.
9. The Edge consumer verifies each quote against page text.
10. A fenced heartbeat renews the lease during long extraction or model calls. The Edge consumer stores evidence, marks the attempt complete, and only then archives the queue message.
11. Web subscribes or polls for progress.
12. Human reviews and writes a decision through an authorized path.
13. Domain-owned processing and decision records retain the relevant history.
```

The preceding business workflow is enforced at the web/domain boundary:

```text
Hiring Manager creates Requisition + screening criteria
→ Requisition Approver approves or returns it
→ Recruiter publishes the approved posting
→ synthetic candidate submits a PDF
→ worker produces validated evidence
→ Recruiter requests Hiring Manager review
→ Hiring Manager records interview-progression outcome
→ authorized human later records final hiring decision
```

Requisition approval, posting, processing, Recruiter review request, Hiring
Manager interview-progression outcome, and final human decision are separate
state machines. `ADMIN` operates the system but is not a requisition business
approver.

## 7. AI boundary

AI is used for two bounded capabilities:

1. scorecard draft and ambiguous-language detection,
2. criterion-level evidence extraction and follow-up question suggestions.

AI is not a general autonomous recruiting agent. It does not send email, move candidates, schedule interviews, or decide outcomes in P0.

## 8. Data and version boundary

Every evidence row references:

- application,
- resume file and page,
- criterion,
- scorecard version,
- processing run,
- prompt version,
- schema version,
- model ID.

This allows a reviewer to distinguish a changed criterion from a changed model or changed resume.

## 9. Error strategy

Errors are explicit domain states.

- `NEEDS_OCR`: source has no extractable text.
- `RETRY_PENDING`: transient dependency failure.
- `FAILED`: non-retryable document or infrastructure failure.
- `QUARANTINED`: AI output failed source or contract validation.

A batch is not all-or-nothing.

## 10. Environment plan

### Shared developer and Alpha backend

- one hosted Alpha Supabase project,
- local Next.js for development and a remotely invoked Alpha Edge consumer,
- deployed web and Supabase Edge consumer for Alpha,
- shared synthetic seed, Auth users, PostgreSQL, and private Storage,
- no Docker Supabase containers during normal development.

Local development and Alpha use the same project ref, URL, publishable key, server key, database, Auth users, and Storage bucket. Only `APP_ENV` differs: `development` locally and `alpha` during Alpha deployment operations. The Edge consumer uses Supabase-managed server secrets, a custom Cron invocation secret, service-role-only fenced RPCs, and a database-owned `NODE`/`EDGE` consumer-mode gate. The repository still keeps a local Supabase configuration for migration metadata; it is not the application database and Docker is not used by this workflow.

Because the environments share data, all data remains synthetic for the demo. Destructive reset is never allowed against the hosted Alpha project; migrations are forward-only and operational reset is a separate guarded workflow.

### Production-like pilot

Not part of this starter. It would require separate privacy review, customer-owned access, retention rules, operational monitoring, backup, and incident processes.

## 11. Explicitly deferred architecture

- microservices,
- Kubernetes,
- vector database,
- fine-tuning,
- event bus beyond the durable queue,
- multi-tenant SaaS abstractions,
- enterprise SSO,
- cross-platform applicant identity resolution.

Add these only after a measured requirement exists.

## 12. Observability

Record structured metadata:

- correlation ID,
- processing run ID,
- task duration,
- model ID,
- prompt/schema version,
- token usage,
- error category,
- retry attempt.

Do not record raw resumes, quotes, names, email addresses, phone numbers, signed URLs, or secrets in telemetry.

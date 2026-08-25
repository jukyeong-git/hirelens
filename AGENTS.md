# AGENTS.md — HireLens Repository Instructions

## Mission

Build HireLens as an evidence-first hiring judgment support system.

The product must help humans review every application faster and preserve decision reasons. It must not replace the final hiring judgment.

## Read before changing code

Use this source-of-truth order:

1. `docs/01_PRD.md`
2. `docs/05_AI_CONTRACTS.md`
3. `docs/06_SECURITY_PRIVACY.md`
4. `docs/04_DATA_MODEL.md`
5. `docs/03_ARCHITECTURE.md`
6. `TASKS.md`
7. The nearest nested `AGENTS.md`

When documents conflict, stop and report the conflict. Do not silently choose one.

## Git branch policy

- Do not commit or push ordinary work unless the user explicitly requests it.
- When explicitly requested, commit and push ordinary work to `develop` only.
- Do not merge, fast-forward, push, or otherwise update `alpha` or `main`
  unless the user explicitly requests that branch operation.

## Non-negotiable product invariants

1. **Human-only final decision**
   - AI must never accept, reject, advance, or close an applicant.
   - Only an authenticated human with the correct role may save a hiring decision.

2. **Evidence, not verdict**
   - Do not present a single authoritative fit score.
   - Present criterion-level status, exact resume evidence, page location, uncertainty, and suggested follow-up questions.

3. **Careful absence language**
   - `NOT_FOUND` means: no supporting evidence was found in the submitted material.
   - It must never be rendered as: the candidate does not have the capability.

4. **Traceability**
   - Every analysis result must store the scorecard version, prompt version, model identifier, processing run, and source page.
   - Every human decision must store actor, timestamp, reason, and prior value when changed.

5. **Approved criteria only**
   - Draft scorecards cannot be used for candidate analysis.
   - Scorecard changes create a new immutable version; do not overwrite a version already used.

6. **Demo data only**
   - Use synthetic or explicitly anonymized resumes.
   - Never commit confidential problem files, real resumes, API keys, access tokens, or raw personal data.

7. **No sensitive inference**
   - Do not infer protected traits, personality, culture fit, health, family status, age, gender, ethnicity, religion, disability, or other job-irrelevant attributes.
   - Do not analyze faces, voices, photos, names, or addresses.

8. **Append-only audit**
   - Audit events are append-only.
   - Do not expose update/delete paths for audit events in application code.

## MVP scope

P0 vertical flow:

```text
Job
→ scorecard draft
→ human approval and version
→ PDF batch upload
→ page text extraction
→ criterion-level evidence extraction
→ recruiter review
→ hiring-manager review
→ human decision
→ audit trail
```

P1 only after P0 passes:

- Slack review notifications and reminders
- Google Calendar interview scheduling
- Candidate email communication
- Real recruiting-platform integrations
- OCR for image-only PDFs

Explicitly out of scope:

- Full HRIS, payroll, onboarding, offers, e-signatures
- Automatic rejection or acceptance
- Success prediction, personality prediction, face/voice analysis
- Fine-tuning
- Vector database without a demonstrated retrieval requirement
- Microservices or Kubernetes for the demo
- Broad Workday feature cloning

## Planned stack

- `pnpm` workspace
- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase PostgreSQL, Auth, Storage, Queues
- Node.js TypeScript worker
- PDF.js
- OpenAI Responses API with Structured Outputs
- Zod for runtime contracts
- Vitest and Playwright

Do not hardcode cloud model names, URLs, secrets, tenant IDs, or bucket IDs. Use validated environment variables.

## Coding rules

- TypeScript strict mode is required.
- Prefer small domain modules over large utility files.
- Keep domain types and state transitions in `packages/domain`.
- Keep AI schemas, prompts, and prompt versions in `packages/ai`.
- Keep PDF extraction in `packages/pdf`.
- Keep database access behind typed repository functions.
- Use server-side code for secret-bearing operations.
- Browser code may use only publishable keys and RLS-protected access.
- Do not log resume text, email, phone, address, signed URLs, tokens, or model prompts containing personal data.
- Treat all model output as untrusted input and validate it before storage.
- Prefer explicit enums and state machines over free-form strings.
- Use UTC in storage and localize only at the UI boundary.
- Avoid unrelated refactors while implementing a feature.
- Do not add a production dependency without explaining why the existing stack cannot solve the need.

## UI rules

- Default to an evidence-first layout.
- Candidate status and criterion status must be distinguishable.
- Show loading, empty, partial, retryable error, fatal error, and unauthorized states.
- A user must be able to reach the source page from every evidence item.
- Do not use color as the only status signal.
- All interactive controls require accessible names and keyboard operation.
- Destructive or external actions require explicit confirmation.

## AI rules

- Use Structured Outputs and a strict schema.
- Validate that every quote is an exact normalized substring of the referenced resume page before persistence.
- Reject or quarantine invalid page numbers, unknown criterion IDs, invalid enums, or fabricated quotes.
- Keep prompt text and schema versioned.
- Use `store: false` for model requests unless a reviewed product decision says otherwise.
- A model refusal, incomplete response, timeout, or schema failure is a processing state, not an applicant decision.
- Retry only bounded, transient failures.
- Never retry a policy refusal as if it were a network failure.

## Database and migration rules

- All schema changes use committed migrations.
- Every user-facing table must have an explicit RLS decision.
- Add indexes for foreign keys and primary list filters.
- Seed files contain synthetic data only.
- Migrations must be repeatable on a clean local database.
- Never edit a previously applied migration; add a new one.
- Do not rely on dashboard-only manual changes.

## Intended commands

These commands form the repository contract. If scaffolding has not created one yet, add it deliberately or document the replacement.

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm eval:ai
pnpm build
pnpm db:start
pnpm db:reset
```

## Work process

Before coding:

1. Read the relevant docs and nearest `AGENTS.md`.
2. State the acceptance criteria being implemented.
3. Identify affected data, UI, AI, security, and tests.
4. Prefer one complete vertical slice over several partial features.
5. Ask only when a missing decision materially changes the architecture or user outcome.

During coding:

1. Make the smallest defensible change.
2. Keep migrations, schemas, prompts, UI, and tests synchronized.
3. Add failure handling with the happy path.
4. Preserve current behavior unless the PRD explicitly changes it.
5. Update `TASKS.md` and relevant docs when behavior changes.

Before finishing:

1. Run the narrow tests first.
2. Run lint, typecheck, relevant integration tests, E2E, and build.
3. Run AI evals for any prompt, schema, model, or extraction change.
4. Review the diff for secrets and personal data.
5. Report what changed, what was tested, and remaining risk.

Do not claim tests passed unless they were actually run.

## Definition of done

A change is done only when:

- Acceptance criteria are met.
- Unauthorized access is denied.
- Empty/error/retry states exist.
- Audit behavior is preserved.
- Tests cover the changed behavior.
- Documentation and task state are updated.
- No real personal data or secret is present.
- A human remains the final decision maker.

## Subagent orchestration

Use subagents to reduce context noise, not to create uncontrolled parallel editing.

Recommended sequence for a substantial feature:

1. Spawn `product_guardian` and `code_mapper` in parallel.
2. Wait for both summaries.
3. Use exactly one relevant write agent:
   - `frontend_builder`
   - `backend_builder`
   - `ai_evidence_engineer`
4. After implementation, run `security_reviewer`.
5. Then use `qa_engineer` to close test gaps.

Do not run two write agents against the same files concurrently.

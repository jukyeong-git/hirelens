# Codex Agent and Skill Catalog

## 1. Important distinction

This repository defines **development-time Codex subagents**.

The HireLens runtime product is not designed as an autonomous multi-agent recruiting system. Runtime AI is limited to:

1. scorecard drafting,
2. criterion-level evidence extraction.

## 2. Custom Codex agents

Custom agent files live in `.codex/agents/`.

| Agent | Mode | Use when | Expected output |
|---|---|---|---|
| `product_guardian` | read-only | validating scope, PRD, acceptance criteria | blockers, scope drift, missing decisions |
| `code_mapper` | read-only | finding affected files and execution paths | file/symbol map and dependency path |
| `frontend_builder` | workspace-write | implementing web UI and user flows | focused UI code plus tests |
| `backend_builder` | workspace-write | migrations, APIs, queue, worker infrastructure | safe backend slice plus tests |
| `ai_evidence_engineer` | workspace-write | prompts, schemas, extraction, evals | versioned AI contract plus regression report |
| `security_reviewer` | read-only | reviewing RLS, secrets, PII, logs, storage | severity-ranked findings with file refs |
| `qa_engineer` | workspace-write | closing unit/integration/E2E gaps | tests, fixtures, exact commands and results |

## 3. Repository skills

Skills live in `.agents/skills/<skill-name>/SKILL.md`.

| Skill | Trigger/use |
|---|---|
| `$vertical-slice` | implement one feature across data, API, UI, tests, docs |
| `$scorecard-contract` | create or change criteria, approval, and scorecard versioning |
| `$evidence-pipeline` | build or change PDF-to-evidence processing |
| `$ai-contract-change` | change prompt, model adapter, schema, or AI output |
| `$supabase-safe-change` | create migrations, RLS, storage policy, and seed changes |
| `$ats-ui` | build evidence-first ATS screens and states |
| `$privacy-gate` | review a diff for PII, secret, access, retention, and AI data risks |
| `$demo-readiness` | run final checks, reset, eval, E2E, and deployment smoke test |

## 4. Recommended orchestration recipes

### New substantial feature

```text
1. product_guardian: verify scope and acceptance criteria.
2. code_mapper: map current execution path.
3. Wait for both.
4. One write agent implements the slice.
5. security_reviewer reviews.
6. qa_engineer closes test gaps.
```

### AI pipeline change

```text
1. product_guardian confirms the change does not create an AI verdict.
2. ai_evidence_engineer uses $ai-contract-change.
3. security_reviewer checks PII and provider data handling.
4. qa_engineer verifies golden eval and failure paths.
```

### UI flow change

```text
1. code_mapper identifies route, server boundary, and domain types.
2. frontend_builder uses $ats-ui and $vertical-slice.
3. product_guardian reviews wording and human/AI separation.
4. qa_engineer adds Playwright coverage.
```

### Database change

```text
1. backend_builder uses $supabase-safe-change.
2. security_reviewer checks RLS and secret-key boundaries.
3. qa_engineer runs clean reset and authorization tests.
```

## 5. Parallelism rule

Parallelize read-heavy work. Serialize write-heavy work.

Good parallel pair:

- `product_guardian`
- `code_mapper`
- `security_reviewer` after implementation

Avoid:

- `frontend_builder` and `backend_builder` editing shared domain schemas at the same time,
- `backend_builder` and `ai_evidence_engineer` changing the same worker pipeline concurrently.

## 6. Codex commands

- `/skills` — inspect available skills
- `$skill-name` — explicitly invoke a skill
- `/agent` — inspect or switch subagent threads in the CLI

If new agents or skills do not appear, restart Codex and verify the project is trusted and launched from the repository.

## 7. When to create another agent

Create a new agent only when all are true:

- the responsibility is repeated,
- it needs distinct instructions or permissions,
- it can return a bounded output,
- it does not duplicate an existing role.

Do not create one agent per ticket.

## 8. When to create another skill

Create a skill when a prompt/workflow is repeatedly reused or repeatedly corrected.

A good skill has:

- a narrow trigger,
- clear “use” and “do not use” boundaries,
- a deterministic sequence,
- explicit validation,
- a concise output contract.

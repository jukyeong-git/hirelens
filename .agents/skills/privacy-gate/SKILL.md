---
name: privacy-gate
description: "Review a HireLens change for PII, secrets, authorization, storage, logs, AI retention, audit integrity, and unsafe hiring inference. Use before merge or demo release."
---

# Privacy Gate Workflow

## Inspect

- Git diff and untracked files,
- environment variable usage,
- browser bundles,
- RLS and server authorization,
- storage bucket and URL generation,
- logs, analytics, Sentry metadata,
- prompts and model options,
- fixtures and seed,
- audit payloads,
- demo reset.

## Blockers

Treat as blocking:

- real resume or confidential file committed,
- secret key in browser or Git,
- missing RLS on exposed data,
- public resume file,
- raw PII in logs,
- model output persisted without source validation,
- AI/worker path writing human decisions,
- mutable audit history,
- protected-trait or personality inference.

## Output

Return severity-ranked findings with exact file references and the smallest remediation.
If no blocker exists, state what was checked and residual risk.
Do not provide a generic checklist without examining the change.

---
name: demo-readiness
description: "Validate HireLens for a live demo: deterministic synthetic reset, quality gates, AI eval, E2E, security checks, deployment smoke test, and fallback plan. Use immediately before 발표·데모."
---

# Demo Readiness Workflow

## Run in order

1. Verify environment is demo, not production.
2. Reset deterministic synthetic data.
3. Run lint and typecheck.
4. Run unit and integration tests.
5. Run RLS denial tests.
6. Run AI golden eval.
7. Run Playwright happy path and one failure path.
8. Run build.
9. Smoke test deployed URL.
10. Scan Git and logs for secrets and real PII.
11. Verify model quota and timeout fallback.
12. Rehearse `docs/09_DEMO_SCRIPT.md`.

## Required demo cases

- ambiguous criterion becomes interview-only,
- direct evidence with exact page,
- partial evidence with uncertainty,
- NOT_FOUND careful wording,
- one failed/NEEDS_OCR file,
- human decision and audit timeline.

## Output

Return only:

- ready/not ready,
- blockers,
- test commands and actual results,
- fallback status,
- last reset time and seed version.
Do not hide skipped checks.

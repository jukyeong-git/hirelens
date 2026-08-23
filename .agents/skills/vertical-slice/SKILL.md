---
name: vertical-slice
description: "Implement one complete HireLens feature slice across domain, data, server, UI, tests, and docs. Use for 기능 추가·수직 슬라이스; do not use for broad refactors or research-only tasks."
---

# Vertical Slice Workflow

## Preconditions

1. Read root and nearest `AGENTS.md`.
2. Read the relevant PRD acceptance criteria.
3. State the exact user outcome.
4. Confirm the change does not delegate final hiring judgment to AI.

## Steps

1. Map the current route, domain type, persistence path, UI, and tests.
2. Define the smallest end-to-end behavior.
3. Add or update domain contracts first.
4. Add migration/repository/API behavior when required.
5. Add UI with loading, empty, partial, failure, unauthorized, and stale states.
6. Add unit and integration tests.
7. Add or update Playwright coverage for user-visible behavior.
8. Update `TASKS.md` and relevant docs.
9. Run lint, typecheck, tests, and build.

## Guardrails

- Do not start several partial features.
- Do not add a production dependency without justification.
- Do not create automatic accept/reject behavior.
- Do not hide missing backend work behind fake UI state.
- Do not claim completion when a layer is mocked unless the acceptance criteria explicitly allow it.

## Output

Report:

- acceptance criteria completed,
- files changed by layer,
- tests actually run and results,
- unresolved risks or follow-up.

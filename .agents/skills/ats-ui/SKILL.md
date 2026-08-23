---
name: ats-ui
description: "Build evidence-first HireLens ATS UI with dense business workflows, accessible states, source-page traceability, and clear human-vs-AI separation. Use for 후보자·평가·감사 UI."
---

# ATS UI Workflow

## Design principles

- Evidence before interpretation.
- Human action separate from AI output.
- No authoritative global fit score.
- `NOT_FOUND` means “제출 자료에서 근거를 찾지 못함.”
- Source page reachable from every quote.
- Status uses text, icon, and color.
- Keyboard and screen-reader operation are required.

## Required UI states

- loading,
- empty,
- partial,
- retryable failure,
- fatal failure,
- unauthorized,
- stale version.

## Candidate detail hierarchy

1. approved criterion and definition,
2. evidence status,
3. exact quote and page,
4. AI interpretation,
5. uncertainty,
6. suggested question,
7. human notes and decision.

## Review form

- decision,
- structured reason,
- confidence,
- optional note/question,
- actor and timestamp after save.

## Tests

Add Playwright coverage for at least:

- source page opening,
- NOT_FOUND wording,
- decision reason requirement,
- unauthorized access,
- partial processing.

# Web App Instructions

These instructions extend the repository root `AGENTS.md` for `apps/web`.

## Responsibility

The web app owns:

- authentication UI and role-aware navigation,
- job and scorecard screens,
- resume upload and processing progress,
- evidence-first candidate review,
- human decision forms,
- audit timeline display.

It does not own PDF parsing, model prompts, queue consumption, or privileged database shortcuts.

## Next.js rules

- Use App Router.
- Prefer Server Components for data loading and static composition.
- Use Client Components only for browser state, file input, dialogs, or interactive tables.
- Keep server-only modules behind explicit server boundaries.
- Do not import secret-bearing clients into browser bundles.
- Validate form inputs on both client and server.
- Route handlers and server actions must authorize the current user before accessing data.

## UI domain rules

- Never label an AI output as a final recommendation.
- Do not expose a single fit percentage as the primary decision aid.
- Render criterion statuses using text, icon, and color.
- For `NOT_FOUND`, render: “제출 자료에서 근거를 찾지 못함.”
- Always show uncertainty when provided.
- Every evidence item needs a source-page action.
- Human decisions must show the actor and time.
- `DO_NOT_PROCEED` requires a structured reason.
- A draft scorecard must be visibly different from an approved version.

## Required states

Each asynchronous screen must cover:

- loading,
- empty,
- partial completion,
- retryable failure,
- fatal failure,
- unauthorized,
- stale-version conflict.

## Accessibility

- Keyboard operation is required.
- Use semantic tables, labels, headings, dialogs, and alerts.
- Do not use placeholder text as the only label.
- Preserve focus after dialogs and async mutations.
- Announce processing updates without excessive live-region noise.

## Testing

For user-visible behavior:

- unit test formatting and state mapping,
- component test critical forms when practical,
- Playwright test the complete P0 flow,
- include at least one unauthorized and one retry/error case.

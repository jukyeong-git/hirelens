---
name: scorecard-contract
description: "Create or change HireLens job scorecard criteria, ambiguity handling, human approval, and immutable versioning. Use for 평가 기준·직무 스코어카드 changes; not for candidate ranking."
---

# Scorecard Contract Workflow

## Invariants

- AI output is a draft.
- A human hiring manager approves the scorecard.
- Only approved versions may analyze resumes.
- Approved versions are immutable.
- Editing creates a new version.
- Human qualities that cannot be verified from a resume default to `INTERVIEW_ONLY`.

## Steps

1. Identify the source job-description phrase.
2. Classify each criterion as `REQUIRED`, `PREFERRED`, or `INTERVIEW_ONLY`.
3. Define:
   - criterion meaning,
   - accepted evidence,
   - alternative evidence,
   - whether resume assessment is allowed.
4. Update strict AI schema and domain types if necessary.
5. Update migration and version constraints.
6. Update the editor and approval UI.
7. Add tests for:
   - draft cannot analyze,
   - approval authorization,
   - immutable approved version,
   - new version creation,
   - ambiguous phrase behavior.
8. Run AI eval if prompt/schema changed.

## Do not

- add a fit score,
- infer culture fit or personality,
- make an AI draft active automatically,
- overwrite a version already used by a processing run.

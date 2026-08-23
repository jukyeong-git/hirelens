# Product Brief — HireLens

## 1. Source-derived problem facts

The following facts come from the provided Builderthon problem brief for the Judgment Track.

- Codepresso plans to hire more than 20 people over the next year.
- Recruiting is handled by one dedicated person who also performs payroll and general administration work.
- There is no ATS; work is spread across two recruiting platforms, the company website form, Excel, Slack, and Google Calendar.
- A backend-engineer opening receives about 200 applications over four weeks.
- Only about 40 applications are actually opened and reviewed; roughly 160 are closed without review.
- A resume takes about 3–5 minutes to review, while the recruiter has around two hours per day for review.
- Hiring-manager feedback takes around 3–5 days and often consists of a one-line answer without reasons.
- Interview scheduling requires around 4–6 emails and 2–3 days.
- Submission to first-interview guidance takes around 8–10 days.
- About half of candidates who pass document review are identified in interviews as role mismatches.
- Hiring decisions and reasons are scattered across memory and Slack; there is no durable decision record.
- Management explicitly does not want the final hire/reject judgment delegated to a machine.

## 2. Problem statement

Codepresso lacks both:

1. enough time to review and make human judgments, and
2. durable, structured evidence explaining those judgments.

The central problem is not merely the absence of an ATS. A general tracking system can centralize records while leaving the core judgment bottleneck unchanged.

## 3. Product thesis

> If a system converts ambiguous role language into an approved scorecard, examines every submitted resume for criterion-level evidence, and captures a human’s decision with reasons, then the team can review more candidates faster without delegating final hiring judgment to AI.

## 4. Product definition

HireLens is an **evidence-first AI hiring judgment support ATS**.

It provides:

- job and application tracking,
- scorecard creation and human approval,
- bulk resume processing,
- criterion-level evidence extraction,
- source-page traceability,
- fast structured human review,
- versioned decisions and audit history.

## 5. Primary users

### Recruiter

Needs to:

- intake all applications,
- understand technical evidence without pretending to be the final technical evaluator,
- identify which candidates need human review,
- avoid manual copying and repeated follow-up,
- preserve decision reasons.

### Hiring manager

Needs to:

- clarify what evidence counts for the role,
- review candidates quickly,
- leave a usable reason rather than a one-line Slack response,
- formulate interview questions for unclear areas.

### Admin or project owner

Needs to:

- configure users and roles,
- inspect processing failures,
- review audit history,
- reset synthetic demo data.

## 6. Core value proposition

- **Coverage:** every submitted application enters the reviewable pipeline.
- **Speed:** repeated extraction and summarization work moves to the system.
- **Evidence:** each criterion is linked to source text and page.
- **Consistency:** approved scorecards and reason codes structure review.
- **Learning:** decisions become organizational records instead of disappearing in chat.

## 7. MVP design decisions made by this team

These are not stated in the source brief; they are implementation choices.

- Start with one backend-engineer job.
- Demo with 20 synthetic PDF resumes while designing the pipeline for about 200.
- Support text PDFs in P0; image-only PDFs become `NEEDS_OCR`.
- Do not build automatic reject/accept.
- Do not use a single global fit score as the main UI.
- Defer Slack, Calendar, email, and recruiting-platform integrations to P1.
- Use a web app plus a background worker rather than microservices.

## 8. Success metrics

The source provides current baselines but not target values. Targets require customer confirmation.

| Metric | Source baseline | Target |
|---|---:|---|
| Applications actually reviewed | about 40 of 200 | TBD |
| Submission to first interview guidance | 8–10 days | TBD |
| Document-pass candidates later found mismatched | about half | TBD |
| Decisions with structured reasons | effectively none | TBD |
| Manual scheduling effort | 4–6 emails, 2–3 days | P1 / TBD |

For the demo, use functional and quality gates in `docs/07_TEST_AND_EVAL_PLAN.md` rather than inventing business target numbers.

## 9. Non-goals

- Replacing human hiring decisions
- Predicting future employee performance
- Inferring personality or culture fit
- Analyzing photo, face, voice, name, address, or protected traits
- Rebuilding a full enterprise HR suite
- Training a proprietary model during the MVP
- Claiming legal or regulatory compliance solely from this prototype

## 10. Open customer questions

- Which role is the first pilot role?
- What are the approved required, preferred, and interview-only criteria?
- What evidence level counts as “operational experience” for each technical criterion?
- Which criteria may be evaluated from a resume and which must be human-only?
- What current and target SLA should apply to each review stage?
- What actual data may be used and under what anonymization policy?
- Which person approves scorecard versions and final acceptance criteria?

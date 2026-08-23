# Security and Privacy — HireLens Demo

## 1. Scope

This document defines controls for the demo. It is not a declaration of legal compliance and does not replace a production privacy, security, or labor-law review.

## 2. Data policy

### Allowed

- synthetic job descriptions,
- synthetic resumes,
- clearly fake user accounts,
- fake candidate labels,
- generated test email addresses using reserved/example domains where possible.

### Prohibited

- real applicant resumes,
- real phone numbers or addresses,
- customer confidential documents in Git,
- copied Slack messages containing personal data,
- production access tokens,
- shared Gmail passwords,
- raw source documents in logs or analytics.

The provided challenge document is confidential and must not be committed to the repository.

## 3. Primary threats

1. resume file exposed through a public bucket or long-lived URL,
2. secret key included in browser bundle,
3. weak or missing RLS,
4. raw resume text copied into logs, audit, or error trackers,
5. model output trusted without source validation,
6. unauthorized user writes a decision,
7. AI code path changes a decision,
8. prompt/model provider retains sensitive data unexpectedly,
9. synthetic demo accidentally switched to real customer data,
10. destructive demo reset executed against the wrong environment.

## 4. Required controls

### Authentication and authorization

- authenticated access only,
- explicit roles,
- server-side authorization on every write,
- RLS default deny,
- assignment-based access,
- no client-provided role trust.

### Supabase keys

- browser: publishable key only,
- server/worker: secret key only in server environments,
- never place secret keys in `NEXT_PUBLIC_*`,
- rotate immediately if exposed,
- privileged server access still performs application authorization.

### Resume storage

- private bucket,
- opaque storage path,
- short-lived signed access or authorized server stream,
- file type and size validation,
- no public CDN caching,
- deletion workflow for file and derived artifacts.

### Model requests

- synthetic data in demo,
- minimize direct identifiers,
- use `store: false` by default,
- send only required pages and criteria,
- no model request body in application logs,
- provider key exists only on server/worker.

### Logging and monitoring

Allowed log fields:

- opaque IDs,
- correlation ID,
- processing status,
- duration,
- error category,
- model and prompt version,
- token counts.

Do not log:

- resume text or quote,
- name, email, phone, address,
- signed URL,
- access token,
- API key,
- full prompt,
- full model output containing resume content.

### Audit

Audit records store actions and references, not raw personal content.

## 5. RLS security tests

At minimum prove:

- unauthenticated users cannot read any job or resume,
- a hiring manager cannot read an unassigned job,
- a recruiter cannot approve a scorecard unless explicitly authorized,
- a worker cannot create human review rows,
- application roles cannot update/delete audit rows,
- browser credentials cannot access secret-only operations.

## 6. Demo reset safety

- environment variable `APP_ENV=demo` required,
- command refuses to run when `APP_ENV=production`,
- reset targets an explicit known project ID,
- confirmation or CI-controlled guard required,
- reset data contains only synthetic records.

## 7. Dependency and supply-chain controls

- lockfile committed,
- dependencies pinned by the package manager,
- minimal dependencies,
- no unreviewed install scripts when avoidable,
- automated dependency alerts,
- no package added solely because an AI agent suggested it.

## 8. Secure coding checklist

- [ ] Inputs validated at every external boundary.
- [ ] Authorization checked server-side.
- [ ] RLS migration and denial tests included.
- [ ] No secret in browser bundle.
- [ ] No PII in logs or telemetry.
- [ ] Storage private and paths opaque.
- [ ] Model output validated and quote-checked.
- [ ] Human decision route separated from worker credentials.
- [ ] Audit append-only.
- [ ] Demo fixtures synthetic.
- [ ] Reset guarded by environment.
- [ ] Diff scanned before merge.

## 9. Production pilot gaps

Before real data:

- customer-owned accounts and access transfer,
- retention and deletion policy,
- data processing agreement,
- model-provider data-control review,
- security incident process,
- backup and restore,
- monitoring and on-call ownership,
- consent/notices and applicant communication,
- bias and fairness evaluation,
- legal review of hiring workflow.

These are deliberately outside the demo but must not be forgotten.

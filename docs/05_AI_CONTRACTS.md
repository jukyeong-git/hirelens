# AI Contracts — HireLens MVP

## 1. Purpose

This document constrains AI behavior so that model output remains:

- evidence-based,
- source-verifiable,
- structurally valid,
- clearly separate from human judgment.

Model output is always untrusted input.

## 2. Allowed AI capabilities

### Capability A — Job Requisition draft

Input:

- human-provided job title,
- department,
- no hiring need or other internal rationale.

Output:

- exactly four editable fields: 역할 개요, 주요 책임, 자격 요건, 우대 사항;
- no benefits, working conditions, compensation, location, employment, or
  company-policy section.

The Hiring Manager explicitly requests this capability before a requisition is
saved. The output is transient and cannot create, save, submit, approve, return,
publish, assign, rank, or make any candidate or hiring decision. It may not
invent compensation, legal/eligibility language, company policy, or
protected-trait preferences. A human must review and explicitly save the final
description.

### Capability B — Review Framework draft

Input:

- raw job description,
- optional human clarification.

Output:

- ambiguous phrases,
- draft criteria,
- suggested criterion type,
- accepted and alternative evidence,
- whether the criterion is resume-assessable.

A Hiring Manager or Admin may generate this proposal explicitly. The result is
transient and fills the same structured editor used for manual drafting; it is
not persisted until a human explicitly saves the edited draft. Recruiters are
read-only for this workflow. A human must edit as needed and approve the saved
version before it can be used for analysis.

### Capability C — Resume evidence extraction

Input:

- one approved scorecard version,
- page-numbered resume text with minimized direct identifiers.

Output:

- criterion-level evidence status,
- exact source quote and page when applicable,
- interpretation,
- uncertainty,
- suggested interview question.

The output never includes a final hiring decision.

### Capability D — Review Framework revision proposal

Input:

- one deterministic `REVIEW_REQUIRED` criterion finding,
- the current approved criterion,
- finding statistics,
- minimized exact excerpts from mismatched and matched observations.

Output:

- the immutable finding lineage ID,
- one bounded change type,
- an exact before snapshot,
- one editable after criterion,
- a concise rationale.

The assigned Hiring Manager or Admin must explicitly request this capability.
The output is transient, cannot create or approve a framework version, and
cannot trigger reanalysis. A human may save it as an editable draft and must
separately approve that draft through the normal scorecard approval path.

## 2A. Job Requisition draft contract

Illustrative structure:

```json
{
  "role_summary": "...",
  "responsibilities": "...",
  "requirements": "...",
  "preferred_qualifications": "..."
}
```

Rules:

- all object schemas use strict validation and reject unknown keys;
- all four fields are editable drafting suggestions and are never saved by the
  AI request itself;
- the model receives title, department, and any existing human-authored values
  for the four job-description fields as optional reference context; absent
  fields are generated, while internal hiring need remains on the requisition
  record and is excluded from the request;
- prompts and schemas are versioned independently from the Review Framework
  contract; and
- refusal, timeout, incomplete, or invalid output leaves the requisition form
  and its state unchanged.

## 3. Prohibited AI behavior

The model must not:

- accept, reject, advance, or close an application,
- produce a “hire probability” or future performance prediction,
- infer protected or job-irrelevant personal characteristics,
- infer personality or culture fit,
- analyze photo, face, voice, name, age, address, or family information,
- convert missing evidence into a statement that the candidate lacks the capability,
- fabricate a quote or page,
- override the approved scorecard.

## 4. Scorecard draft contract

Illustrative structure:

```json
{
  "ambiguous_phrases": [
    {
      "phrase": "커뮤니케이션이 좋은 분",
      "reason": "이력서만으로 일관되게 검증하기 어려움",
      "suggested_action": "INTERVIEW_ONLY"
    }
  ],
  "criteria": [
    {
      "client_id": "criterion-draft-1",
      "name": "운영 환경 백엔드 개발 경험",
      "type": "REQUIRED",
      "definition": "운영 서비스에서 백엔드 시스템을 개발·운영한 경험",
      "accepted_evidence": ["운영 서비스 책임 범위가 명시됨", "배포 또는 장애 대응 사례가 명시됨"],
      "alternative_evidence": ["유사한 고가용성 서비스 운영 경험"],
      "resume_assessable": true
    }
  ]
}
```

Rules:

- all object schemas use strict validation,
- unknown keys are rejected,
- criterion IDs become authoritative only after persistence and human approval,
- ambiguous human qualities default to human review.

## 5. Evidence extraction contract

Illustrative structure:

```json
{
  "results": [
    {
      "criterion_id": "uuid",
      "status": "PARTIAL",
      "evidence": [
        {
          "page_number": 2,
          "exact_quote": "Kubernetes 기반 배포 파이프라인을 구축했습니다."
        }
      ],
      "interpretation": "Kubernetes 사용 경험은 확인되지만 직접 운영 범위는 불명확합니다.",
      "uncertainty": "장애 대응 및 운영 책임 범위가 기재되어 있지 않습니다.",
      "suggested_interview_question": "직접 운영한 Kubernetes 환경과 장애 대응 사례를 설명해 주세요."
    }
  ]
}
```

Allowed statuses:

```text
SUPPORTED
PARTIAL
NOT_FOUND
CONTRADICTED
HUMAN_ONLY
```

## 5A. Review Framework revision contract

The strict revision output includes `finding_lineage_id`, `change_type`,
`before`, `after`, and `rationale`. The `after` criterion uses the same
structured fields as a Review Framework criterion, including
`excluded_evidence`.

Runtime validation rejects:

- a lineage ID different from the supplied finding,
- a before snapshot different from the approved criterion,
- a change type inconsistent with the after criterion,
- `INTERVIEW_ONLY` with `resume_assessable=true`,
- protected-trait or job-irrelevant criterion language.

Revision requests use the same token and cost budgets as evidence requests,
`store: false`, bounded transient retry, strict Structured Outputs, and safe
usage-only logging. Exact input excerpts are never written to logs or audits.

## 6. Evidence validation pipeline

Before persistence:

1. Validate JSON against the exact schema.
2. Confirm every `criterion_id` belongs to the supplied approved scorecard.
3. Confirm each page number exists.
4. Normalize the quote and source page with the same normalization function.
5. Confirm the normalized quote is an exact substring of the normalized page.
6. Reject empty, truncated, or reconstructed quotes.
7. Compute and store source quote hash.
8. Persist in one transaction with the processing run.

If validation fails:

- do not save the invalid evidence,
- mark the run `QUARANTINED`,
- store a safe error category,
- allow a bounded re-analysis or human-only review.

## 7. Language contract

Use these formulations:

- Good: “제출된 이력서에서 직접적인 운영 경험 근거를 찾지 못했습니다.”
- Bad: “지원자는 운영 경험이 없습니다.”

- Good: “사용 경험은 확인되지만 책임 범위는 불명확합니다.”
- Bad: “역량이 부족합니다.”

- Good: “면접에서 확인해야 합니다.”
- Bad: “컬처핏이 낮습니다.”

## 8. Versioning

Version and store:

- `pipeline_version`
- `prompt_version`
- `schema_version`
- `model_id`
- `scorecard_version_id`

Prompt changes require a new prompt version and AI regression eval.

Schema changes require:

- Zod/JSON Schema update,
- migration impact review,
- fixture update,
- API compatibility review,
- eval update.

## 9. API request policy

- Use the OpenAI Responses API.
- Use Structured Outputs with a strict JSON Schema.
- Configure the model through `OPENAI_MODEL`.
- Use `store: false` by default.
- Use a bounded output token limit.
- Capture request metadata and usage without logging raw resume content.
- Distinguish refusal, incomplete output, timeout, rate limit, and schema failure.

The exact SDK call shape must be verified against official documentation during implementation.

## 10. Prompt construction

Prompt layers:

1. stable system/developer contract,
2. versioned task instructions,
3. approved scorecard,
4. page-numbered, minimized resume text,
5. strict output schema.

Do not place secrets, internal access tokens, or unrelated customer data in prompts.

## 11. PII minimization

Before sending resume text:

- remove or mask name,
- email,
- phone,
- exact address,
- profile photo metadata,
- other direct identifiers not required for evidence extraction.

Preserve job-relevant experience text and stable page numbering.

The demo must use synthetic resumes even with minimization.

## 12. Runtime failure behavior

| Failure            | Processing state                    | Retry                  |
| ------------------ | ----------------------------------- | ---------------------- |
| network timeout    | `RETRY_PENDING`                     | bounded                |
| rate limit         | `RETRY_PENDING`                     | bounded/backoff        |
| refusal            | `FAILED` or reviewed category       | no blind retry         |
| incomplete output  | `RETRY_PENDING` once, then `FAILED` | bounded                |
| schema invalid     | `QUARANTINED`                       | controlled re-analysis |
| fabricated quote   | `QUARANTINED`                       | controlled re-analysis |
| source has no text | `NEEDS_OCR`                         | not in P0              |

No AI failure may create or change a human decision.

## 13. Evaluation requirements

Every prompt or schema change runs the golden set described in `docs/07_TEST_AND_EVAL_PLAN.md`.

Minimum checks:

- schema validity,
- criterion ID validity,
- quote existence,
- page accuracy,
- overclaim detection,
- correct `NOT_FOUND` language,
- no decision field,
- no protected-trait inference.

## 14. Implemented evidence contract versions

- pipeline: `evidence-pipeline-v1`
- prompt: `evidence-extraction-prompt-v2`
- schema: `evidence-extraction-schema-v2`
- model: supplied only by server-side `OPENAI_MODEL`

The worker enforces `store: false`, per-run input/output/total token caps, a
configured micro-USD budget, one retry after the initial attempt, direct
identifier minimization, and exact normalized quote validation before the
transactional persistence RPC. Schema/source failures are quarantined and do
not enter the trusted evidence UI.

Evidence contract v2 supplies each approved criterion's name, definition,
accepted evidence, alternative evidence, partial-evidence guidance, and named
extraction fields. The model must evaluate only those approved criteria. It may
use `PARTIAL` only when the submitted material supports part of the criterion
under the supplied guidance; absence remains `NOT_FOUND`, never a claim that
the candidate lacks the capability. The contract exposes no total score,
ranking, knockout, pass, reject, or advancement field.

The Review Framework draft contract uses
`scorecard-draft-prompt-v3` and `scorecard-draft-schema-v2`. It requests 3–6
concise criteria and uses low reasoning effort, low text verbosity, a 3,500-token
output cap, and one 45-second request timeout for the interactive draft flow.
Timeouts are not retried, so the user can immediately choose to retry or write
the framework directly. AI proposals must return the same human-editable fields
as manual authoring, including optional partial-evidence guidance and extraction
fields. The `ai-pipeline-v2` normalization step preserves only source phrases
that are exact normalized substrings of the job description; unsupported model
phrases are replaced with `null` rather than retained as citations. Generation
itself never saves or approves the framework.

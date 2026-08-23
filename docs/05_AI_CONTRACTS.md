# AI Contracts — HireLens MVP

## 1. Purpose

This document constrains AI behavior so that model output remains:

- evidence-based,
- source-verifiable,
- structurally valid,
- clearly separate from human judgment.

Model output is always untrusted input.

## 2. Allowed AI capabilities

### Capability A — Scorecard draft

Input:

- raw job description,
- optional human clarification.

Output:

- ambiguous phrases,
- draft criteria,
- suggested criterion type,
- accepted and alternative evidence,
- whether the criterion is resume-assessable.

A human must edit and approve the draft.

### Capability B — Resume evidence extraction

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
      "accepted_evidence": [
        "운영 서비스 책임 범위가 명시됨",
        "배포 또는 장애 대응 사례가 명시됨"
      ],
      "alternative_evidence": [
        "유사한 고가용성 서비스 운영 경험"
      ],
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

| Failure | Processing state | Retry |
|---|---|---|
| network timeout | `RETRY_PENDING` | bounded |
| rate limit | `RETRY_PENDING` | bounded/backoff |
| refusal | `FAILED` or reviewed category | no blind retry |
| incomplete output | `RETRY_PENDING` once, then `FAILED` | bounded |
| schema invalid | `QUARANTINED` | controlled re-analysis |
| fabricated quote | `QUARANTINED` | controlled re-analysis |
| source has no text | `NEEDS_OCR` | not in P0 |

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

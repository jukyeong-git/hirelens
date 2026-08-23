---
name: evidence-pipeline
description: "Build or modify HireLens PDF-to-evidence processing: upload, page extraction, queue, AI analysis, source quote validation, retry, and quarantine. Use for 이력서 근거 추출 파이프라인."
---

# Evidence Pipeline Workflow

## Pipeline

```text
private upload
→ durable application/file records
→ queue
→ page extraction
→ PII minimization
→ structured model output
→ source validation
→ evidence persistence
→ visible status
```

## Required behavior

- one idempotency key per application, file, scorecard version, and pipeline version,
- page boundaries preserved,
- image-only PDFs marked `NEEDS_OCR`,
- bounded retries,
- invalid quotes quarantined,
- batch continues when one file fails,
- worker has no human-decision write path.

## Validation

Before storing evidence:

1. validate schema,
2. validate criterion ID,
3. validate page number,
4. exact-normalized quote match,
5. compute quote/source hash,
6. persist in a transaction.

## Tests

- duplicate delivery,
- corrupt PDF,
- image-only PDF,
- timeout and rate limit,
- invalid schema,
- fabricated quote,
- partial batch,
- no AI decision write.

## Do not

- pass secret URLs or direct identifiers unnecessarily,
- log raw resume text,
- infer absence of ability from missing text,
- acknowledge the queue before durable commit.

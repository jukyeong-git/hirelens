---
name: ai-contract-change
description: "Safely change a HireLens AI prompt, model adapter, Structured Output schema, normalization, or model configuration. Use for 프롬프트·모델·AI 스키마 변경; requires versioning and eval."
---

# AI Contract Change Workflow

## Trigger

Use this skill when changing any of:

- prompt instructions,
- JSON/Zod schema,
- model adapter,
- `OPENAI_MODEL` behavior,
- page-text formatting,
- evidence status mapping,
- quote normalization.

## Steps

1. State the expected behavioral change.
2. Verify the change remains evidence-only and human-decision-safe.
3. Bump prompt/schema/pipeline version as appropriate.
4. Keep JSON Schema and runtime validator synchronized.
5. Update fixtures.
6. Run the golden eval.
7. Compare old and new results.
8. Review regressions in:
   - quote existence,
   - page accuracy,
   - status classification,
   - overclaim,
   - NOT_FOUND wording,
   - protected-trait inference.
9. Record the decision in docs if semantics changed.

## Failure handling

- refusal is not a network failure,
- incomplete output is explicit,
- invalid schema is quarantined,
- fabricated quote is quarantined,
- no failure changes a human decision.

## Output

Include model/prompt/schema versions, eval command, before/after result, accepted regressions, and remaining risk.

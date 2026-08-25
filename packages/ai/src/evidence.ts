import { z } from "zod";

import { EVIDENCE_CONTRACT_VERSIONS, EVIDENCE_SCHEMA_NAME } from "./versions.ts";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => nonEmptyText(max).nullable();

export const evidenceStatusSchema = z.enum([
  "SUPPORTED",
  "PARTIAL",
  "NOT_FOUND",
  "CONTRADICTED",
  "HUMAN_ONLY",
]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export const evidenceSourceSchema = z
  .object({ page_number: z.number().int().positive(), exact_quote: nonEmptyText(2_000) })
  .strict();
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const criterionEvidenceSchema = z
  .object({
    criterion_id: uuidSchema,
    status: evidenceStatusSchema,
    evidence: z.array(evidenceSourceSchema).max(16),
    interpretation: nullableText(2_000),
    uncertainty: nullableText(2_000),
    suggested_interview_question: nullableText(1_000),
  })
  .strict()
  .superRefine((result, context) => {
    const sourceFree = result.status === "NOT_FOUND" || result.status === "HUMAN_ONLY";
    if (sourceFree && result.evidence.length > 0)
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${result.status} must not contain source evidence`,
      });
    if (!sourceFree && result.evidence.length === 0)
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${result.status} requires an exact source quote`,
      });
  });

export const evidenceExtractionSchema = z
  .object({ results: z.array(criterionEvidenceSchema).min(1).max(128) })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.results.forEach((result, index) => {
      if (ids.has(result.criterion_id))
        context.addIssue({
          code: "custom",
          path: ["results", index, "criterion_id"],
          message: "criterion_id must occur exactly once",
        });
      ids.add(result.criterion_id);
    });
  });
export type CriterionEvidence = z.infer<typeof criterionEvidenceSchema>;
export type EvidenceExtraction = z.infer<typeof evidenceExtractionSchema>;

function toOpenAiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema);
  const withoutDialect = { ...generated };
  delete (withoutDialect as Record<string, unknown>).$schema;
  return withoutDialect;
}
export const evidenceExtractionJsonSchema = toOpenAiJsonSchema(evidenceExtractionSchema);
export const evidenceExtractionResponseFormat = {
  type: "json_schema" as const,
  name: EVIDENCE_SCHEMA_NAME,
  strict: true,
  schema: evidenceExtractionJsonSchema,
};

export const evidencePromptCriterionSchema = z
  .object({
    criterion_id: uuidSchema,
    type: z.enum(["REQUIRED", "PREFERRED", "INTERVIEW_ONLY"]),
    definition: nonEmptyText(2_000),
    accepted_evidence: z.array(nonEmptyText(500)).max(32),
    alternative_evidence: z.array(nonEmptyText(500)).max(32),
    resume_assessable: z.boolean(),
    suggested_interview_question: nullableText(1_000),
  })
  .strict();
export const evidencePromptPageSchema = z
  .object({ page_number: z.number().int().positive(), text: z.string().max(200_000) })
  .strict();
export const evidencePromptInputSchema = z
  .object({
    criteria: z.array(evidencePromptCriterionSchema).min(1).max(128),
    pages: z.array(evidencePromptPageSchema).min(1).max(2_000),
  })
  .strict();
export type EvidencePromptInput = z.infer<typeof evidencePromptInputSchema>;

export interface EvidenceValidationContext {
  allowedCriterionIds: ReadonlySet<string>;
  humanOnlyCriterionIds?: ReadonlySet<string>;
  pageTextByNumber: ReadonlyMap<number, string>;
}
export type EvidenceValidationCode =
  | "UNKNOWN_CRITERION"
  | "MISSING_CRITERION"
  | "INVALID_PAGE_NUMBER"
  | "QUOTE_NOT_FOUND"
  | "INVALID_HUMAN_ONLY_STATUS";
export interface EvidenceValidationIssue {
  code: EvidenceValidationCode;
  path: string;
  message: string;
}
export class EvidenceValidationError extends Error {
  constructor(public readonly issues: readonly EvidenceValidationIssue[]) {
    super(`Evidence validation failed: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "EvidenceValidationError";
  }
}
export function normalizeEvidenceText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function validateEvidenceExtraction(
  input: unknown,
  context: EvidenceValidationContext,
): EvidenceExtraction {
  const extraction = evidenceExtractionSchema.parse(input);
  const issues: EvidenceValidationIssue[] = [];
  const returnedIds = new Set(extraction.results.map((result) => result.criterion_id));
  for (const criterionId of context.allowedCriterionIds)
    if (!returnedIds.has(criterionId))
      issues.push({
        code: "MISSING_CRITERION",
        path: "results",
        message: `approved criterion ${criterionId} is missing`,
      });
  extraction.results.forEach((result, resultIndex) => {
    if (!context.allowedCriterionIds.has(result.criterion_id))
      issues.push({
        code: "UNKNOWN_CRITERION",
        path: `results[${resultIndex}].criterion_id`,
        message: "criterion is not in the approved scorecard",
      });
    if (context.humanOnlyCriterionIds?.has(result.criterion_id) && result.status !== "HUMAN_ONLY")
      issues.push({
        code: "INVALID_HUMAN_ONLY_STATUS",
        path: `results[${resultIndex}].status`,
        message: "non-resume-assessable criterion must remain HUMAN_ONLY",
      });
    result.evidence.forEach((source, sourceIndex) => {
      const pageText = context.pageTextByNumber.get(source.page_number);
      const path = `results[${resultIndex}].evidence[${sourceIndex}]`;
      if (pageText === undefined)
        issues.push({
          code: "INVALID_PAGE_NUMBER",
          path: `${path}.page_number`,
          message: "page is outside the supplied resume bounds",
        });
      else if (!normalizeEvidenceText(pageText).includes(normalizeEvidenceText(source.exact_quote)))
        issues.push({
          code: "QUOTE_NOT_FOUND",
          path: `${path}.exact_quote`,
          message: "quote is not an exact normalized substring of the referenced page",
        });
    });
  });
  if (issues.length > 0) throw new EvidenceValidationError(issues);
  return extraction;
}

export const evidenceContractVersions = EVIDENCE_CONTRACT_VERSIONS;

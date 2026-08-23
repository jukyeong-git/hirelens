import { z } from "zod";

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();

export const evidenceStatusSchema = z.enum([
  "SUPPORTED",
  "PARTIAL",
  "NOT_FOUND",
  "CONTRADICTED",
  "HUMAN_ONLY",
]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const evidenceSourceSchema = z
  .object({
    page_number: z.number().int().positive(),
    exact_quote: nonEmptyText(2_000),
  })
  .strict();
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const criterionEvidenceSchema = z
  .object({
    criterion_id: nonEmptyText(200),
    status: evidenceStatusSchema,
    evidence: z.array(evidenceSourceSchema).max(16),
    interpretation: nullableText(2_000),
    uncertainty: nullableText(2_000),
    suggested_interview_question: nullableText(1_000),
  })
  .strict()
  .superRefine((result, context) => {
    if (["NOT_FOUND", "HUMAN_ONLY"].includes(result.status) && result.evidence.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${result.status} must not contain fabricated source evidence`,
      });
    }

    if (
      ["SUPPORTED", "PARTIAL", "CONTRADICTED"].includes(result.status) &&
      result.evidence.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${result.status} requires at least one exact source quote`,
      });
    }
  });
export type CriterionEvidence = z.infer<typeof criterionEvidenceSchema>;

export const evidenceExtractionSchema = z
  .object({
    results: z.array(criterionEvidenceSchema).max(128),
  })
  .strict();
export type EvidenceExtraction = z.infer<typeof evidenceExtractionSchema>;

function toOpenAiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema);
  const withoutDialect = { ...generated };
  delete (withoutDialect as Record<string, unknown>).$schema;
  return withoutDialect;
}

export const evidenceExtractionJsonSchema = toOpenAiJsonSchema(evidenceExtractionSchema);

export interface EvidenceValidationContext {
  allowedCriterionIds: ReadonlySet<string>;
  pageCount: number;
  pageTextByNumber: ReadonlyMap<number, string>;
}

export type EvidenceValidationCode =
  | "UNKNOWN_CRITERION"
  | "INVALID_PAGE_NUMBER"
  | "QUOTE_NOT_FOUND";

export interface EvidenceValidationIssue {
  code: EvidenceValidationCode;
  path: string;
  message: string;
}

export class EvidenceValidationError extends Error {
  constructor(public readonly issues: readonly EvidenceValidationIssue[]) {
    super(
      `Evidence validation failed: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
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

  for (const [resultIndex, result] of extraction.results.entries()) {
    if (!context.allowedCriterionIds.has(result.criterion_id)) {
      issues.push({
        code: "UNKNOWN_CRITERION",
        path: `results[${resultIndex}].criterion_id`,
        message: "is not present in the approved scorecard",
      });
    }

    for (const [evidenceIndex, source] of result.evidence.entries()) {
      const path = `results[${resultIndex}].evidence[${evidenceIndex}]`;
      if (
        source.page_number > context.pageCount ||
        !context.pageTextByNumber.has(source.page_number)
      ) {
        issues.push({
          code: "INVALID_PAGE_NUMBER",
          path: `${path}.page_number`,
          message: "is outside the supplied resume page bounds",
        });
        continue;
      }

      const pageText = context.pageTextByNumber.get(source.page_number);
      if (
        pageText === undefined ||
        !normalizeEvidenceText(pageText).includes(normalizeEvidenceText(source.exact_quote))
      ) {
        issues.push({
          code: "QUOTE_NOT_FOUND",
          path: `${path}.exact_quote`,
          message: "must be an exact normalized substring of the referenced resume page",
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new EvidenceValidationError(issues);
  }

  return extraction;
}

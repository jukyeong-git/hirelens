import { z } from "zod";

import { FRAMEWORK_REVISION_CONTRACT_VERSIONS, FRAMEWORK_REVISION_SCHEMA_NAME } from "./versions";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => text(max).nullable();
const evidenceList = z.array(text(500)).max(20);

export const frameworkRevisionChangeTypeSchema = z.enum([
  "TIGHTEN_EVIDENCE",
  "RETYPE_TO_INTERVIEW_ONLY",
  "DEMOTE_TO_PREFERRED",
  "ADD_EXCLUSION",
]);

const evidenceFieldSchema = z
  .object({
    field_name: text(80),
    description: text(500),
  })
  .strict();

export const frameworkRevisionCriterionSchema = z
  .object({
    name: text(200),
    type: z.enum(["REQUIRED", "PREFERRED", "INTERVIEW_ONLY"]),
    definition: text(2_000),
    accepted_evidence: evidenceList,
    alternative_evidence: evidenceList,
    excluded_evidence: evidenceList,
    partial_evidence_guidance: nullableText(1_000),
    evidence_fields: z.array(evidenceFieldSchema).max(20),
    resume_assessable: z.boolean(),
    suggested_interview_question: nullableText(1_000),
  })
  .strict()
  .superRefine((criterion, context) => {
    if (criterion.type === "INTERVIEW_ONLY" && criterion.resume_assessable) {
      context.addIssue({
        code: "custom",
        path: ["resume_assessable"],
        message: "INTERVIEW_ONLY criteria cannot be resume-assessable",
      });
    }
    if (criterion.resume_assessable && criterion.accepted_evidence.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["accepted_evidence"],
        message: "Resume-assessable criteria require accepted evidence",
      });
    }
  });

export const frameworkRevisionPromptInputSchema = z
  .object({
    finding_lineage_id: uuidSchema,
    finding: z
      .object({
        supported_observations: z.number().int().nonnegative(),
        level_insufficient_count: z.number().int().nonnegative(),
        mismatch_ratio: z.number().min(0).max(1),
        confirmed_observation_count: z.number().int().nonnegative(),
        false_claim_excluded_count: z.number().int().nonnegative(),
        ai_misread_excluded_count: z.number().int().nonnegative(),
      })
      .strict(),
    current_criterion: frameworkRevisionCriterionSchema,
    mismatch_quotes: z.array(text(2_000)).max(20),
    matched_quotes: z.array(text(2_000)).max(20),
  })
  .strict();

export const frameworkRevisionSchema = z
  .object({
    finding_lineage_id: uuidSchema,
    change_type: frameworkRevisionChangeTypeSchema,
    before: z
      .object({
        accepted_evidence: evidenceList,
        excluded_evidence: evidenceList,
      })
      .strict(),
    after: frameworkRevisionCriterionSchema,
    rationale: text(2_000),
  })
  .strict();

export type FrameworkRevisionPromptInput = z.infer<typeof frameworkRevisionPromptInputSchema>;
export type FrameworkRevision = z.infer<typeof frameworkRevisionSchema>;
export type FrameworkRevisionChangeType = z.infer<typeof frameworkRevisionChangeTypeSchema>;

function toOpenAiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema);
  const withoutDialect = { ...generated };
  delete (withoutDialect as Record<string, unknown>).$schema;
  return withoutDialect;
}

export const frameworkRevisionJsonSchema = toOpenAiJsonSchema(frameworkRevisionSchema);
export const frameworkRevisionResponseFormat = {
  type: "json_schema" as const,
  name: FRAMEWORK_REVISION_SCHEMA_NAME,
  strict: true,
  schema: frameworkRevisionJsonSchema,
};

const prohibitedCriterionLanguage =
  /(?:학벌|출신\s*학교|나이|연령|성별|남성|여성|인종|민족|국적|가족|혼인|결혼|임신|건강|장애|종교|culture\s*fit|personality|age|gender|race|ethnicity|religion|disability|health|family\s*status)/iu;

function allProposedText(revision: FrameworkRevision): string {
  return JSON.stringify({
    after: revision.after,
    rationale: revision.rationale,
  });
}

export class FrameworkRevisionValidationError extends Error {
  constructor(
    public readonly code:
      | "FINDING_MISMATCH"
      | "BEFORE_MISMATCH"
      | "PROTECTED_TRAIT_LANGUAGE"
      | "INVALID_CHANGE_TYPE",
    message: string,
  ) {
    super(message);
    this.name = "FrameworkRevisionValidationError";
  }
}

export function validateFrameworkRevision(
  rawRevision: unknown,
  rawInput: FrameworkRevisionPromptInput,
): FrameworkRevision {
  const input = frameworkRevisionPromptInputSchema.parse(rawInput);
  const revision = frameworkRevisionSchema.parse(rawRevision);
  if (revision.finding_lineage_id !== input.finding_lineage_id) {
    throw new FrameworkRevisionValidationError(
      "FINDING_MISMATCH",
      "Revision proposal is not linked to the supplied finding",
    );
  }
  if (
    JSON.stringify(revision.before.accepted_evidence) !==
      JSON.stringify(input.current_criterion.accepted_evidence) ||
    JSON.stringify(revision.before.excluded_evidence) !==
      JSON.stringify(input.current_criterion.excluded_evidence)
  ) {
    throw new FrameworkRevisionValidationError(
      "BEFORE_MISMATCH",
      "Revision before snapshot does not match the current criterion",
    );
  }
  if (prohibitedCriterionLanguage.test(allProposedText(revision))) {
    throw new FrameworkRevisionValidationError(
      "PROTECTED_TRAIT_LANGUAGE",
      "Revision proposal contains protected or job-irrelevant trait language",
    );
  }
  if (
    (revision.change_type === "RETYPE_TO_INTERVIEW_ONLY" &&
      (revision.after.type !== "INTERVIEW_ONLY" || revision.after.resume_assessable)) ||
    (revision.change_type === "DEMOTE_TO_PREFERRED" && revision.after.type !== "PREFERRED") ||
    (revision.change_type === "ADD_EXCLUSION" &&
      revision.after.excluded_evidence.length <= input.current_criterion.excluded_evidence.length)
  ) {
    throw new FrameworkRevisionValidationError(
      "INVALID_CHANGE_TYPE",
      "Revision content does not satisfy its declared change type",
    );
  }
  return revision;
}

export const frameworkRevisionContract = {
  versions: FRAMEWORK_REVISION_CONTRACT_VERSIONS,
  responseFormat: frameworkRevisionResponseFormat,
} as const;

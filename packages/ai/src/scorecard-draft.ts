import { z } from "zod";

import { SCORECARD_DRAFT_CONTRACT_VERSIONS, SCORECARD_DRAFT_SCHEMA_NAME } from "./versions";

const textSchema = (max: number) => z.string().trim().min(1).max(max);
const nullableTextSchema = (max: number) => z.string().trim().min(1).max(max).nullable();

export const criterionTypeSchema = z.enum(["REQUIRED", "PREFERRED", "INTERVIEW_ONLY"]);
export type CriterionType = z.infer<typeof criterionTypeSchema>;

export const ambiguityStatusSchema = z.enum(["CLEAR", "AMBIGUOUS", "HUMAN_ONLY"]);
export type AmbiguityStatus = z.infer<typeof ambiguityStatusSchema>;

export const criterionDraftClientIdSchema = z
  .string()
  .trim()
  .regex(/^criterion-draft-[a-z0-9]+(?:-[a-z0-9]+)*$/u, "Invalid draft criterion client ID");

export const scorecardDraftPromptInputSchema = z
  .object({
    job_title: textSchema(160),
    raw_job_description: textSchema(20_000),
    human_clarification: nullableTextSchema(4_000),
  })
  .strict();
export type ScorecardDraftPromptInput = z.infer<typeof scorecardDraftPromptInputSchema>;

export const evidenceFieldSchema = z
  .object({
    field_name: textSchema(80),
    description: textSchema(500),
  })
  .strict();
export type EvidenceField = z.infer<typeof evidenceFieldSchema>;

const ambiguityFields = {
  source_phrase: nullableTextSchema(500),
  ambiguity_note: nullableTextSchema(1_000),
  ambiguity_status: ambiguityStatusSchema,
  suggested_interview_question: nullableTextSchema(1_000),
} as const;

export const scorecardDraftAmbiguousPhraseSchema = z.object(ambiguityFields).strict();
export type ScorecardDraftAmbiguousPhrase = z.infer<typeof scorecardDraftAmbiguousPhraseSchema>;

export const scorecardDraftCriterionSchema = z
  .object({
    client_id: criterionDraftClientIdSchema,
    name: textSchema(160),
    type: criterionTypeSchema,
    definition: textSchema(1_000),
    accepted_evidence: z.array(textSchema(500)).max(12),
    alternative_evidence: z.array(textSchema(500)).max(12),
    evidence_fields: z.array(evidenceFieldSchema).max(12),
    resume_assessable: z.boolean(),
    ...ambiguityFields,
  })
  .strict();
export type ScorecardDraftCriterion = z.infer<typeof scorecardDraftCriterionSchema>;

export const scorecardDraftSchema = z
  .object({
    contract: z.literal("SCORECARD_DRAFT"),
    draft_only: z.literal(true),
    ambiguous_phrases: z.array(scorecardDraftAmbiguousPhraseSchema).max(32),
    criteria: z.array(scorecardDraftCriterionSchema).min(1).max(32),
  })
  .strict();
export type ScorecardDraft = z.infer<typeof scorecardDraftSchema>;

export interface ScorecardDraftJsonSchema {
  readonly type: "object";
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

function replaceConstWithEnum(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(replaceConstWithEnum);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const object = value as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(object)
      .filter(([key]) => key !== "const")
      .map(([key, entry]) => [key, replaceConstWithEnum(entry)]),
  );
  if ("const" in object) {
    normalized.enum = [replaceConstWithEnum(object.const)];
  }
  return normalized;
}

function toOpenAiJsonSchema(schema: z.ZodType): ScorecardDraftJsonSchema {
  const generated = z.toJSONSchema(schema);
  const withoutDialect = { ...generated };
  delete (withoutDialect as Record<string, unknown>).$schema;

  return replaceConstWithEnum(withoutDialect) as ScorecardDraftJsonSchema;
}

/** Strict Structured Outputs schema kept next to the Zod runtime contract. */
export const scorecardDraftJsonSchema = toOpenAiJsonSchema(scorecardDraftSchema);

export const scorecardDraftResponseFormat = {
  type: "json_schema",
  name: SCORECARD_DRAFT_SCHEMA_NAME,
  strict: true,
  schema: scorecardDraftJsonSchema,
} as const;

export interface ScorecardDraftValidationIssue {
  path: string;
  message: string;
}

export class ScorecardDraftValidationError extends Error {
  constructor(public readonly issues: readonly ScorecardDraftValidationIssue[]) {
    super(
      `Scorecard draft validation failed: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ScorecardDraftValidationError";
  }
}

function normalizeSourceText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function collectSourcePhraseIssues(
  draft: ScorecardDraft,
  rawJobDescription: string,
): ScorecardDraftValidationIssue[] {
  const normalizedJobDescription = normalizeSourceText(rawJobDescription);
  const issues: ScorecardDraftValidationIssue[] = [];
  const sourcePhrases = [
    ...draft.ambiguous_phrases.map((phrase, index) => ({
      path: `ambiguous_phrases[${index}].source_phrase`,
      value: phrase.source_phrase,
    })),
    ...draft.criteria.map((criterion, index) => ({
      path: `criteria[${index}].source_phrase`,
      value: criterion.source_phrase,
    })),
  ];

  for (const sourcePhrase of sourcePhrases) {
    if (
      sourcePhrase.value !== null &&
      !normalizedJobDescription.includes(normalizeSourceText(sourcePhrase.value))
    ) {
      issues.push({
        path: sourcePhrase.path,
        message: "must be an exact normalized substring of raw_job_description",
      });
    }
  }

  return issues;
}

export function parseScorecardDraft(input: unknown): ScorecardDraft {
  return scorecardDraftSchema.parse(input);
}

export function validateScorecardDraft(
  input: unknown,
  context?: Pick<ScorecardDraftPromptInput, "raw_job_description">,
): ScorecardDraft {
  const draft = parseScorecardDraft(input);
  const issues: ScorecardDraftValidationIssue[] = [];

  for (const [index, criterion] of draft.criteria.entries()) {
    if (criterion.type === "INTERVIEW_ONLY" && criterion.resume_assessable) {
      issues.push({
        path: `criteria[${index}].resume_assessable`,
        message: "must be false for INTERVIEW_ONLY criteria",
      });
    }

    if (criterion.ambiguity_status === "HUMAN_ONLY" && criterion.resume_assessable) {
      issues.push({
        path: `criteria[${index}].resume_assessable`,
        message: "must be false for HUMAN_ONLY ambiguity",
      });
    }
  }

  if (context) {
    issues.push(...collectSourcePhraseIssues(draft, context.raw_job_description));
  }

  if (issues.length > 0) {
    throw new ScorecardDraftValidationError(issues);
  }

  return draft;
}

export const scorecardDraftContract = {
  versions: SCORECARD_DRAFT_CONTRACT_VERSIONS,
  schemaName: SCORECARD_DRAFT_SCHEMA_NAME,
  zodSchema: scorecardDraftSchema,
  jsonSchema: scorecardDraftJsonSchema,
  responseFormat: scorecardDraftResponseFormat,
} as const;

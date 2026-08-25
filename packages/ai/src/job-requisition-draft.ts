import { z } from "zod";

import {
  JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS,
  JOB_REQUISITION_DRAFT_SCHEMA_NAME,
} from "./versions";

const textSchema = (max: number) => z.string().trim().min(1).max(max);

/** Human-authored inputs for an explicit, editable requisition draft request. */
export const jobRequisitionDraftPromptInputSchema = z
  .object({
    title: textSchema(160),
    department: textSchema(160),
  })
  .strict();
export type JobRequisitionDraftPromptInput = z.infer<typeof jobRequisitionDraftPromptInputSchema>;

/**
 * The entire model response. The draft has no workflow, scorecard, candidate,
 * decision, ranking, or assignment fields and is always subject to human editing.
 */
export const jobRequisitionDraftSchema = z
  .object({
    contract: z.literal("JOB_REQUISITION_DRAFT"),
    draft_only: z.literal(true),
    raw_job_description: textSchema(20_000),
  })
  .strict();
export type JobRequisitionDraft = z.infer<typeof jobRequisitionDraftSchema>;

export interface JobRequisitionDraftJsonSchema {
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

function toOpenAiJsonSchema(schema: z.ZodType): JobRequisitionDraftJsonSchema {
  const generated = z.toJSONSchema(schema);
  const withoutDialect = { ...generated };
  delete (withoutDialect as Record<string, unknown>).$schema;

  return replaceConstWithEnum(withoutDialect) as JobRequisitionDraftJsonSchema;
}

/** Strict Structured Outputs schema synchronized with the Zod runtime contract. */
export const jobRequisitionDraftJsonSchema = toOpenAiJsonSchema(jobRequisitionDraftSchema);

export const jobRequisitionDraftResponseFormat = {
  type: "json_schema",
  name: JOB_REQUISITION_DRAFT_SCHEMA_NAME,
  strict: true,
  schema: jobRequisitionDraftJsonSchema,
} as const;

export function parseJobRequisitionDraft(input: unknown): JobRequisitionDraft {
  return jobRequisitionDraftSchema.parse(input);
}

export const jobRequisitionDraftContract = {
  versions: JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS,
  schemaName: JOB_REQUISITION_DRAFT_SCHEMA_NAME,
  zodSchema: jobRequisitionDraftSchema,
  jsonSchema: jobRequisitionDraftJsonSchema,
  responseFormat: jobRequisitionDraftResponseFormat,
} as const;

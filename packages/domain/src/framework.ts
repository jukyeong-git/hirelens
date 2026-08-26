import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);

export const frameworkComparisonVersionSchema = z
  .object({
    id: uuidSchema,
    version_number: z.number().int().positive(),
    status: z.enum(["APPROVED", "SUPERSEDED"]),
    approved_at: z.string().nullable(),
    application_count: z.number().int().nonnegative(),
    completed_count: z.number().int().nonnegative(),
    pending_count: z.number().int().nonnegative(),
    failed_count: z.number().int().nonnegative(),
    supported_applications: z.number().int().nonnegative(),
    partial_applications: z.number().int().nonnegative(),
    not_found_applications: z.number().int().nonnegative(),
  })
  .strict();

export const frameworkComparisonCriterionVersionSchema = z
  .object({
    criterion_id: uuidSchema,
    name: z.string().trim().min(1).max(200),
    type: z.enum(["REQUIRED", "PREFERRED", "INTERVIEW_ONLY"]),
    accepted_evidence: z.array(z.string()),
    excluded_evidence: z.array(z.string()),
    supported_applications: z.number().int().nonnegative(),
    partial_applications: z.number().int().nonnegative(),
    not_found_applications: z.number().int().nonnegative(),
  })
  .strict();

export const frameworkComparisonSchema = z
  .object({
    versions: z.array(frameworkComparisonVersionSchema).length(2),
    criteria: z.array(
      z
        .object({
          lineage_id: uuidSchema,
          before: frameworkComparisonCriterionVersionSchema.nullable(),
          after: frameworkComparisonCriterionVersionSchema.nullable(),
        })
        .strict(),
    ),
    application_changes: z.array(
      z
        .object({
          application_id: uuidSchema,
          lineage_id: uuidSchema,
          criterion_name: z.string().trim().min(1).max(200),
          before_status: z.enum([
            "SUPPORTED",
            "PARTIAL",
            "NOT_FOUND",
            "CONTRADICTED",
            "HUMAN_ONLY",
          ]),
          after_status: z.enum(["SUPPORTED", "PARTIAL", "NOT_FOUND", "CONTRADICTED", "HUMAN_ONLY"]),
        })
        .strict(),
    ),
  })
  .strict();

export const frameworkReanalysisResultSchema = z
  .object({
    scorecard_version_id: uuidSchema,
    scorecard_version_number: z.number().int().positive(),
    queued_count: z.number().int().nonnegative(),
    existing_count: z.number().int().nonnegative(),
  })
  .strict();

export type FrameworkComparison = z.infer<typeof frameworkComparisonSchema>;
export type FrameworkComparisonVersion = z.infer<typeof frameworkComparisonVersionSchema>;
export type FrameworkComparisonCriterionVersion = z.infer<
  typeof frameworkComparisonCriterionVersionSchema
>;
export type FrameworkReanalysisResult = z.infer<typeof frameworkReanalysisResultSchema>;

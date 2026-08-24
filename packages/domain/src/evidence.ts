import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const nullableBoundedText = (max: number) => boundedText(max).nullable();

export const processingRunStatusSchema = z.enum([
  "QUEUED",
  "EXTRACTING",
  "ANALYZING",
  "VALIDATING",
  "COMPLETED",
  "NEEDS_OCR",
  "RETRY_PENDING",
  "FAILED",
  "QUARANTINED",
]);

export const processingFailureCategorySchema = z.enum([
  "PDF_INVALID",
  "PDF_ENCRYPTED",
  "PDF_EXTRACTION_FAILED",
  "STORAGE_UNAVAILABLE",
  "STORAGE_DOWNLOAD_FAILED",
  "AI_TIMEOUT",
  "AI_RATE_LIMIT",
  "AI_NETWORK_ERROR",
  "AI_PROVIDER_ERROR",
  "AI_REFUSAL",
  "AI_INCOMPLETE",
  "AI_SCHEMA_INVALID",
  "AI_UNKNOWN_CRITERION",
  "AI_INVALID_PAGE",
  "AI_QUOTE_MISMATCH",
  "AI_BUDGET_EXCEEDED",
  "AI_USAGE_INVALID",
  "EVIDENCE_PERSISTENCE_FAILED",
]);

export const evidenceStatusSchema = z.enum([
  "SUPPORTED",
  "PARTIAL",
  "NOT_FOUND",
  "CONTRADICTED",
  "HUMAN_ONLY",
]);

export const claimedEvidenceRunSchema = z
  .object({
    processing_run_id: uuidSchema,
    resume_file_id: uuidSchema,
    storage_path: boundedText(512),
    attempt_count: z.number().int().min(1).max(2),
    stage: z.enum(["EXTRACTING", "ANALYZING"]),
    pipeline_version: boundedText(100),
  })
  .strict();

export const evidenceCriterionSchema = z
  .object({
    criterion_id: uuidSchema,
    type: z.enum(["REQUIRED", "PREFERRED", "INTERVIEW_ONLY"]),
    definition: boundedText(2_000),
    accepted_evidence: z.array(boundedText(500)).max(32),
    alternative_evidence: z.array(boundedText(500)).max(32),
    resume_assessable: z.boolean(),
    suggested_interview_question: nullableBoundedText(1_000),
  })
  .strict();

export const evidencePageSchema = z
  .object({
    page_id: uuidSchema,
    page_number: z.number().int().positive(),
    normalized_text: z.string().max(200_000),
    normalized_text_sha256: sha256Schema,
  })
  .strict();

export const evidenceAnalysisContextSchema = z
  .object({
    processing_run_id: uuidSchema,
    application_id: uuidSchema,
    resume_file_id: uuidSchema,
    scorecard_version_id: uuidSchema,
    pipeline_version: boundedText(100),
    criteria: z.array(evidenceCriterionSchema).min(1).max(128),
    pages: z.array(evidencePageSchema).min(1).max(2_000),
  })
  .strict();

export const evidenceUsageSchema = z
  .object({
    providerRequestId: boundedText(255).nullable(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    estimatedCostMicrousd: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((usage) => usage.totalTokens === usage.inputTokens + usage.outputTokens, {
    message: "totalTokens must equal inputTokens plus outputTokens",
    path: ["totalTokens"],
  });

export const persistedEvidenceSourceSchema = z
  .object({
    page_number: z.number().int().positive(),
    exact_quote: boundedText(2_000),
    source_quote_hash: sha256Schema,
    source_page_hash: sha256Schema,
  })
  .strict();

export const persistedCriterionEvidenceSchema = z
  .object({
    criterion_id: uuidSchema,
    status: evidenceStatusSchema,
    evidence: z.array(persistedEvidenceSourceSchema).max(16),
    interpretation: nullableBoundedText(2_000),
    uncertainty: nullableBoundedText(2_000),
    suggested_interview_question: nullableBoundedText(1_000),
  })
  .strict();

export const persistEvidenceInputSchema = z
  .object({
    processingRunId: uuidSchema,
    results: z.array(persistedCriterionEvidenceSchema).min(1).max(128),
  })
  .strict();

export type ProcessingRunStatus = z.infer<typeof processingRunStatusSchema>;
export type ProcessingFailureCategory = z.infer<typeof processingFailureCategorySchema>;
export type ClaimedEvidenceRun = z.infer<typeof claimedEvidenceRunSchema>;
export type EvidenceCriterion = z.infer<typeof evidenceCriterionSchema>;
export type EvidencePage = z.infer<typeof evidencePageSchema>;
export type EvidenceAnalysisContext = z.infer<typeof evidenceAnalysisContextSchema>;
export type EvidenceUsage = z.infer<typeof evidenceUsageSchema>;
export type PersistedCriterionEvidence = z.infer<typeof persistedCriterionEvidenceSchema>;
export type PersistEvidenceInput = z.infer<typeof persistEvidenceInputSchema>;

export interface EvidenceItemRecord {
  id: string;
  processing_run_id: string;
  criterion_id: string;
  status: z.infer<typeof evidenceStatusSchema>;
  source_ordinal: number;
  resume_page_id: string | null;
  exact_quote: string | null;
  interpretation: string | null;
  uncertainty: string | null;
  suggested_interview_question: string | null;
  source_quote_hash: string | null;
  source_page_hash: string | null;
  created_at: string;
}

export interface ResumePageRecord {
  id: string;
  processing_run_id: string;
  page_number: number;
  raw_text: string;
  normalized_text_sha256: string;
}

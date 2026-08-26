import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, "Invalid UUID");

export const resumeIntakeStatusSchema = z.enum(["PENDING_UPLOAD", "UPLOADED"]);
export { processingRunStatusSchema } from "./evidence";
import { processingRunStatusSchema } from "./evidence";
export { processingFailureCategorySchema as processingErrorCategorySchema } from "./evidence";
import { processingFailureCategorySchema } from "./evidence";
export const MAXIMUM_RESUME_BYTES = 5_242_880;
export const resumePdfMimeTypeSchema = z.literal("application/pdf");
export const resumeSha256Schema = z.string().regex(/^[0-9a-f]{64}$/iu, "Invalid SHA-256");

export const createResumeUploadReservationInputSchema = z
  .object({
    jobId: uuidSchema,
    candidateId: uuidSchema,
    applicationId: uuidSchema,
    resumeFileId: uuidSchema,
    storagePath: z.string().min(1).max(512),
    originalFilename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/\.pdf$/iu, "Resume filename must use the PDF extension"),
    mimeType: resumePdfMimeTypeSchema,
    byteSize: z.number().int().positive().max(MAXIMUM_RESUME_BYTES),
    sha256: resumeSha256Schema,
  })
  .strict();

export const publicResumeSubmissionInputSchema = z
  .object({
    publicSlug: z.string().regex(/^[0-9a-f]{32}$/iu, "Invalid public posting slug"),
    candidateId: uuidSchema,
    applicationId: uuidSchema,
    resumeFileId: uuidSchema,
    originalFilename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .regex(/\.pdf$/iu, "Resume filename must use the PDF extension"),
    mimeType: resumePdfMimeTypeSchema,
    byteSize: z.number().int().positive().max(MAXIMUM_RESUME_BYTES),
    sha256: resumeSha256Schema,
  })
  .strict();

export type ResumeIntakeStatus = z.infer<typeof resumeIntakeStatusSchema>;
export type ProcessingRunStatus = z.infer<typeof processingRunStatusSchema>;
export type ProcessingErrorCategory = z.infer<typeof processingFailureCategorySchema>;
export const finalizeUploadedResumeInputSchema = z.object({ resumeFileId: uuidSchema }).strict();
export const cancelResumeUploadReservationInputSchema = z
  .object({ resumeFileId: uuidSchema })
  .strict();

export type CreateResumeUploadReservationInput = z.infer<
  typeof createResumeUploadReservationInputSchema
>;
export type PublicResumeSubmissionInput = z.infer<typeof publicResumeSubmissionInputSchema>;
export type FinalizeUploadedResumeInput = z.infer<typeof finalizeUploadedResumeInputSchema>;
export type CancelResumeUploadReservationInput = z.infer<
  typeof cancelResumeUploadReservationInputSchema
>;

export interface ResumeFileRecord {
  id: string;
  application_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: z.infer<typeof resumePdfMimeTypeSchema>;
  byte_size: number;
  sha256: string;
  intake_status: ResumeIntakeStatus;
  synthetic_or_anonymized_attested: boolean | null;
  attested_by: string | null;
  attested_at: string | null;
  created_at: string;
}

export interface ResumeProcessingRunRecord {
  id: string;
  application_id: string;
  resume_file_id: string;
  scorecard_version_id: string;
  pipeline_version: string;
  prompt_version: string | null;
  schema_version: string | null;
  model_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_microusd: number | null;
  analysis_duration_ms: number | null;
  status: ProcessingRunStatus;
  attempt_count: number;
  error_category: ProcessingErrorCategory | null;
  created_at: string;
  completed_at: string | null;
}

export const extractedResumePageSchema = z
  .object({
    pageNumber: z.number().int().positive(),
    rawText: z.string(),
    normalizedText: z.string(),
    rawTextSha256: resumeSha256Schema,
    normalizedTextSha256: resumeSha256Schema,
  })
  .strict();

export const completeResumeExtractionInputSchema = z
  .object({
    processingRunId: uuidSchema,
    pages: z.array(extractedResumePageSchema).min(1).max(2_000),
  })
  .strict();

export type ExtractedResumePage = z.infer<typeof extractedResumePageSchema>;
export type CompleteResumeExtractionInput = z.infer<typeof completeResumeExtractionInputSchema>;

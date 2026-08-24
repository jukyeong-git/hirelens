import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, "Invalid UUID");

export const resumeIntakeStatusSchema = z.enum(["PENDING_UPLOAD", "UPLOADED"]);
export const processingRunStatusSchema = z.enum([
  "QUEUED",
  "EXTRACTING",
  "COMPLETED",
  "NEEDS_OCR",
  "FAILED",
]);
export const processingErrorCategorySchema = z.enum([
  "PDF_INVALID",
  "PDF_ENCRYPTED",
  "PDF_EXTRACTION_FAILED",
  "STORAGE_UNAVAILABLE",
  "STORAGE_DOWNLOAD_FAILED",
]);
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
    byteSize: z.number().int().positive().max(10_485_760),
    sha256: resumeSha256Schema,
    syntheticOrAnonymizedAttested: z.literal(true),
  })
  .strict();

export type ResumeIntakeStatus = z.infer<typeof resumeIntakeStatusSchema>;
export type ProcessingRunStatus = z.infer<typeof processingRunStatusSchema>;
export type ProcessingErrorCategory = z.infer<typeof processingErrorCategorySchema>;
export const finalizeUploadedResumeInputSchema = z.object({ resumeFileId: uuidSchema }).strict();
export const cancelResumeUploadReservationInputSchema = z
  .object({ resumeFileId: uuidSchema })
  .strict();

export type CreateResumeUploadReservationInput = z.infer<
  typeof createResumeUploadReservationInputSchema
>;
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
  synthetic_or_anonymized_attested: boolean;
  attested_by: string;
  attested_at: string;
  created_at: string;
}

export interface ResumeProcessingRunRecord {
  id: string;
  application_id: string;
  resume_file_id: string;
  scorecard_version_id: string;
  pipeline_version: string;
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

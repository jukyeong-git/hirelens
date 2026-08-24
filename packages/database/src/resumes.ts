import type {
  CancelResumeUploadReservationInput,
  CreateResumeUploadReservationInput,
  FinalizeUploadedResumeInput,
  CompleteResumeExtractionInput,
  ResumeFileRecord,
  ResumeProcessingRunRecord,
} from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const resumeFileSelect =
  "id,application_id,storage_path,original_filename,mime_type,byte_size,sha256,intake_status,synthetic_or_anonymized_attested,attested_by,attested_at,created_at";

export type CreateResumeUploadReservationRequest = CreateResumeUploadReservationInput;

export async function createResumeUploadReservation(
  client: SupabaseRestClient,
  input: CreateResumeUploadReservationRequest,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_resume_upload_reservation", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_job_id: input.jobId,
      candidate_id: input.candidateId,
      application_id: input.applicationId,
      resume_file_id: input.resumeFileId,
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      sha256: input.sha256,
      synthetic_or_anonymized_attested: input.syntheticOrAnonymizedAttested,
    }),
  });
}

export interface ClaimedResumeExtractionRun {
  processing_run_id: string;
  resume_file_id: string;
  storage_path: string;
  attempt_count: number;
}

export async function claimResumeExtractionRun(
  client: SupabaseRestClient,
  processingRunId: string,
): Promise<ClaimedResumeExtractionRun | null> {
  const result = await client.request<ClaimedResumeExtractionRun[]>(
    "/rest/v1/rpc/claim_resume_extraction_run",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_processing_run_id: processingRunId }),
    },
  );
  return result[0] ?? null;
}

export async function completeResumeExtraction(
  client: SupabaseRestClient,
  input: CompleteResumeExtractionInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/complete_resume_extraction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: input.processingRunId,
      extracted_pages: input.pages.map((page) => ({
        page_number: page.pageNumber,
        raw_text: page.rawText,
        normalized_text: page.normalizedText,
        raw_text_sha256: page.rawTextSha256,
        normalized_text_sha256: page.normalizedTextSha256,
      })),
    }),
  });
}

export async function markResumeExtractionNeedsOcr(
  client: SupabaseRestClient,
  processingRunId: string,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/mark_resume_extraction_needs_ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_processing_run_id: processingRunId }),
  });
}

export async function failResumeExtraction(
  client: SupabaseRestClient,
  processingRunId: string,
  errorCategory: string,
  retryable: boolean,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/fail_resume_extraction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: processingRunId,
      failure_category: errorCategory,
      is_retryable: retryable,
    }),
  });
}

export async function getResumeProcessingRun(
  client: SupabaseRestClient,
  processingRunId: string,
): Promise<ResumeProcessingRunRecord | null> {
  const params = new URLSearchParams({
    select:
      "id,application_id,resume_file_id,scorecard_version_id,pipeline_version,status,attempt_count,error_category,created_at,completed_at",
    id: `eq.${processingRunId}`,
    limit: "1",
  });
  const runs = await client.request<ResumeProcessingRunRecord[]>(
    `/rest/v1/processing_runs?${params.toString()}`,
  );
  return runs[0] ?? null;
}

export async function listResumeProcessingRunsForApplication(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<ResumeProcessingRunRecord[]> {
  const params = new URLSearchParams({
    select:
      "id,application_id,resume_file_id,scorecard_version_id,pipeline_version,status,attempt_count,error_category,created_at,completed_at",
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<ResumeProcessingRunRecord[]>(
    `/rest/v1/processing_runs?${params.toString()}`,
  );
}

export async function finalizeUploadedResume(
  client: SupabaseRestClient,
  input: FinalizeUploadedResumeInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/finalize_uploaded_resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_file_id: input.resumeFileId }),
  });
}

export async function cancelResumeUploadReservation(
  client: SupabaseRestClient,
  input: CancelResumeUploadReservationInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/cancel_resume_upload_reservation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_file_id: input.resumeFileId }),
  });
}

export async function listResumeFilesForApplication(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<ResumeFileRecord[]> {
  const params = new URLSearchParams({
    select: resumeFileSelect,
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<ResumeFileRecord[]>(`/rest/v1/resume_files?${params.toString()}`);
}

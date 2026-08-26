import type {
  CancelResumeUploadReservationInput,
  CreateResumeUploadReservationInput,
  PublicResumeSubmissionInput,
  FinalizeUploadedResumeInput,
  ResumeFileRecord,
  ResumeProcessingRunRecord,
} from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const resumeFileSelect =
  "id,application_id,storage_path,original_filename,mime_type,byte_size,sha256,intake_status,synthetic_or_anonymized_attested,attested_by,attested_at,created_at";

export type CreateResumeUploadReservationRequest = CreateResumeUploadReservationInput;
export type PublicResumeSubmissionRequest = PublicResumeSubmissionInput;

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
    }),
  });
}

export async function createPublicResumeSubmission(
  client: SupabaseRestClient,
  input: PublicResumeSubmissionRequest,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_named_public_resume_submission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_public_slug: input.publicSlug,
      candidate_name: input.candidateName,
      candidate_id: input.candidateId,
      application_id: input.applicationId,
      resume_file_id: input.resumeFileId,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      sha256: input.sha256,
    }),
  });
}

export async function finalizePublicResumeSubmission(
  client: SupabaseRestClient,
  resumeFileId: string,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/finalize_public_resume_submission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_resume_file_id: resumeFileId }),
  });
}

export async function cancelPublicResumeSubmission(
  client: SupabaseRestClient,
  resumeFileId: string,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/cancel_public_resume_submission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_resume_file_id: resumeFileId }),
  });
}

export async function getResumeProcessingRun(
  client: SupabaseRestClient,
  processingRunId: string,
): Promise<ResumeProcessingRunRecord | null> {
  const params = new URLSearchParams({
    select:
      "id,application_id,resume_file_id,scorecard_version_id,pipeline_version,prompt_version,schema_version,model_id,input_tokens,output_tokens,total_tokens,estimated_cost_microusd,analysis_duration_ms,status,attempt_count,error_category,created_at,completed_at",
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
      "id,application_id,resume_file_id,scorecard_version_id,pipeline_version,prompt_version,schema_version,model_id,input_tokens,output_tokens,total_tokens,estimated_cost_microusd,analysis_duration_ms,status,attempt_count,error_category,created_at,completed_at",
    application_id: `eq.${applicationId}`,
    order: "created_at.desc,id.desc",
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

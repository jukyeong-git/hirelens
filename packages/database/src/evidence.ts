import {
  claimedEvidenceRunSchema,
  evidenceAnalysisContextSchema,
  evidenceUsageSchema,
  persistEvidenceInputSchema,
  processingFailureCategorySchema,
  type ClaimedEvidenceRun,
  type EvidenceAnalysisContext,
  type EvidenceUsage,
  type PersistEvidenceInput,
  type ProcessingFailureCategory,
  type EvidenceItemRecord,
  type ResumePageRecord,
} from "../../domain/src/evidence.ts";
import type { CompleteResumeExtractionInput } from "../../domain/src/resume.ts";

import type { SupabaseRestClient } from "./rest.ts";

export async function listEvidenceItemsForRuns(
  client: SupabaseRestClient,
  processingRunIds: string[],
): Promise<EvidenceItemRecord[]> {
  if (processingRunIds.length === 0) return [];
  const params = new URLSearchParams({
    select:
      "id,processing_run_id,criterion_id,status,source_ordinal,resume_page_id,exact_quote,interpretation,uncertainty,suggested_interview_question,source_quote_hash,source_page_hash,created_at",
    processing_run_id: `in.(${processingRunIds.join(",")})`,
    order: "criterion_id.asc,source_ordinal.asc",
  });
  return client.request<EvidenceItemRecord[]>(`/rest/v1/evidence_items?${params.toString()}`);
}

export async function listResumePagesForRuns(
  client: SupabaseRestClient,
  processingRunIds: string[],
): Promise<ResumePageRecord[]> {
  if (processingRunIds.length === 0) return [];
  const params = new URLSearchParams({
    select: "id,processing_run_id,page_number,raw_text,normalized_text_sha256",
    processing_run_id: `in.(${processingRunIds.join(",")})`,
    order: "processing_run_id.asc,page_number.asc",
  });
  return client.request<ResumePageRecord[]>(`/rest/v1/resume_pages?${params.toString()}`);
}

export async function claimEvidenceProcessingRun(
  client: SupabaseRestClient,
  processingRunId: string,
  leaseSeconds = 300,
): Promise<ClaimedEvidenceRun | null> {
  const rows = await client.request<unknown[]>("/rest/v1/rpc/claim_evidence_processing_run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: processingRunId,
      lease_seconds: leaseSeconds,
    }),
  });
  return rows[0] === undefined ? null : claimedEvidenceRunSchema.parse(rows[0]);
}

export async function completeExtractionForEvidence(
  client: SupabaseRestClient,
  input: CompleteResumeExtractionInput,
  leaseToken: string,
): Promise<void> {
  await client.request("/rest/v1/rpc/complete_resume_extraction_for_evidence", {
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
      expected_lease_token: leaseToken,
    }),
  });
}

export async function markEvidenceNeedsOcr(
  client: SupabaseRestClient,
  processingRunId: string,
  leaseToken: string,
): Promise<void> {
  await client.request("/rest/v1/rpc/mark_evidence_needs_ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: processingRunId,
      expected_lease_token: leaseToken,
    }),
  });
}

export async function loadEvidenceAnalysisContext(
  client: SupabaseRestClient,
  processingRunId: string,
  leaseToken: string,
): Promise<EvidenceAnalysisContext> {
  const value = await client.request<unknown>("/rest/v1/rpc/load_evidence_analysis_context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: processingRunId,
      expected_lease_token: leaseToken,
    }),
  });
  return evidenceAnalysisContextSchema.parse(value);
}

export async function markEvidenceValidating(
  client: SupabaseRestClient,
  processingRunId: string,
  versions: { prompt: string; schema: string; model: string },
  usage: EvidenceUsage,
  leaseToken: string,
): Promise<void> {
  const validUsage = evidenceUsageSchema.parse(usage);
  await client.request("/rest/v1/rpc/mark_evidence_validating", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: processingRunId,
      prompt_version_value: versions.prompt,
      schema_version_value: versions.schema,
      model_id_value: versions.model,
      provider_request_id_value: validUsage.providerRequestId,
      input_tokens_value: validUsage.inputTokens,
      output_tokens_value: validUsage.outputTokens,
      total_tokens_value: validUsage.totalTokens,
      estimated_cost_microusd_value: validUsage.estimatedCostMicrousd,
      duration_ms_value: validUsage.durationMs,
      expected_lease_token: leaseToken,
    }),
  });
}

export async function persistValidatedEvidence(
  client: SupabaseRestClient,
  input: PersistEvidenceInput,
  leaseToken: string,
): Promise<void> {
  const parsed = persistEvidenceInputSchema.parse(input);
  await client.request("/rest/v1/rpc/persist_validated_evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: parsed.processingRunId,
      evidence_results: parsed.results,
      expected_lease_token: leaseToken,
    }),
  });
}

export async function recordProcessingFailure(
  client: SupabaseRestClient,
  processingRunId: string,
  category: ProcessingFailureCategory,
  options: { retryable: boolean; quarantined: boolean; safeDetail?: string },
  leaseToken: string,
): Promise<void> {
  const parsedCategory = processingFailureCategorySchema.parse(category);
  await client.request("/rest/v1/rpc/record_evidence_processing_failure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: processingRunId,
      failure_category: parsedCategory,
      is_retryable: options.retryable,
      should_quarantine: options.quarantined,
      safe_detail: options.safeDetail ?? null,
      expected_lease_token: leaseToken,
    }),
  });
}

export async function renewEvidenceProcessingLease(
  client: SupabaseRestClient,
  processingRunId: string,
  leaseToken: string,
  leaseSeconds = 300,
): Promise<void> {
  await client.request("/rest/v1/rpc/renew_evidence_processing_lease", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_processing_run_id: processingRunId,
      expected_lease_token: leaseToken,
      lease_seconds: leaseSeconds,
    }),
  });
}

export interface EvidenceQueueMessage {
  msg_id: number;
  message: unknown;
}

export async function dequeueEvidenceQueueMessage(
  client: SupabaseRestClient,
  visibilityTimeoutSeconds = 360,
  consumerMode: "EDGE" | "NODE" = "EDGE",
): Promise<EvidenceQueueMessage | null> {
  const rows = await client.request<unknown[]>("/rest/v1/rpc/dequeue_evidence_queue_message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      visibility_timeout_seconds: visibilityTimeoutSeconds,
      expected_consumer_mode: consumerMode,
    }),
  });
  const row = rows[0] as { msg_id?: unknown; message?: unknown } | undefined;
  if (!row) return null;
  if (typeof row.msg_id !== "number" || !Number.isSafeInteger(row.msg_id)) {
    throw new Error("Queue RPC returned an invalid message ID");
  }
  return { msg_id: row.msg_id, message: row.message };
}

export async function quarantineMalformedEvidenceQueueMessage(
  client: SupabaseRestClient,
  messageId: number,
): Promise<void> {
  await client.request("/rest/v1/rpc/quarantine_malformed_evidence_queue_message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_message_id: messageId }),
  });
}

export async function settleEvidenceQueueMessage(
  client: SupabaseRestClient,
  messageId: number,
  processingRunId: string,
): Promise<boolean> {
  return client.request<boolean>("/rest/v1/rpc/settle_evidence_queue_message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_message_id: messageId,
      target_processing_run_id: processingRunId,
    }),
  });
}

import {
  frameworkComparisonSchema,
  frameworkReanalysisResultSchema,
  type FrameworkComparison,
  type FrameworkReanalysisResult,
  type ScorecardCriterion,
} from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

export async function getCriterionRevisionContext(
  client: SupabaseRestClient,
  jobId: string,
  lineageId: string,
): Promise<unknown> {
  return client.request<unknown>("/rest/v1/rpc/criterion_revision_context", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_job_id: jobId,
      target_lineage_id: lineageId,
    }),
  });
}

export async function createScorecardRevision(
  client: SupabaseRestClient,
  input: {
    sourceScorecardVersionId: string;
    expectedVersionNumber: number;
    reason: string;
  },
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_scorecard_revision", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      source_scorecard_version_id: input.sourceScorecardVersionId,
      expected_version_number: input.expectedVersionNumber,
      expected_status: "APPROVED",
      reason: input.reason,
    }),
  });
}

export async function createFrameworkRevisionDraft(
  client: SupabaseRestClient,
  input: {
    sourceScorecardVersionId: string;
    expectedVersionNumber: number;
    findingLineageId: string;
    reason: string;
    promptVersion: string;
    schemaVersion: string;
    modelId: string;
    criteria: ScorecardCriterion[];
  },
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_framework_revision_draft", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      source_scorecard_version_id: input.sourceScorecardVersionId,
      expected_version_number: input.expectedVersionNumber,
      finding_lineage_id: input.findingLineageId,
      revision_reason: input.reason,
      revision_prompt_version: input.promptVersion,
      revision_schema_version: input.schemaVersion,
      revision_model_id: input.modelId,
      draft_criteria: input.criteria,
    }),
  });
}

export async function recordCriterionCalibrationNoAction(
  client: SupabaseRestClient,
  input: { jobId: string; lineageId: string; reason: string },
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/record_criterion_calibration_no_action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_job_id: input.jobId,
      target_lineage_id: input.lineageId,
      reason: input.reason,
    }),
  });
}

export async function enqueueFrameworkReanalysis(
  client: SupabaseRestClient,
  input: { jobId: string; pipelineVersion: string },
): Promise<FrameworkReanalysisResult> {
  const response = await client.request<unknown>("/rest/v1/rpc/enqueue_framework_reanalysis", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_job_id: input.jobId,
      target_pipeline_version: input.pipelineVersion,
    }),
  });
  return frameworkReanalysisResultSchema.parse(response);
}

export async function getFrameworkRevisionComparison(
  client: SupabaseRestClient,
  jobId: string,
): Promise<FrameworkComparison | null> {
  const response = await client.request<unknown>("/rest/v1/rpc/framework_revision_comparison", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ target_job_id: jobId }),
  });
  return response === null ? null : frameworkComparisonSchema.parse(response);
}

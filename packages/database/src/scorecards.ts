import type {
  ScorecardAmbiguityReviewInput,
  ScorecardApprovalInput,
  ScorecardCriterion,
  ScorecardDetail,
  ScorecardDraft,
  ScorecardDraftUpdateInput,
  ScorecardIssueConfirmationInput,
  ScorecardVersionRecord,
  ScorecardVersionHistoryRecord,
  ScorecardWorkspace,
} from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const versionSelect =
  "id,job_id,version_number,status,source_job_description_hash,prompt_version,schema_version,model_id,ambiguous_phrases,confirmed_job_description_issue_keys,confirmed_evaluation_criterion_ids,created_by,approved_by,approved_at,content_revision,created_at";
const criterionSelect =
  "id,scorecard_version_id,client_id,name,type,definition,accepted_evidence,alternative_evidence,excluded_evidence,partial_evidence_guidance,resume_assessable,evidence_fields,source_phrase,ambiguity_note,ambiguity_status,suggested_interview_question,lineage_id,lineage_origin,parent_lineage_ids,display_order,created_at";
const versionHistorySelect = `${versionSelect},approver:profiles!scorecard_versions_approved_by_fkey(display_name)`;

export interface CreateScorecardDraftRequest {
  jobId: string;
  sourceJobDescriptionHash: string;
  promptVersion: string;
  schemaVersion: string;
  modelId: string;
  ambiguousPhrases: unknown[];
  criteria: ScorecardCriterion[];
}

export type ReviewScorecardAmbiguityRequest = ScorecardAmbiguityReviewInput;
export type ApproveScorecardRequest = ScorecardApprovalInput;
export interface UpdateScorecardDraftRequest extends ScorecardDraftUpdateInput {
  draft: ScorecardDraft;
}

async function getCriteriaForVersion(
  client: SupabaseRestClient,
  scorecardVersionId: string,
): Promise<ScorecardDetail["criteria"]> {
  const criterionParams = new URLSearchParams({
    select: criterionSelect,
    scorecard_version_id: `eq.${scorecardVersionId}`,
    order: "display_order.asc",
  });

  return client.request<ScorecardDetail["criteria"]>(
    `/rest/v1/criteria?${criterionParams.toString()}`,
  );
}

export async function getScorecardVersion(
  client: SupabaseRestClient,
  scorecardVersionId: string,
): Promise<ScorecardDetail | null> {
  const versionParams = new URLSearchParams({
    select: versionSelect,
    id: `eq.${scorecardVersionId}`,
    limit: "1",
  });
  const versions = await client.request<ScorecardVersionRecord[]>(
    `/rest/v1/scorecard_versions?${versionParams.toString()}`,
  );
  const version = versions[0];
  if (!version) return null;
  return { version, criteria: await getCriteriaForVersion(client, version.id) };
}

export async function getScorecardForJob(
  client: SupabaseRestClient,
  jobId: string,
): Promise<ScorecardDetail | null> {
  const versionParams = new URLSearchParams({
    select: versionSelect,
    job_id: `eq.${jobId}`,
    order: "version_number.desc",
    limit: "1",
  });
  const versions = await client.request<ScorecardVersionRecord[]>(
    `/rest/v1/scorecard_versions?${versionParams.toString()}`,
  );
  const version = versions[0];

  if (!version) {
    return null;
  }

  const criteria = await getCriteriaForVersion(client, version.id);

  return { version, criteria };
}

export async function getScorecardWorkspaceForJob(
  client: SupabaseRestClient,
  jobId: string,
): Promise<ScorecardWorkspace> {
  const versionParams = new URLSearchParams({
    select: versionHistorySelect,
    job_id: `eq.${jobId}`,
    order: "version_number.desc",
  });
  const versionHistory = await client.request<ScorecardVersionHistoryRecord[]>(
    `/rest/v1/scorecard_versions?${versionParams.toString()}`,
  );
  const workingVersion = versionHistory.find(
    (version) => version.status === "DRAFT" || version.status === "PENDING_APPROVAL",
  );
  const approvedVersion = versionHistory.find((version) => version.status === "APPROVED");

  const [workingCriteria, approvedCriteria] = await Promise.all([
    workingVersion ? getCriteriaForVersion(client, workingVersion.id) : Promise.resolve(null),
    approvedVersion ? getCriteriaForVersion(client, approvedVersion.id) : Promise.resolve(null),
  ]);

  return {
    latestWorkingVersion:
      workingVersion && workingCriteria
        ? { version: workingVersion, criteria: workingCriteria }
        : null,
    activeApprovedVersion:
      approvedVersion && approvedCriteria
        ? { version: approvedVersion, criteria: approvedCriteria }
        : null,
    versionHistory,
  };
}

export async function createScorecardDraft(
  client: SupabaseRestClient,
  input: CreateScorecardDraftRequest,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_scorecard_draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      target_job_id: input.jobId,
      source_job_description_hash: input.sourceJobDescriptionHash,
      prompt_version: input.promptVersion,
      schema_version: input.schemaVersion,
      model_id: input.modelId,
      ambiguous_phrases: input.ambiguousPhrases,
      draft_criteria: input.criteria,
    }),
  });
}

export async function updateScorecardDraft(
  client: SupabaseRestClient,
  input: UpdateScorecardDraftRequest,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/update_scorecard_draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_scorecard_version_id: input.scorecardVersionId,
      expected_version_number: input.expectedVersionNumber,
      expected_status: input.expectedStatus,
      expected_content_revision: input.expectedContentRevision,
      reason: null,
      ambiguous_phrases: input.draft.ambiguous_phrases,
      draft_criteria: input.draft.criteria,
    }),
  });
}

export async function reviewScorecardAmbiguity(
  client: SupabaseRestClient,
  input: ReviewScorecardAmbiguityRequest,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/review_scorecard_ambiguity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target_scorecard_version_id: input.scorecardVersionId,
      target_criterion_id: input.criterionId,
      resolution: input.resolution,
      new_type: input.criterionType,
      new_definition: input.definition,
      new_accepted_evidence: input.acceptedEvidence,
      new_alternative_evidence: input.alternativeEvidence,
      new_resume_assessable: input.resumeAssessable,
      new_suggested_interview_question: input.suggestedInterviewQuestion,
      reason: input.reason,
      expected_snapshot: input.expectedSnapshot,
    }),
  });
}

export async function approveScorecard(
  client: SupabaseRestClient,
  input: ApproveScorecardRequest,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/approve_scorecard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target_scorecard_version_id: input.scorecardVersionId,
      expected_version_number: input.expectedVersionNumber,
      expected_status: input.expectedStatus,
      expected_content_revision: input.expectedContentRevision,
      reason: null,
    }),
  });
}

export async function confirmScorecardIssue(
  client: SupabaseRestClient,
  input: ScorecardIssueConfirmationInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/confirm_scorecard_issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_scorecard_version_id: input.scorecardVersionId,
      expected_content_revision: input.expectedContentRevision,
      issue_scope: input.issueScope,
      issue_key: input.issueKey,
    }),
  });
}

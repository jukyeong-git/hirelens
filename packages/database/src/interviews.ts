import type {
  CriterionCalibrationSummaryRecord,
  InterviewObservationRecord,
  InterviewObservationSessionRecord,
  PostInterviewReviewInput,
} from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

export async function recordPostInterviewReview(
  client: SupabaseRestClient,
  input: PostInterviewReviewInput,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/record_post_interview_review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_application_id: input.applicationId,
      target_scorecard_version_id: input.scorecardVersionId,
      observations: input.observations.map((observation) => ({
        criterion_id: observation.criterionId,
        verdict: observation.verdict,
        weakness_type: observation.weaknessType,
        note: observation.note,
      })),
      off_criteria_reason_value: input.offCriteriaReason,
      new_decision: input.decision,
      new_reason_code: input.reasonCode,
      new_reason_detail: input.reasonDetail,
      new_confidence: input.confidence,
      new_note: input.note,
    }),
  });
}

export async function listInterviewObservationSessions(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<InterviewObservationSessionRecord[]> {
  const params = new URLSearchParams({
    select:
      "id,application_id,scorecard_version_id,reviewer_id,off_criteria_reason,supersedes_session_id,created_at",
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<InterviewObservationSessionRecord[]>(
    `/rest/v1/interview_observation_sessions?${params.toString()}`,
  );
}

export async function listInterviewObservations(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<InterviewObservationRecord[]> {
  const params = new URLSearchParams({
    select:
      "id,interview_observation_session_id,application_id,criterion_id,criterion_lineage_id,verdict,weakness_type,note,source,ai_draft_accepted,confirmed_at,observer_id,created_at",
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<InterviewObservationRecord[]>(
    `/rest/v1/interview_observations?${params.toString()}`,
  );
}

export async function getCriterionCalibrationSummary(
  client: SupabaseRestClient,
  jobId: string,
): Promise<CriterionCalibrationSummaryRecord[]> {
  return client.request<CriterionCalibrationSummaryRecord[]>(
    "/rest/v1/rpc/criterion_calibration_summary",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ target_job_id: jobId }),
    },
  );
}

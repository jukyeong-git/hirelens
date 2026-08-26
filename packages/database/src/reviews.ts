import type {
  CreateHumanReviewInput,
  HumanReviewRecord,
  InterviewProgressionReviewRecord,
  RecordInterviewProgressionInput,
  RequestHiringManagerReviewInput,
  ReviewAssignmentRecord,
} from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const reviewSelect =
  "id,application_id,scorecard_version_id,reviewer_id,decision,reason_code,reason_detail,confidence,note,supersedes_review_id,created_at";

export async function listHumanReviews(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<HumanReviewRecord[]> {
  const params = new URLSearchParams({
    select: reviewSelect,
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<HumanReviewRecord[]>(`/rest/v1/human_reviews?${params.toString()}`);
}

export async function createHumanReview(
  client: SupabaseRestClient,
  input: CreateHumanReviewInput,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_human_review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_application_id: input.applicationId,
      target_scorecard_version_id: input.scorecardVersionId,
      new_decision: input.decision,
      new_reason_code: input.reasonCode,
      new_reason_detail: input.reasonDetail,
      new_confidence: input.confidence,
      new_note: input.note ?? null,
    }),
  });
}

export async function listReviewAssignments(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<ReviewAssignmentRecord[]> {
  const params = new URLSearchParams({
    select: "id,application_id,assigned_to,assigned_by,request_note,status,created_at,completed_at",
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<ReviewAssignmentRecord[]>(
    `/rest/v1/review_assignments?${params.toString()}`,
  );
}

export async function requestHiringManagerReview(
  client: SupabaseRestClient,
  input: RequestHiringManagerReviewInput,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/request_hiring_manager_review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_application_id: input.applicationId,
      request_note_value: input.note ?? null,
    }),
  });
}

export async function listInterviewProgressionReviews(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<InterviewProgressionReviewRecord[]> {
  const params = new URLSearchParams({
    select:
      "id,application_id,scorecard_version_id,reviewer_id,outcome,reason,supersedes_review_id,created_at",
    application_id: `eq.${applicationId}`,
    order: "created_at.desc",
  });
  return client.request<InterviewProgressionReviewRecord[]>(
    `/rest/v1/interview_progression_reviews?${params.toString()}`,
  );
}

export async function recordInterviewProgression(
  client: SupabaseRestClient,
  input: RecordInterviewProgressionInput,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/record_interview_progression", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      target_application_id: input.applicationId,
      target_scorecard_version_id: input.scorecardVersionId,
      new_outcome: input.outcome,
      new_reason: input.reason,
    }),
  });
}

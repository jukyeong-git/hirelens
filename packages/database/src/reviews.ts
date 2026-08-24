import type { CreateHumanReviewInput, HumanReviewRecord } from "@hirelens/domain";

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

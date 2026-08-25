import type { ApplicationReviewRecord } from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const applicationSelect =
  "id,candidate_id,job_id,source,submitted_at,workflow_state,created_at,candidate:candidates(demo_label)";

export async function listApplicationsForJob(
  client: SupabaseRestClient,
  jobId: string,
): Promise<ApplicationReviewRecord[]> {
  const params = new URLSearchParams({
    select: applicationSelect,
    job_id: `eq.${jobId}`,
    order: "submitted_at.desc",
  });
  return client.request<ApplicationReviewRecord[]>(`/rest/v1/applications?${params.toString()}`);
}

export async function listApplicationsForJobs(
  client: SupabaseRestClient,
  jobIds: string[],
): Promise<ApplicationReviewRecord[]> {
  if (jobIds.length === 0) return [];

  const params = new URLSearchParams({
    select: applicationSelect,
    job_id: `in.(${jobIds.join(",")})`,
    order: "submitted_at.desc",
  });
  return client.request<ApplicationReviewRecord[]>(`/rest/v1/applications?${params.toString()}`);
}

export async function getApplicationForReview(
  client: SupabaseRestClient,
  applicationId: string,
): Promise<ApplicationReviewRecord | null> {
  const params = new URLSearchParams({
    select: applicationSelect,
    id: `eq.${applicationId}`,
    limit: "1",
  });
  const applications = await client.request<ApplicationReviewRecord[]>(
    `/rest/v1/applications?${params.toString()}`,
  );
  return applications[0] ?? null;
}

import type { CreateJobInput, JobRecord, JobSummary, ProfileRecord } from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const jobSelect = "id,title,department,status,recruiter_id,hiring_manager_id,created_at,updated_at";
const scorecardJobSelect =
  "id,title,department,raw_job_description,status,recruiter_id,hiring_manager_id,created_at,updated_at";

export async function listJobs(client: SupabaseRestClient): Promise<JobSummary[]> {
  const params = new URLSearchParams({
    select: jobSelect,
    order: "updated_at.desc",
  });

  return client.request<JobSummary[]>(`/rest/v1/jobs?${params.toString()}`);
}

export async function listProfiles(client: SupabaseRestClient): Promise<ProfileRecord[]> {
  const params = new URLSearchParams({
    select: "id,display_name,role",
    order: "display_name.asc",
  });

  return client.request<ProfileRecord[]>(`/rest/v1/profiles?${params.toString()}`);
}

export async function getJobForScorecard(
  client: SupabaseRestClient,
  jobId: string,
): Promise<JobRecord | null> {
  const params = new URLSearchParams({
    select: scorecardJobSelect,
    id: `eq.${jobId}`,
    limit: "1",
  });
  const jobs = await client.request<JobRecord[]>(`/rest/v1/jobs?${params.toString()}`);

  return jobs[0] ?? null;
}

export async function getProfile(
  client: SupabaseRestClient,
  profileId: string,
): Promise<ProfileRecord | null> {
  const params = new URLSearchParams({
    select: "id,display_name,role",
    id: `eq.${profileId}`,
    limit: "1",
  });
  const profiles = await client.request<ProfileRecord[]>(`/rest/v1/profiles?${params.toString()}`);

  return profiles[0] ?? null;
}

export async function createJob(
  client: SupabaseRestClient,
  input: CreateJobInput,
): Promise<JobRecord> {
  const response = await client.request<JobRecord[]>("/rest/v1/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      title: input.title,
      department: input.department,
      raw_job_description: input.rawJobDescription,
      recruiter_id: input.recruiterId,
      hiring_manager_id: input.hiringManagerId,
    }),
  });

  const job = response[0];
  if (!job) {
    throw new Error("Supabase returned no created job");
  }

  return job;
}

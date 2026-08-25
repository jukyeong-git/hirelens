import type {
  AssignRequisitionApproverInput,
  CreateJobInput,
  JobPostingActionInput,
  JobPostingContentInput,
  JobPostingRecord,
  JobPostingStatusHistoryRecord,
  JobRecord,
  PublicJobPostingRecord,
  PublicJobPostingSummary,
  JobSummary,
  ProfileRecord,
  RequisitionStatusHistoryRecord,
  ResolveRequisitionApprovalInput,
  SubmitRequisitionInput,
} from "@hirelens/domain";

import type { SupabaseRestClient } from "./rest";

const jobSelect =
  "id,title,department,hiring_need,status,requisition_status,recruiter_id,hiring_manager_id,requisition_approver_id,is_synthetic_demo,submitted_at,approval_reason,approved_or_returned_at,created_at,updated_at";
const scorecardJobSelect =
  "id,title,department,hiring_need,raw_job_description,status,requisition_status,recruiter_id,hiring_manager_id,requisition_approver_id,is_synthetic_demo,submitted_at,approval_reason,approved_or_returned_at,created_at,updated_at";

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
      hiring_need: input.hiringNeed,
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

export async function assignRequisitionApprover(
  client: SupabaseRestClient,
  input: AssignRequisitionApproverInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/assign_requisition_approver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_job_id: input.jobId, target_approver_id: input.approverId }),
  });
}

export async function submitRequisition(
  client: SupabaseRestClient,
  input: SubmitRequisitionInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/submit_requisition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_job_id: input.jobId }),
  });
}

export async function resolveRequisitionApproval(
  client: SupabaseRestClient,
  input: ResolveRequisitionApprovalInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/resolve_requisition_approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_job_id: input.jobId,
      target_status: input.status,
      decision_reason: input.reason,
    }),
  });
}

export async function listRequisitionStatusHistory(
  client: SupabaseRestClient,
  jobId: string,
): Promise<RequisitionStatusHistoryRecord[]> {
  const params = new URLSearchParams({
    select: "id,job_id,actor_id,actor_role,prior_status,new_status,reason,created_at",
    job_id: `eq.${jobId}`,
    order: "created_at.asc",
  });
  return client.request<RequisitionStatusHistoryRecord[]>(
    `/rest/v1/requisition_status_history?${params.toString()}`,
  );
}

export async function getJobPosting(
  client: SupabaseRestClient,
  jobId: string,
): Promise<JobPostingRecord | null> {
  const params = new URLSearchParams({
    select:
      "id,job_id,status,public_slug,public_title,public_summary,public_responsibilities,public_requirements,public_location,public_employment_type,created_by,published_by,published_at,closed_by,closed_at,created_at,updated_at",
    job_id: `eq.${jobId}`,
    limit: "1",
  });
  const postings = await client.request<JobPostingRecord[]>(
    `/rest/v1/job_postings?${params.toString()}`,
  );
  return postings[0] ?? null;
}

export async function listJobPostingsForJobs(
  client: SupabaseRestClient,
  jobIds: string[],
): Promise<JobPostingRecord[]> {
  if (jobIds.length === 0) return [];

  const params = new URLSearchParams({
    select:
      "id,job_id,status,public_slug,public_title,public_summary,public_responsibilities,public_requirements,public_location,public_employment_type,created_by,published_by,published_at,closed_by,closed_at,created_at,updated_at",
    job_id: `in.(${jobIds.join(",")})`,
    order: "updated_at.desc",
  });
  return client.request<JobPostingRecord[]>(`/rest/v1/job_postings?${params.toString()}`);
}

export async function updateJobPostingContent(
  client: SupabaseRestClient,
  input: JobPostingContentInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/update_job_posting_content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_job_id: input.jobId,
      target_public_title: input.publicTitle,
      target_public_summary: input.publicSummary,
      target_public_responsibilities: input.publicResponsibilities,
      target_public_requirements: input.publicRequirements,
      target_public_location: input.publicLocation,
      target_public_employment_type: input.publicEmploymentType,
    }),
  });
}

export async function getPublicJobPosting(
  client: SupabaseRestClient,
  slug: string,
): Promise<PublicJobPostingRecord | null> {
  // Use POST for the RPC so the slug is passed as the function argument, not
  // interpreted as a PostgREST filter on the returned table.
  const postings = await client.request<PublicJobPostingRecord[]>(
    "/rest/v1/rpc/get_public_job_posting",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_public_slug: slug }),
    },
  );
  return postings[0] ?? null;
}

export async function listPublicJobPostings(
  client: SupabaseRestClient,
): Promise<PublicJobPostingSummary[]> {
  const postings = await client.request<PublicJobPostingSummary[]>(
    "/rest/v1/rpc/list_public_job_postings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  return postings;
}

export async function createJobPostingDraft(
  client: SupabaseRestClient,
  input: JobPostingActionInput,
): Promise<string> {
  return client.request<string>("/rest/v1/rpc/create_job_posting_draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_job_id: input.jobId }),
  });
}

export async function publishJobPosting(
  client: SupabaseRestClient,
  input: JobPostingActionInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/publish_job_posting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_job_id: input.jobId }),
  });
}

export async function closeJobPosting(
  client: SupabaseRestClient,
  input: JobPostingActionInput,
): Promise<void> {
  await client.request<unknown>("/rest/v1/rpc/close_job_posting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_job_id: input.jobId }),
  });
}

export async function listJobPostingStatusHistory(
  client: SupabaseRestClient,
  jobId: string,
): Promise<JobPostingStatusHistoryRecord[]> {
  const params = new URLSearchParams({
    select: "id,job_posting_id,job_id,actor_id,actor_role,prior_status,new_status,created_at",
    job_id: `eq.${jobId}`,
    order: "created_at.asc",
  });
  return client.request<JobPostingStatusHistoryRecord[]>(
    `/rest/v1/job_posting_status_history?${params.toString()}`,
  );
}

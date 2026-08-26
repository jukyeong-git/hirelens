import { describe, expect, it } from "vitest";

import { buildRoleWorkspace, selectWorkspaceJobs } from "./workspace";
import type {
  ApplicationReviewRecord,
  JobPostingRecord,
  JobSummary,
  NotificationRecord,
} from "./index";

const recruiterId = "00000000-0000-0000-0000-000000000001";
const hiringManagerId = "00000000-0000-0000-0000-000000000002";

const jobs: JobSummary[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    title: "Backend Engineer",
    department: "Engineering",
    hiring_need: "Synthetic hiring need",
    status: "READY_FOR_INTAKE",
    requisition_status: "APPROVED",
    recruiter_id: recruiterId,
    hiring_manager_id: hiringManagerId,
    requisition_approver_id: null,
    is_synthetic_demo: true,
    submitted_at: null,
    approval_reason: null,
    approved_or_returned_at: null,
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
  },
];

const applications: ApplicationReviewRecord[] = [
  {
    id: "50000000-0000-0000-0000-000000000001",
    candidate_id: "40000000-0000-0000-0000-000000000001",
    job_id: jobs[0]!.id,
    source: "TEST",
    submitted_at: "2026-08-25T00:00:00Z",
    workflow_state: "MANAGER_REVIEW_REQUESTED",
    created_at: "2026-08-25T00:00:00Z",
    candidate: null,
  },
];

const postings: JobPostingRecord[] = [
  {
    id: "60000000-0000-0000-0000-000000000001",
    job_id: jobs[0]!.id,
    status: "PUBLISHED",
    public_slug: "posting-1",
    public_title: null,
    public_summary: null,
    public_responsibilities: null,
    public_requirements: null,
    public_preferred_qualifications: null,
    public_location: null,
    public_employment_type: null,
    created_by: recruiterId,
    published_by: recruiterId,
    published_at: "2026-08-25T00:00:00Z",
    closed_by: null,
    closed_at: null,
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
  },
];

const notifications: NotificationRecord[] = [
  {
    id: "70000000-0000-0000-0000-000000000001",
    recipient_id: recruiterId,
    event_type: "PROCESSING_COMPLETED",
    aggregate_type: "application",
    aggregate_id: applications[0]!.id,
    relevant_version: "v1",
    safe_metadata: {},
    read_at: null,
    created_at: "2026-08-25T00:00:00Z",
  },
];

describe("role workspace", () => {
  it("shows Recruiters only assigned jobs that reached intake while Hiring Managers retain drafts", () => {
    const draftJob: JobSummary = {
      ...jobs[0]!,
      id: "10000000-0000-0000-0000-000000000002",
      status: "DRAFT",
      requisition_status: "DRAFT",
    };
    const assignedJobs = [...jobs, draftJob];

    expect(selectWorkspaceJobs(assignedJobs, recruiterId, "RECRUITER")).toEqual(jobs);
    expect(selectWorkspaceJobs(assignedJobs, hiringManagerId, "HIRING_MANAGER")).toEqual(
      assignedJobs,
    );
  });

  it("keeps recruiter and hiring-manager job collections scoped to their assignment", () => {
    expect(selectWorkspaceJobs(jobs, recruiterId, "RECRUITER")).toEqual(jobs);
    expect(selectWorkspaceJobs(jobs, hiringManagerId, "HIRING_MANAGER")).toEqual(jobs);
  });

  it("uses recruiter-specific metrics and work items", () => {
    const workspace = buildRoleWorkspace({
      role: "RECRUITER",
      jobs,
      applications,
      postings,
      notifications,
    });

    expect(workspace.title).toBe("채용 담당자 홈");
    expect(workspace.metrics.find((metric) => metric.label === "게시 중 공고")?.value).toBe(1);
    expect(workspace.metrics.find((metric) => metric.label === "새 업무")?.value).toBe(1);
    expect(workspace.notifications).toHaveLength(1);
  });

  it("omits completed notifications from workspace work items and metrics", () => {
    const workspace = buildRoleWorkspace({
      role: "HIRING_MANAGER",
      jobs,
      applications,
      postings,
      notifications: [
        { ...notifications[0]!, event_type: "REVIEW_ASSIGNMENT", recipient_id: hiringManagerId },
        {
          ...notifications[0]!,
          id: "80000000-0000-0000-0000-000000000099",
          event_type: "REVIEW_ASSIGNMENT",
          recipient_id: hiringManagerId,
          read_at: "2026-08-26T00:00:00.000Z",
        },
      ],
    });

    expect(workspace.metrics.find((metric) => metric.label === "새 업무")?.value).toBe(1);
    expect(workspace.notifications).toHaveLength(1);
    expect(workspace.notifications[0]?.read_at).toBeNull();
  });

  it("counts an intake-ready job without a published posting as Recruiter work", () => {
    const workspace = buildRoleWorkspace({
      role: "RECRUITER",
      jobs,
      applications: [],
      postings: [],
      notifications: [],
    });

    expect(workspace.metrics.find((metric) => metric.label === "새 업무")?.value).toBe(1);
  });

  it("uses hiring-manager review data instead of recruiter publishing data", () => {
    const workspace = buildRoleWorkspace({
      role: "HIRING_MANAGER",
      jobs,
      applications,
      postings,
      notifications: [
        { ...notifications[0]!, event_type: "REVIEW_ASSIGNMENT", recipient_id: hiringManagerId },
      ],
    });

    expect(workspace.title).toBe("채용 책임자 홈");
    expect(workspace.metrics.find((metric) => metric.label === "후보자 검토")?.value).toBe(1);
    expect(workspace.metrics.some((metric) => metric.label === "게시 중 공고")).toBe(false);
  });
});

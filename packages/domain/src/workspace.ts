import type { ApplicationReviewRecord } from "./review";
import type { JobPostingRecord, JobSummary } from "./job";
import type { NotificationRecord } from "./notification";
import type { AppRole } from "./job";

export interface WorkspaceMetric {
  label: string;
  value: number;
}

export interface RoleWorkspace {
  title: string;
  jobsTitle: string;
  emptyJobsTitle: string;
  metrics: WorkspaceMetric[];
  notifications: NotificationRecord[];
}

export function selectWorkspaceJobs(
  jobs: JobSummary[],
  viewerId: string,
  role: Exclude<AppRole, "REQUISITION_APPROVER">,
): JobSummary[] {
  if (role === "ADMIN") return jobs;

  return jobs.filter((job) =>
    role === "RECRUITER" ? job.recruiter_id === viewerId : job.hiring_manager_id === viewerId,
  );
}

export function buildRoleWorkspace(input: {
  role: Exclude<AppRole, "REQUISITION_APPROVER">;
  jobs: JobSummary[];
  applications: ApplicationReviewRecord[];
  postings: JobPostingRecord[];
  notifications: NotificationRecord[];
}): RoleWorkspace {
  const { role, jobs, applications, postings, notifications } = input;
  const unreadNotifications = notifications.filter((notification) => !notification.read_at);
  const criteriaPending = jobs.filter((job) => job.status === "SCORECARD_PENDING_APPROVAL").length;
  const newApplications = applications.filter(
    (application) => application.workflow_state === "NEW",
  ).length;
  const managerReviewRequests = applications.filter(
    (application) => application.workflow_state === "MANAGER_REVIEW_REQUESTED",
  ).length;
  const publishedPostings = postings.filter((posting) => posting.status === "PUBLISHED").length;

  if (role === "RECRUITER") {
    return {
      title: "채용 담당자 홈",
      jobsTitle: "진행 중인 채용 요청",
      emptyJobsTitle: "채용 요청이 없습니다.",
      metrics: [
        { label: "채용 요청", value: jobs.length },
        { label: "새 지원서", value: newApplications },
        { label: "게시 중 공고", value: publishedPostings },
        { label: "새 업무", value: unreadNotifications.length },
      ],
      notifications: notifications.filter(
        (notification) =>
          notification.event_type === "PROCESSING_COMPLETED" ||
          notification.event_type === "DECISION_FOLLOW_UP",
      ),
    };
  }

  if (role === "HIRING_MANAGER") {
    return {
      title: "채용 책임자 홈",
      jobsTitle: "채용 리스트",
      emptyJobsTitle: "채용 요청이 없습니다.",
      metrics: [
        { label: "채용 요청", value: jobs.length },
        { label: "검토 기준 대기", value: criteriaPending },
        { label: "후보자 검토", value: managerReviewRequests },
        { label: "새 업무", value: unreadNotifications.length },
      ],
      notifications: notifications.filter(
        (notification) =>
          notification.event_type === "SCORECARD_APPROVAL_REQUEST" ||
          notification.event_type === "REVIEW_ASSIGNMENT" ||
          notification.event_type === "DECISION_FOLLOW_UP",
      ),
    };
  }

  return {
    title: "관리자 홈",
    jobsTitle: "채용 요청 현황",
    emptyJobsTitle: "채용 요청이 없습니다.",
    metrics: [
      { label: "전체 채용 요청", value: jobs.length },
      { label: "검토 기준 대기", value: criteriaPending },
      { label: "검토 요청", value: managerReviewRequests },
      {
        label: "처리 실패",
        value: unreadNotifications.filter((item) => item.event_type === "PROCESSING_FAILED").length,
      },
    ],
    notifications: notifications.filter(
      (notification) => notification.event_type === "PROCESSING_FAILED",
    ),
  };
}

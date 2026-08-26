import {
  listApplicationsForJobs,
  listJobPostingsForJobs,
  listJobs,
  listNotifications,
  listProfiles,
} from "@hirelens/database";
import { buildRoleWorkspace, selectWorkspaceJobs } from "@hirelens/domain";
import Link from "next/link";

import { JobList } from "./_components/job-list";
import { LoginForm } from "./_components/login-form";
import { markNotificationReadAction } from "./actions";
import { getAuthenticatedViewer } from "../../lib/supabase-server";
import { visibleCopy } from "../_components/visible-copy";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const authenticated = await getAuthenticatedViewer();

  if (!authenticated) {
    return (
      <main className="auth-shell" id="main-content">
        <section className="auth-card" aria-labelledby="login-title">
          <LoginForm />
        </section>
      </main>
    );
  }

  const { client, viewer } = authenticated;
  if (viewer.role === "REQUISITION_APPROVER") {
    return (
      <main className="app-shell" id="main-content">
        <header className="app-header requisition-header">
          <h1>MVP에서 제공하지 않는 역할입니다.</h1>
        </header>
        <section className="panel" aria-labelledby="unsupported-role-title">
          <h2 id="unsupported-role-title">Requisition Approver</h2>
          <p className="section-copy">
            채용 요청 승인 역할은 현재 MVP 범위에 포함되지 않습니다. Hiring Manager가 채용 요청을
            작성하고, 승인된 평가 기준을 기준으로 다음 단계로 진행합니다.
          </p>
        </section>
      </main>
    );
  }

  const [jobs, profiles, notifications] = await Promise.all([
    listJobs(client),
    listProfiles(client),
    listNotifications(client),
  ]);
  const workspaceJobs = selectWorkspaceJobs(jobs, viewer.id, viewer.role);
  const jobIds = workspaceJobs.map((job) => job.id);
  const [applicationsResult, postingsResult] = await Promise.allSettled([
    listApplicationsForJobs(client, jobIds),
    listJobPostingsForJobs(client, jobIds),
  ]);
  const applications = applicationsResult.status === "fulfilled" ? applicationsResult.value : [];
  const postings = postingsResult.status === "fulfilled" ? postingsResult.value : [];
  const workspace = buildRoleWorkspace({
    role: viewer.role,
    jobs: workspaceJobs,
    applications,
    postings,
    notifications,
  });
  const recruiterIntakeJobs =
    viewer.role === "RECRUITER"
      ? workspaceJobs.filter(
          (job) =>
            job.status === "READY_FOR_INTAKE" &&
            !postings.some(
              (posting) => posting.job_id === job.id && posting.status === "PUBLISHED",
            ),
        )
      : [];
  const pendingWorkCount =
    recruiterIntakeJobs.length + workspace.notifications.filter((item) => !item.read_at).length;
  const workspaceTitle = `${visibleCopy(viewer.displayName)} 홈`;
  const safeProfiles = profiles.map((profile) => ({
    ...profile,
    display_name: visibleCopy(profile.display_name),
  }));
  const profileById = new Map(safeProfiles.map((profile) => [profile.id, profile.display_name]));
  const jobsWithNames = workspaceJobs.map((job) => ({
    ...job,
    recruiter_name: profileById.get(job.recruiter_id) ?? null,
    hiring_manager_name: profileById.get(job.hiring_manager_id) ?? null,
    posting_status: postings.find((posting) => posting.job_id === job.id)?.status ?? null,
  }));
  const hasPartialParticipantData = jobsWithNames.some(
    (job) => job.recruiter_name === null || job.hiring_manager_name === null,
  );

  return (
    <main className="app-shell" id="main-content">
      <header className="app-header requisition-header" aria-labelledby="workspace-title">
        <h1 id="workspace-title">{workspaceTitle}</h1>
      </header>

      {hasPartialParticipantData ||
      applicationsResult.status === "rejected" ||
      postingsResult.status === "rejected" ? (
        <p className="form-alert form-alert-warning" role="status">
          일부 작업 정보를 불러오지 못했습니다. 접근 권한과 데이터 연결을 확인한 뒤 다시 시도하세요.
        </p>
      ) : null}

      <section className="workspace-summary-grid" aria-label={`${workspaceTitle} 요약`}>
        {workspace.metrics.map((metric) => (
          <article className="workspace-summary-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel workspace-tasks-panel" aria-labelledby="notifications-title">
        <div className="section-heading section-heading-inline">
          <div>
            <h2 id="notifications-title">내 업무</h2>
          </div>
          <span className="count-label">{pendingWorkCount}건 처리 필요</span>
        </div>
        {recruiterIntakeJobs.length === 0 && workspace.notifications.length === 0 ? (
          <p className="section-copy">현재 처리할 업무가 없습니다.</p>
        ) : (
          <div className="workspace-task-list">
            {recruiterIntakeJobs.map((job) => (
              <div key={`intake-${job.id}`} className="workspace-task-item">
                <div>
                  <strong>{job.title} 공고 준비</strong>
                  <p>공고 게시 준비 · 처리 필요</p>
                </div>
                <div className="workspace-task-actions">
                  <Link className="button button-secondary" href={`/jobs/${job.id}?tab=posting`}>
                    공고 준비 열기
                  </Link>
                </div>
              </div>
            ))}
            {workspace.notifications.slice(0, 5).map((notification) => (
              <div key={notification.id} className="workspace-task-item">
                <div>
                  <strong>{notificationLabel(notification.event_type)}</strong>
                  <p>{notification.read_at ? "확인 완료" : "처리 필요"}</p>
                </div>
                <div className="workspace-task-actions">
                  {notification.aggregate_type === "job" ? (
                    <Link
                      className="button button-secondary"
                      href={`/jobs/${notification.aggregate_id}`}
                    >
                      채용 요청 열기
                    </Link>
                  ) : notification.aggregate_type === "application" ? (
                    <Link
                      className="button button-secondary"
                      href={`/applications/${notification.aggregate_id}`}
                    >
                      지원서 열기
                    </Link>
                  ) : null}
                  {!notification.read_at && notification.recipient_id === viewer.id ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <button className="button button-quiet" type="submit">
                        확인 완료
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="workspace-section-heading">
        <div>
          <h2>{workspace.jobsTitle}</h2>
        </div>
        {viewer.role === "HIRING_MANAGER" ? (
          <Link className="button button-primary" href="/jobs/new">
            채용 생성
          </Link>
        ) : null}
      </div>

      <JobList
        jobs={jobsWithNames}
        title={`${workspace.jobsTitle} 목록`}
        emptyTitle={workspace.emptyJobsTitle}
      />
    </main>
  );
}

function notificationLabel(eventType: string) {
  return (
    {
      SCORECARD_APPROVAL_REQUEST: "채용 요청 확인",
      REVIEW_ASSIGNMENT: "지원서 검토가 배정되었습니다",
      PROCESSING_COMPLETED: "지원서 처리가 완료되었습니다",
      PROCESSING_FAILED: "처리에 실패했습니다",
      DECISION_FOLLOW_UP: "채용 결정 후속 검토가 필요합니다",
    }[eventType] ?? "새로운 처리 요청"
  );
}

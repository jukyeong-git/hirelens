import {
  listJobs,
  listNotifications,
  listProfiles,
  listRequisitionStatusHistory,
} from "@hirelens/database";

import { JobCreateForm } from "./_components/job-create-form";
import { JobList } from "./_components/job-list";
import { LoginForm } from "./_components/login-form";
import { RequisitionApprovalQueue } from "./_components/requisition-approval-queue";
import { markNotificationReadAction, signOutAction } from "./actions";
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
    const jobs = await listJobs(client);
    const historyResults = await Promise.allSettled(
      jobs
        .filter((job) => job.requisition_status === "PENDING_APPROVAL")
        .map(async (job) => [job.id, await listRequisitionStatusHistory(client, job.id)] as const),
    );
    const historiesByJobId = new Map<
      string,
      Awaited<ReturnType<typeof listRequisitionStatusHistory>>
    >();
    const unavailableHistoryJobIds = new Set<string>();

    for (const result of historyResults) {
      if (result.status === "fulfilled") {
        historiesByJobId.set(result.value[0], result.value[1]);
      }
    }
    for (const job of jobs.filter((job) => job.requisition_status === "PENDING_APPROVAL")) {
      if (!historiesByJobId.has(job.id)) unavailableHistoryJobIds.add(job.id);
    }

    return (
      <main className="app-shell" id="main-content">
        <header className="app-header requisition-header">
          <div>
            <p className="eyebrow">Approvals</p>
            <h1>Requisition 승인 대기열</h1>
            <p className="lede">지정 승인자 업무</p>
          </div>
          <div className="header-actions">
            <div className="viewer-card" aria-label="현재 사용자">
              <strong>{visibleCopy(viewer.displayName)}</strong>
              <span>{viewer.role}</span>
            </div>
            <form action={signOutAction}>
              <button className="button button-quiet" type="submit">
                로그아웃
              </button>
            </form>
          </div>
        </header>
        <RequisitionApprovalQueue
          jobs={jobs}
          viewerId={viewer.id}
          historiesByJobId={historiesByJobId}
          unavailableHistoryJobIds={unavailableHistoryJobIds}
        />
      </main>
    );
  }

  const [jobs, profiles, notifications] = await Promise.all([
    listJobs(client),
    listProfiles(client),
    listNotifications(client),
  ]);
  const safeProfiles = profiles.map((profile) => ({
    ...profile,
    display_name: visibleCopy(profile.display_name),
  }));
  const profileById = new Map(safeProfiles.map((profile) => [profile.id, profile.display_name]));
  const jobsWithNames = jobs.map((job) => ({
    ...job,
    recruiter_name: profileById.get(job.recruiter_id) ?? null,
    hiring_manager_name: profileById.get(job.hiring_manager_id) ?? null,
  }));
  const hasPartialParticipantData = jobsWithNames.some(
    (job) => job.recruiter_name === null || job.hiring_manager_name === null,
  );

  return (
    <main className="app-shell" id="main-content">
      <header className="app-header requisition-header">
        <div>
          <p className="eyebrow">Recruiting workspace</p>
          <h1>Requisition 작업 공간</h1>
          <p className="lede">직무·승인·지원서 운영</p>
        </div>
        <div className="header-actions">
          <div className="viewer-card" aria-label="현재 사용자">
            <strong>{visibleCopy(viewer.displayName)}</strong>
            <span>{viewer.role}</span>
          </div>
          <form action={signOutAction}>
            <button className="button button-quiet" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {hasPartialParticipantData ? (
        <p className="form-alert form-alert-warning" role="status">
          일부 Job의 담당자 정보를 불러오지 못했습니다. 현재 사용자의 RLS와 Profile seed를
          확인하세요.
        </p>
      ) : null}

      <section className="panel" aria-labelledby="notifications-title">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">In-app notifications</p>
            <h2 id="notifications-title">업무 알림</h2>
          </div>
          <span className="count-label">
            {notifications.filter((notification) => !notification.read_at).length}개 읽지 않음
          </span>
        </div>
        {notifications.length === 0 ? (
          <p className="section-copy">현재 알림이 없습니다.</p>
        ) : (
          <div className="history-list">
            {notifications.slice(0, 5).map((notification) => (
              <article key={notification.id} className="history-item">
                <strong>{notificationLabel(notification.event_type)}</strong>
                <p>{notification.read_at ? "읽음" : "읽지 않음"}</p>
                {!notification.read_at && notification.recipient_id === viewer.id ? (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button className="button button-quiet" type="submit">
                      읽음으로 표시
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      {viewer.role === "HIRING_MANAGER" ? (
        <JobCreateForm
          viewerId={viewer.id}
          viewerName={visibleCopy(viewer.displayName)}
          profiles={safeProfiles}
        />
      ) : (
        <section className="info-banner" aria-label="읽기 전용 안내">
          <strong>읽기 전용</strong>
          <span>Hiring Manager 작성 · Recruiter 조회</span>
        </section>
      )}

      <JobList jobs={jobsWithNames} />
    </main>
  );
}

function notificationLabel(eventType: string) {
  return (
    {
      SCORECARD_APPROVAL_REQUEST: "검토 기준 승인 검토 요청",
      REVIEW_ASSIGNMENT: "지원서 검토가 배정되었습니다",
      PROCESSING_COMPLETED: "지원서 처리가 완료되었습니다",
      PROCESSING_FAILED: "처리에 실패했습니다",
      DECISION_FOLLOW_UP: "결정 후속 검토가 필요합니다",
    }[eventType] ?? eventType
  );
}

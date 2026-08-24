import { listJobs, listNotifications, listProfiles } from "@hirelens/database";

import { JobCreateForm } from "./_components/job-create-form";
import { JobList } from "./_components/job-list";
import { LoginForm } from "./_components/login-form";
import { markNotificationReadAction, signOutAction } from "./actions";
import { getAuthenticatedViewer } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const authenticated = await getAuthenticatedViewer();

  if (!authenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="login-title">
          <LoginForm />
        </section>
      </main>
    );
  }

  const { client, viewer } = authenticated;
  const [jobs, profiles, notifications] = await Promise.all([
    listJobs(client),
    listProfiles(client),
    listNotifications(client),
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile.display_name]));
  const jobsWithNames = jobs.map((job) => ({
    ...job,
    recruiter_name: profileById.get(job.recruiter_id) ?? null,
    hiring_manager_name: profileById.get(job.hiring_manager_id) ?? null,
  }));
  const hasPartialParticipantData = jobsWithNames.some(
    (job) => job.recruiter_name === null || job.hiring_manager_name === null,
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">HireLens · HL-020</p>
          <h1>Job 작업 공간</h1>
          <p className="lede">직무 설명을 저장하고, 담당자와 다음 scorecard 작업을 준비합니다.</p>
        </div>
        <div className="header-actions">
          <div className="viewer-card" aria-label="현재 사용자">
            <strong>{viewer.displayName}</strong>
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

      {viewer.role === "ADMIN" || viewer.role === "RECRUITER" ? (
        <JobCreateForm viewerId={viewer.id} viewerRole={viewer.role} profiles={profiles} />
      ) : (
        <section className="info-banner" aria-label="읽기 전용 안내">
          <strong>읽기 전용</strong>
          <span>Hiring Manager는 할당된 Job을 조회하고 다음 scorecard 단계에서 검토합니다.</span>
        </section>
      )}

      <JobList jobs={jobsWithNames} />
    </main>
  );
}

function notificationLabel(eventType: string) {
  return (
    {
      SCORECARD_APPROVAL_REQUEST: "Scorecard 승인 검토 요청",
      REVIEW_ASSIGNMENT: "지원서 검토가 배정되었습니다",
      PROCESSING_COMPLETED: "지원서 처리가 완료되었습니다",
      PROCESSING_FAILED: "처리에 실패했습니다",
      DECISION_FOLLOW_UP: "결정 후속 검토가 필요합니다",
    }[eventType] ?? eventType
  );
}

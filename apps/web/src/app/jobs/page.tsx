import { listJobs, listProfiles } from "@hirelens/database";

import { JobCreateForm } from "./_components/job-create-form";
import { JobList } from "./_components/job-list";
import { LoginForm } from "./_components/login-form";
import { signOutAction } from "./actions";
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
  const [jobs, profiles] = await Promise.all([listJobs(client), listProfiles(client)]);
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

import Link from "next/link";
import { notFound } from "next/navigation";

import { getJobForScorecard, getScorecardWorkspaceForJob } from "@hirelens/database";

import { LoginForm } from "../_components/login-form";
import { ScorecardDraftPanel } from "../_components/scorecard-draft-panel";
import { signOutAction } from "../actions";
import { getAuthenticatedViewer } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
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

  const { jobId } = await params;
  const { client, viewer } = authenticated;
  const job = await getJobForScorecard(client, jobId);

  if (!job) {
    notFound();
  }

  const scorecardWorkspace = await getScorecardWorkspaceForJob(client, job.id);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <Link className="back-link" href="/jobs">
            ← Job 목록으로
          </Link>
          <p className="eyebrow">Job detail · HL-023</p>
          <h1>{job.title}</h1>
          <p className="lede">
            {job.department} · 현재 상태: <strong>{jobStatusLabel(job.status)}</strong>
          </p>
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

      <section className="panel job-source-panel" aria-labelledby="job-description-title">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Source job description</p>
            <h2 id="job-description-title">직무 설명 원문</h2>
          </div>
          <span className="status-chip status-draft">Scorecard 입력</span>
        </div>
        <p className="job-description">{job.raw_job_description}</p>
      </section>

      <ScorecardDraftPanel jobId={job.id} viewerRole={viewer.role} workspace={scorecardWorkspace} />
    </main>
  );
}

function jobStatusLabel(status: string) {
  return (
    {
      DRAFT: "초안",
      SCORECARD_PENDING_APPROVAL: "Scorecard 승인 대기",
      READY_FOR_INTAKE: "접수 준비",
      ARCHIVED: "보관됨",
    }[status] ?? status
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getApplicationForReview,
  getJobForScorecard,
  getScorecardWorkspaceForJob,
  listHumanReviews,
  listReviewNotes,
  listReviewNoteVersions,
  listResumeProcessingRunsForApplication,
} from "@hirelens/database";

import { LoginForm } from "../../jobs/_components/login-form";
import { ApplicationReviewPanel } from "../../jobs/_components/application-review-panel";
import { ProcessingStatus } from "./processing-status";
import { signOutAction } from "../../jobs/actions";
import { getAuthenticatedViewer } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function ApplicationReviewPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="login-title">
          <LoginForm />
        </section>
      </main>
    );
  const { applicationId } = await params;
  const { client, viewer } = authenticated;
  const application = await getApplicationForReview(client, applicationId);
  if (!application) notFound();
  const [job, workspace, reviews, notes, processingRuns] = await Promise.all([
    getJobForScorecard(client, application.job_id),
    getScorecardWorkspaceForJob(client, application.job_id),
    listHumanReviews(client, application.id),
    listReviewNotes(client, application.id),
    listResumeProcessingRunsForApplication(client, application.id),
  ]);
  if (!job) notFound();
  const notesWithVersions = await Promise.all(
    notes.map(async (note) => ({ note, versions: await listReviewNoteVersions(client, note.id) })),
  );
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <Link className="back-link" href={`/jobs/${job.id}`}>
            ← {job.title}로
          </Link>
          <p className="eyebrow">Application review · Phase 1</p>
          <h1>{application.candidate?.demo_label ?? "Synthetic candidate"}</h1>
          <p className="lede">
            처리 상태: <strong>{application.workflow_state}</strong> · AI 근거 분석은 아직 실행되지
            않았습니다.
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
      <section className="info-banner" aria-label="AI 분석 상태">
        <strong>근거 분석 대기</strong>
        <span>
          이 화면은 AI 결과와 사람의 결정·Recruiter 의견을 분리합니다. 현재는 합성 지원서의
          검토·감사 흐름만 제공합니다.
        </span>
      </section>
      <ApplicationReviewPanel
        applicationId={application.id}
        viewerRole={viewer.role}
        approvedVersion={workspace.activeApprovedVersion?.version ?? null}
        reviews={reviews}
        notes={notesWithVersions}
      />
      <ProcessingStatus runs={processingRuns} />
    </main>
  );
}

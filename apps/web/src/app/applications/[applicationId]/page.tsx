import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getApplicationForReview,
  getJobForScorecard,
  getScorecardVersion,
  getScorecardWorkspaceForJob,
  listHumanReviews,
  listInterviewObservations,
  listInterviewObservationSessions,
  listReviewAssignments,
  listInterviewProgressionReviews,
  listEvidenceItemsForRuns,
  listResumePagesForRuns,
  listProfiles,
  listReviewNotes,
  listReviewNoteVersions,
  listResumeProcessingRunsForApplication,
} from "@hirelens/database";

import { LoginForm } from "../../jobs/_components/login-form";
import { ApplicationReviewPanel } from "../../jobs/_components/application-review-panel";
import { ProcessingStatus } from "./processing-status";
import { ApplicationEvidencePanel } from "./application-evidence-panel";
import { InterviewOutcomeForm } from "./interview-outcome-form";
import { getAuthenticatedViewer } from "../../../lib/supabase-server";
import { visibleCopy } from "../../_components/visible-copy";

export const dynamic = "force-dynamic";

export default async function ApplicationReviewPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return (
      <main className="auth-shell" id="main-content">
        <section className="auth-card" aria-labelledby="login-title">
          <LoginForm />
        </section>
      </main>
    );
  const { applicationId } = await params;
  const { client, viewer } = authenticated;
  const application = await getApplicationForReview(client, applicationId);
  if (!application) notFound();
  const [
    job,
    workspace,
    reviews,
    notes,
    processingRuns,
    assignments,
    interviewReviews,
    observationSessions,
    interviewObservations,
    profiles,
  ] = await Promise.all([
    getJobForScorecard(client, application.job_id),
    getScorecardWorkspaceForJob(client, application.job_id),
    listHumanReviews(client, application.id),
    listReviewNotes(client, application.id),
    listResumeProcessingRunsForApplication(client, application.id),
    listReviewAssignments(client, application.id),
    listInterviewProgressionReviews(client, application.id),
    listInterviewObservationSessions(client, application.id),
    listInterviewObservations(client, application.id),
    listProfiles(client),
  ]);
  if (!job) notFound();
  const notesWithVersions = await Promise.all(
    notes.map(async (note) => ({ note, versions: await listReviewNoteVersions(client, note.id) })),
  );
  const latestRun = processingRuns[0] ?? null;
  const currentInterviewReview = interviewReviews[0] ?? null;
  // A framework revision adds a newer run under the new version. The interview
  // outcome stays attached to the version the interview was approved under, so
  // resolve that run separately instead of following the latest one.
  const interviewRun = currentInterviewReview
    ? (processingRuns.find(
        (run) => run.scorecard_version_id === currentInterviewReview.scorecard_version_id,
      ) ?? null)
    : null;
  const processingRunIds = [
    ...new Set([latestRun?.id, interviewRun?.id].filter((id): id is string => Boolean(id))),
  ];
  const [evidenceItems, resumePages, runScorecard, revisedInterviewScorecard] = await Promise.all([
    listEvidenceItemsForRuns(client, processingRunIds),
    listResumePagesForRuns(client, processingRunIds),
    latestRun ? getScorecardVersion(client, latestRun.scorecard_version_id) : Promise.resolve(null),
    interviewRun && interviewRun.id !== latestRun?.id
      ? getScorecardVersion(client, interviewRun.scorecard_version_id)
      : Promise.resolve(null),
  ]);
  const evidenceForRun = (runId: string | null) =>
    runId ? evidenceItems.filter((item) => item.processing_run_id === runId) : [];
  const pagesForRun = (runId: string | null) =>
    runId ? resumePages.filter((page) => page.processing_run_id === runId) : [];
  const latestEvidence = evidenceForRun(latestRun?.id ?? null);
  const latestPages = pagesForRun(latestRun?.id ?? null);
  const interviewScorecard = revisedInterviewScorecard ?? runScorecard;
  const profileNames = Object.fromEntries(
    profiles.map((profile) => [profile.id, visibleCopy(profile.display_name)]),
  );
  const hasActiveAssignment = assignments.some(
    (assignment) => assignment.status === "ACTIVE" && assignment.assigned_to === viewer.id,
  );
  const canRecordPostInterviewReview =
    application.workflow_state === "INTERVIEW_SELECTED" &&
    currentInterviewReview?.outcome === "INTERVIEW" &&
    currentInterviewReview.scorecard_version_id === interviewScorecard?.version.id &&
    (viewer.role === "ADMIN" || (viewer.role === "HIRING_MANAGER" && hasActiveAssignment));
  return (
    <main className="app-shell" id="main-content">
      <header className="app-header requisition-header">
        <div>
          <Link className="back-link" href={`/jobs/${job.id}`}>
            ← {visibleCopy(job.title)}로
          </Link>
          <h1>{visibleCopy(application.candidate?.demo_label ?? "Synthetic candidate")}</h1>
          <p className="lede">{workflowStageLabel(application.workflow_state)}</p>
        </div>
      </header>
      <nav className="section-navigation" aria-label="지원서 검토 섹션">
        <a href="#evidence-title">근거</a>
        <a href="#manager-request-title">검토와 결정</a>
        <a href="#post-interview-review-title">면접 결과</a>
        <a href="#processing-title">처리 상태</a>
      </nav>
      <ApplicationEvidencePanel
        criteria={runScorecard?.criteria ?? []}
        evidence={latestEvidence}
        pages={latestPages}
        runs={latestRun ? [latestRun] : []}
      />
      <ApplicationReviewPanel
        applicationId={application.id}
        viewerRole={viewer.role}
        approvedVersion={workspace.activeApprovedVersion?.version ?? null}
        reviews={reviews}
        notes={notesWithVersions}
        assignments={assignments}
        interviewReviews={interviewReviews}
        profileNames={profileNames}
      />
      {canRecordPostInterviewReview && interviewScorecard ? (
        <InterviewOutcomeForm
          applicationId={application.id}
          scorecardVersionId={interviewScorecard.version.id}
          criteria={interviewScorecard.criteria}
          evidence={evidenceForRun(interviewRun?.id ?? latestRun?.id ?? null)}
          pages={pagesForRun(interviewRun?.id ?? latestRun?.id ?? null)}
        />
      ) : observationSessions.length > 0 ? (
        <section className="panel" aria-labelledby="post-interview-review-title">
          <h2 id="post-interview-review-title">면접 결과 기록</h2>
          <div className="history-list">
            {observationSessions.map((session, index) => {
              const sessionObservations = interviewObservations.filter(
                (observation) => observation.interview_observation_session_id === session.id,
              );
              return (
                <article className="history-item" key={session.id}>
                  <strong>{index === 0 ? "현재 면접 관찰" : "이전 면접 관찰"}</strong>
                  <p>
                    {sessionObservations.length}개 기준 ·{" "}
                    {sessionObservations
                      .map((observation) => interviewVerdictLabel(observation.verdict))
                      .join(", ")}
                  </p>
                  <span>
                    {profileNames[session.reviewer_id] ?? "사용자"} ·{" "}
                    {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(
                      new Date(session.created_at),
                    )}
                  </span>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="panel" aria-labelledby="post-interview-review-title">
          <h2 id="post-interview-review-title">면접 결과 기록</h2>
          <p className="empty-copy">인터뷰 진행 후 기준별 관찰을 기록할 수 있습니다.</p>
        </section>
      )}
      {/*
        The change-history section is removed while `public.audit_events` has no
        persistence: migration 20260826001100 replaced `append_safe_audit` with a
        no-op shim, turned the table into an empty view, and revoked SELECT from
        `authenticated`, so reading it fails the whole page. Criterion-level
        observations and human decisions keep their own append-only history, so
        only cross-cutting events (job created, framework approved, posting
        published) are unavailable. Restore this section together with audit
        persistence.
      */}
      <ProcessingStatus runs={processingRuns} viewerRole={viewer.role} />
    </main>
  );
}

function workflowStageLabel(state: string) {
  return (
    (
      {
        NEW: "검토 대기",
        MANAGER_REVIEW_REQUESTED: "책임자 검토 요청됨",
        INTERVIEW_SELECTED: "면접 예정",
        INTERVIEW_HOLD: "보류",
        MORE_INFORMATION_REQUIRED: "정보 보완 요청",
        INTERVIEW_COMPLETED: "면접 결과 기록됨",
      } as Record<string, string>
    )[state] ?? state
  );
}

function interviewVerdictLabel(verdict: string) {
  return (
    (
      {
        MATCHED: "지원서와 일치",
        WEAKER: "지원서보다 약함",
        STRONGER: "지원서보다 강함",
        NOT_ASKED: "묻지 않음",
      } as Record<string, string>
    )[verdict] ?? verdict
  );
}

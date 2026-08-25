import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getApplicationForReview,
  getJobForScorecard,
  getScorecardVersion,
  getScorecardWorkspaceForJob,
  listHumanReviews,
  listReviewAssignments,
  listInterviewProgressionReviews,
  listApplicationAuditEvents,
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
    auditEvents,
    profiles,
  ] = await Promise.all([
    getJobForScorecard(client, application.job_id),
    getScorecardWorkspaceForJob(client, application.job_id),
    listHumanReviews(client, application.id),
    listReviewNotes(client, application.id),
    listResumeProcessingRunsForApplication(client, application.id),
    listReviewAssignments(client, application.id),
    listInterviewProgressionReviews(client, application.id),
    listApplicationAuditEvents(client, application.id),
    listProfiles(client),
  ]);
  if (!job) notFound();
  const notesWithVersions = await Promise.all(
    notes.map(async (note) => ({ note, versions: await listReviewNoteVersions(client, note.id) })),
  );
  const latestRun = processingRuns[0] ?? null;
  const processingRunIds = latestRun ? [latestRun.id] : [];
  const [evidenceItems, resumePages, runScorecard] = await Promise.all([
    listEvidenceItemsForRuns(client, processingRunIds),
    listResumePagesForRuns(client, processingRunIds),
    latestRun ? getScorecardVersion(client, latestRun.scorecard_version_id) : Promise.resolve(null),
  ]);
  const profileNames = Object.fromEntries(
    profiles.map((profile) => [profile.id, visibleCopy(profile.display_name)]),
  );
  return (
    <main className="app-shell" id="main-content">
      <header className="app-header requisition-header">
        <div>
          <Link className="back-link" href={`/jobs/${job.id}`}>
            ← {visibleCopy(job.title)}로
          </Link>
          <h1>{visibleCopy(application.candidate?.demo_label ?? "Synthetic candidate")}</h1>
          <p className="lede">{application.workflow_state}</p>
        </div>
      </header>
      <nav className="section-navigation" aria-label="지원서 검토 섹션">
        <a href="#evidence-title">근거</a>
        <a href="#manager-request-title">사람 검토</a>
        <a href="#processing-title">처리 상태</a>
        <a href="#audit-timeline-title">변경 이력</a>
      </nav>
      <ApplicationEvidencePanel
        criteria={runScorecard?.criteria ?? []}
        evidence={evidenceItems}
        pages={resumePages}
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
      <ProcessingStatus runs={processingRuns} />
      <section className="panel" aria-labelledby="audit-timeline-title">
        <h2 id="audit-timeline-title">변경 이력</h2>
        {auditEvents.length === 0 ? (
          <p className="empty-copy">표시할 이력이 없습니다.</p>
        ) : (
          <ol className="audit-timeline">
            {auditEvents.map((event) => (
              <li key={event.id}>
                <strong>{auditLabel(event.event_type)}</strong>
                <span>
                  {event.actor_id ? (profileNames[event.actor_id] ?? "사용자") : "시스템"} ·{" "}
                  {new Intl.DateTimeFormat("ko-KR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.created_at))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function auditLabel(eventType: string) {
  return (
    (
      {
        RESUME_UPLOADED: "지원서 PDF 등록",
        EVIDENCE_PROCESSING_COMPLETED: "검증된 AI 근거 저장",
        PROCESSING_RETRY_PENDING: "처리 재시도 대기",
        PROCESSING_FAILED: "처리 실패",
        PROCESSING_QUARANTINED: "검증 실패 결과 격리",
        HIRING_MANAGER_REVIEW_REQUESTED: "채용 책임자 검토 요청",
        INTERVIEW_PROGRESSION_RECORDED: "인터뷰 판단 저장",
        INTERVIEW_PROGRESSION_CHANGED: "인터뷰 판단 변경",
        HUMAN_DECISION_CREATED: "최종 결정 저장",
        HUMAN_DECISION_CHANGED: "최종 결정 변경",
      } as Record<string, string>
    )[eventType] ?? eventType
  );
}

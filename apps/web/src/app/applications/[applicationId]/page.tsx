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
  const [job, workspace, reviews, notes, processingRuns, assignments, interviewReviews, profiles] =
    await Promise.all([
      getJobForScorecard(client, application.job_id),
      getScorecardWorkspaceForJob(client, application.job_id),
      listHumanReviews(client, application.id),
      listReviewNotes(client, application.id),
      listResumeProcessingRunsForApplication(client, application.id),
      listReviewAssignments(client, application.id),
      listInterviewProgressionReviews(client, application.id),
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
          <h1>
            {visibleCopy(
              latestRun?.status === "COMPLETED"
                ? (application.candidate?.full_name ??
                    application.candidate?.demo_label ??
                    "이름 미입력")
                : application.source === "PUBLIC_POSTING"
                  ? "공개 지원"
                  : (application.candidate?.demo_label ?? "지원자"),
            )}
          </h1>
          <p className="lede">{application.workflow_state}</p>
        </div>
      </header>
      <nav className="section-navigation" aria-label="지원서 검토 섹션">
        <a href="#evidence-title">근거</a>
        <a href="#manager-request-title">사람 검토</a>
        <a href="#processing-title">처리 상태</a>
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
    </main>
  );
}

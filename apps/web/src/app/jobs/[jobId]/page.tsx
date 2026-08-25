import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getJobForScorecard,
  getJobPosting,
  getScorecardWorkspaceForJob,
  listApplicationsForJob,
  listEvidenceItemsForRuns,
  listResumeProcessingRunsForApplication,
  listJobPostingStatusHistory,
  listProfiles,
  listRequisitionStatusHistory,
} from "@hirelens/database";

import { LoginForm } from "../_components/login-form";
import { ScorecardDraftPanel } from "../_components/scorecard-draft-panel";
import { ResumeUploadPanel } from "../_components/resume-upload-panel";
import { RequisitionWorkflow } from "../_components/requisition-workflow";
import { JobPostingWorkflow } from "../_components/job-posting-workflow";
import { CandidateTriageList } from "../_components/candidate-triage-list";
import { signOutAction } from "../actions";
import { getAuthenticatedViewer } from "../../../lib/supabase-server";
import { visibleCopy } from "../../_components/visible-copy";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
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

  const { jobId } = await params;
  const { client, viewer } = authenticated;
  const job = await getJobForScorecard(client, jobId);

  if (!job) {
    notFound();
  }

  const isRequisitionApprover = viewer.role === "REQUISITION_APPROVER";
  const requisitionHistory = await listRequisitionStatusHistory(client, job.id);
  const [scorecardWorkspace, applications, profiles, jobPosting, postingHistory] =
    isRequisitionApprover
      ? [null, [], [], null, []]
      : await Promise.all([
          getScorecardWorkspaceForJob(client, job.id),
          listApplicationsForJob(client, job.id),
          listProfiles(client),
          getJobPosting(client, job.id),
          listJobPostingStatusHistory(client, job.id),
        ]);
  const isAssignedHiringManager =
    viewer.role === "HIRING_MANAGER" && viewer.id === job.hiring_manager_id;
  const safeProfiles = profiles.map((profile) => ({
    ...profile,
    display_name: visibleCopy(profile.display_name),
  }));
  const requisitionApprovers = safeProfiles.filter(
    (profile) => profile.role === "REQUISITION_APPROVER",
  );
  const triageItems = await Promise.all(
    applications.map(async (application) => {
      const runs = await listResumeProcessingRunsForApplication(client, application.id);
      const latestRun = runs[0] ?? null;
      const evidence = await listEvidenceItemsForRuns(client, latestRun ? [latestRun.id] : []);
      return {
        id: application.id,
        label: visibleCopy(application.candidate?.demo_label ?? "Synthetic candidate"),
        workflowState: application.workflow_state,
        processingStatus: latestRun?.status ?? "QUEUED",
        criterionStatuses: [...new Set(evidence.map((item) => item.status))],
        submittedAt: application.submitted_at,
      };
    }),
  );

  return (
    <main className="app-shell" id="main-content">
      <header className="app-header requisition-header">
        <div>
          <Link className="back-link" href="/jobs">
            ← Job 목록으로
          </Link>
          <p className="eyebrow">Requisition</p>
          <h1>{visibleCopy(job.title)}</h1>
          <p className="lede">
            {visibleCopy(job.department)} · <strong>{jobStatusLabel(job.status)}</strong>
          </p>
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

      <nav className="section-navigation" aria-label="Requisition 섹션">
        <a href={`#requisition-workflow-title-${job.id}`}>승인</a>
        {!isRequisitionApprover ? <a href="#job-posting-title">공고</a> : null}
        {!isRequisitionApprover ? <a href="#job-description-title">직무 설명</a> : null}
        {!isRequisitionApprover ? <a href="#applications-title">지원서</a> : null}
      </nav>

      <RequisitionWorkflow
        job={job}
        viewerId={viewer.id}
        viewerRole={viewer.role}
        approvers={requisitionApprovers}
        history={requisitionHistory}
        scorecardWorkspace={scorecardWorkspace ?? undefined}
      />

      {!isRequisitionApprover && scorecardWorkspace ? (
        <JobPostingWorkflow
          job={job}
          posting={jobPosting}
          history={postingHistory}
          viewerId={viewer.id}
          viewerRole={viewer.role}
          scorecardWorkspace={scorecardWorkspace}
        />
      ) : null}

      <section className="panel job-source-panel" aria-labelledby="job-description-title">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Source</p>
            <h2 id="job-description-title">직무 설명 원문</h2>
          </div>
          <span className="status-chip status-draft">검토 기준 입력</span>
        </div>
        <p className="job-description">{visibleCopy(job.raw_job_description)}</p>
      </section>

      {!isRequisitionApprover && scorecardWorkspace ? (
        <ScorecardDraftPanel
          jobId={job.id}
          viewerRole={viewer.role}
          isAssignedHiringManager={isAssignedHiringManager}
          workspace={scorecardWorkspace}
        />
      ) : null}

      {!isRequisitionApprover &&
      scorecardWorkspace &&
      (viewer.role === "ADMIN" || viewer.role === "RECRUITER") ? (
        <ResumeUploadPanel
          jobId={job.id}
          enabled={
            job.status === "READY_FOR_INTAKE" && scorecardWorkspace.activeApprovedVersion !== null
          }
        />
      ) : null}

      {!isRequisitionApprover ? (
        <section className="panel" aria-labelledby="applications-title">
          <div className="section-heading section-heading-inline">
            <div>
              <p className="eyebrow">Applications</p>
              <h2 id="applications-title">검토 가능한 지원서</h2>
            </div>
            <span className="count-label">{applications.length}개</span>
          </div>
          {applications.length === 0 ? (
            <p className="section-copy">아직 지원서가 없습니다.</p>
          ) : (
            <CandidateTriageList items={triageItems} />
          )}
        </section>
      ) : null}
    </main>
  );
}

function jobStatusLabel(status: string) {
  return (
    {
      DRAFT: "초안",
      SCORECARD_PENDING_APPROVAL: "검토 기준 승인 대기",
      READY_FOR_INTAKE: "접수 준비",
      ARCHIVED: "보관됨",
    }[status] ?? status
  );
}

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
} from "@hirelens/database";

import { LoginForm } from "../_components/login-form";
import {
  EvaluationCriteriaIssuesPanel,
  JobDescriptionIssuesPanel,
  ScorecardDraftPanel,
} from "../_components/scorecard-draft-panel";
import { JobPostingWorkflow } from "../_components/job-posting-workflow";
import { CandidateTriageList } from "../_components/candidate-triage-list";
import { getAuthenticatedViewer } from "../../../lib/supabase-server";
import { visibleCopy } from "../../_components/visible-copy";
import { JobBasicInfoPanel } from "../_components/job-basic-info-panel";
import { JobHeaderActions } from "../_components/job-header-actions";

export const dynamic = "force-dynamic";

type JobDetailTab = "overview" | "review-framework" | "posting" | "applications";

const JOB_DETAIL_TABS: ReadonlyArray<{ id: JobDetailTab; label: string }> = [
  { id: "overview", label: "기본 정보" },
  { id: "review-framework", label: "평가 기준" },
  { id: "posting", label: "공고" },
  { id: "applications", label: "지원자" },
];

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ tab?: string | string[] | undefined }>;
}) {
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
  const requestedTab = (await searchParams).tab;
  const { client, viewer } = authenticated;
  const job = await getJobForScorecard(client, jobId);

  if (!job) {
    notFound();
  }
  if (job.status === "ARCHIVED") {
    notFound();
  }

  if (viewer.role === "REQUISITION_APPROVER") {
    return (
      <main className="app-shell" id="main-content">
        <header className="app-header requisition-header">
          <h1>MVP에서 제공하지 않는 역할입니다.</h1>
        </header>
        <section className="panel" aria-labelledby="unsupported-role-title">
          <h2 id="unsupported-role-title">Requisition Approver</h2>
          <p className="section-copy">
            채용 요청 승인 역할은 현재 MVP 화면과 진행 흐름에서 비활성화되어 있습니다.
          </p>
        </section>
      </main>
    );
  }
  const visibleTabs = JOB_DETAIL_TABS;
  const activeTab = visibleTabs.some(
    (tab) => tab.id === (Array.isArray(requestedTab) ? requestedTab[0] : requestedTab),
  )
    ? ((Array.isArray(requestedTab) ? requestedTab[0] : requestedTab) as JobDetailTab)
    : "overview";
  const [scorecardWorkspace, applications, jobPosting, , profiles] = await Promise.all([
    getScorecardWorkspaceForJob(client, job.id),
    listApplicationsForJob(client, job.id),
    getJobPosting(client, job.id),
    listJobPostingStatusHistory(client, job.id),
    listProfiles(client),
  ]);
  const isAssignedHiringManager =
    viewer.role === "HIRING_MANAGER" && viewer.id === job.hiring_manager_id;
  const assignedRecruiter = profiles.find((profile) => profile.id === job.recruiter_id);
  const assignedHiringManager = profiles.find((profile) => profile.id === job.hiring_manager_id);
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
            ← 채용 요청 목록으로
          </Link>
          <h1>{visibleCopy(job.title)}</h1>
          <p className="lede">
            <strong>{jobStatusLabel(job.status)}</strong>
          </p>
        </div>
        <div className="requisition-header-side">
          <dl className="requisition-header-metadata" aria-label="채용 기본 정보">
            <div>
              <dt>부서</dt>
              <dd>{visibleCopy(job.department)}</dd>
            </div>
            <div>
              <dt>채용 담당자</dt>
              <dd>{visibleCopy(assignedRecruiter?.display_name ?? "미지정")}</dd>
            </div>
            <div>
              <dt>채용 책임자</dt>
              <dd>{visibleCopy(assignedHiringManager?.display_name ?? "확인 가능한 사용자")}</dd>
            </div>
          </dl>
          <JobHeaderActions
            job={job}
            canManage={viewer.role === "ADMIN" || isAssignedHiringManager}
            workspace={scorecardWorkspace}
          />
        </div>
      </header>

      <nav className="section-navigation" aria-label="채용 요청 섹션">
        {visibleTabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/jobs/${job.id}?tab=${tab.id}`}
            className={activeTab === tab.id ? "active" : undefined}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
        {activeTab === "review-framework" ? (
          <div
            id="review-framework-navigation-action"
            className="section-navigation-action"
            aria-label="평가 기준 작업"
          />
        ) : null}
        {activeTab === "overview" ? (
          <div
            id="overview-navigation-action"
            className="section-navigation-action"
            aria-label="기본 정보 작업"
          />
        ) : null}
      </nav>

      {activeTab === "overview" ? (
        <section className="panel-stack" aria-label="기본 정보">
          {scorecardWorkspace ? (
            <JobDescriptionIssuesPanel
              jobId={job.id}
              viewerRole={viewer.role}
              isAssignedHiringManager={isAssignedHiringManager}
              workspace={scorecardWorkspace}
            />
          ) : null}
          <JobBasicInfoPanel
            job={job}
            profiles={profiles}
            canEdit={
              (viewer.role === "ADMIN" || isAssignedHiringManager) &&
              job.status !== "READY_FOR_INTAKE"
            }
          />
        </section>
      ) : null}

      {activeTab === "posting" && scorecardWorkspace ? (
        <JobPostingWorkflow
          job={job}
          posting={jobPosting}
          viewerId={viewer.id}
          viewerRole={viewer.role}
          scorecardWorkspace={scorecardWorkspace}
        />
      ) : null}

      {activeTab === "review-framework" && scorecardWorkspace ? (
        <section className="panel-stack" aria-label="평가 기준">
          <EvaluationCriteriaIssuesPanel
            jobId={job.id}
            viewerRole={viewer.role}
            isAssignedHiringManager={isAssignedHiringManager}
            workspace={scorecardWorkspace}
          />
          <ScorecardDraftPanel
            jobId={job.id}
            viewerRole={viewer.role}
            isAssignedHiringManager={isAssignedHiringManager}
            workspace={scorecardWorkspace}
          />
        </section>
      ) : null}

      {activeTab === "applications" ? (
        <section className="panel" aria-labelledby="applications-title">
          <div className="section-heading section-heading-inline">
            <div>
              <h2 id="applications-title">지원자</h2>
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
      SCORECARD_PENDING_APPROVAL: "채용 요청 대기",
      READY_FOR_INTAKE: "공고 게시 준비",
      ARCHIVED: "보관됨",
    }[status] ?? status
  );
}

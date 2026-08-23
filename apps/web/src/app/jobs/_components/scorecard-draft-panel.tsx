"use client";

import { useActionState } from "react";

import type {
  AppRole,
  ScorecardDetail,
  ScorecardVersionHistoryRecord,
  ScorecardWorkspace,
} from "@hirelens/domain";

import { initialScorecardActionState } from "../action-state";
import { requestScorecardDraftAction } from "../actions";
import { AmbiguityReviewForm } from "./ambiguity-review-form";
import { ScorecardApprovalForm, ScorecardRevisionForm } from "./scorecard-approval-form";

interface ScorecardDraftPanelProps {
  jobId: string;
  viewerRole: AppRole;
  workspace: ScorecardWorkspace;
}

const criterionTypeLabels = {
  REQUIRED: "필수",
  PREFERRED: "우대",
  INTERVIEW_ONLY: "면접 전용",
} as const;
const ambiguityStatusLabels = {
  CLEAR: "모호성 없음",
  AMBIGUOUS: "검토 필요",
  HUMAN_ONLY: "면접에서 확인",
} as const;

export function ScorecardDraftPanel({ jobId, viewerRole, workspace }: ScorecardDraftPanelProps) {
  const [state, formAction, pending] = useActionState(
    requestScorecardDraftAction,
    initialScorecardActionState,
  );
  const canRequest = viewerRole === "ADMIN" || viewerRole === "RECRUITER";
  const canApprove = viewerRole === "ADMIN" || viewerRole === "HIRING_MANAGER";
  const workingVersion = workspace.latestWorkingVersion;
  const approvedVersion = workspace.activeApprovedVersion;
  const displayedVersion = workingVersion ?? approvedVersion;

  if (!displayedVersion) {
    return (
      <section className="panel" aria-labelledby="scorecard-title">
        <div className="section-heading">
          <p className="eyebrow">Scorecard draft</p>
          <h2 id="scorecard-title">아직 Scorecard 초안이 없습니다.</h2>
        </div>
        <p className="section-copy">
          Job 설명을 기준으로 AI 초안을 만들 수 있습니다. 생성 결과는 초안으로만 저장되고, Hiring
          Manager 또는 Admin 승인 전에는 이력서 분석에 사용할 수 없습니다.
        </p>
        {canRequest ? (
          <form action={formAction} className="form-actions">
            <input type="hidden" name="jobId" value={jobId} />
            <button className="button button-primary" type="submit" disabled={pending}>
              {pending ? "초안 생성 중…" : "Scorecard 초안 요청"}
            </button>
            <span className="form-help">현재 Job 설명을 그대로 AI 입력으로 사용합니다.</span>
          </form>
        ) : (
          <p className="info-banner" role="status">
            초안 요청은 Recruiter 또는 Admin이 수행합니다.
          </p>
        )}
        {state.status === "error" ? (
          <p className="form-alert form-alert-error" role="alert">
            {state.message}
          </p>
        ) : null}
      </section>
    );
  }

  const unresolvedCount = displayedVersion.criteria.filter(
    (criterion) => criterion.ambiguity_status === "AMBIGUOUS",
  ).length;
  const isDraft = displayedVersion.version.status === "DRAFT";
  const approver = workspace.versionHistory.find(
    (version) => version.id === displayedVersion.version.id,
  )?.approver;

  return (
    <>
      {workingVersion && approvedVersion ? (
        <section className="panel active-version-summary" aria-labelledby="active-scorecard-title">
          <div>
            <p className="eyebrow">Active approved scorecard</p>
            <h2 id="active-scorecard-title">
              v{approvedVersion.version.version_number} 승인본 사용 중
            </h2>
            <p>
              새 초안 v{workingVersion.version.version_number}을 검토하는 동안 기존 승인본은 계속
              유효합니다.
            </p>
          </div>
          <span className="status-chip status-ready_for_intake">분석 사용 가능</span>
        </section>
      ) : null}

      <section className="panel" aria-labelledby="scorecard-title">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">
              {isDraft ? "Scorecard draft · AI output + human review" : "Human-approved scorecard"}
            </p>
            <h2 id="scorecard-title">
              Scorecard {isDraft ? "초안" : "승인본"} v{displayedVersion.version.version_number}
            </h2>
          </div>
          <span className={`status-chip ${scorecardStatusClass(displayedVersion.version.status)}`}>
            {scorecardStatusLabel(displayedVersion.version.status)}
          </span>
        </div>

        <ScorecardMetadata scorecard={displayedVersion} />
        {isDraft ? (
          <div className="draft-warning" role="note">
            <strong>AI가 만든 초안을 사람이 검토 중입니다.</strong> 명시적 승인이 완료되기 전에는 이
            버전을 이력서 분석에 사용할 수 없습니다.
          </div>
        ) : (
          <div className="approved-banner" role="status">
            <strong>사람이 승인한 활성 버전입니다.</strong>
            <span>
              승인자 {approver?.display_name ?? "확인 가능한 사용자"} ·{" "}
              {formatDate(displayedVersion.version.approved_at)}
            </span>
          </div>
        )}

        <AmbiguitySection
          jobId={jobId}
          canReview={canApprove && isDraft}
          isDraft={isDraft}
          scorecard={displayedVersion}
          unresolvedCount={unresolvedCount}
        />
        <CriteriaSection scorecard={displayedVersion} />

        <section
          className="subsection scorecard-workflow"
          aria-labelledby="scorecard-workflow-title"
        >
          <div className="section-heading">
            <p className="eyebrow">Human approval · HL-023</p>
            <h3 id="scorecard-workflow-title">승인 및 버전 관리</h3>
          </div>
          {isDraft ? (
            canApprove ? (
              <ScorecardApprovalForm
                jobId={jobId}
                version={displayedVersion.version}
                unresolvedCount={unresolvedCount}
              />
            ) : (
              <p className="info-banner" role="status">
                Recruiter는 검토 상태를 확인할 수 있지만 승인할 수 없습니다. 담당 Hiring Manager
                또는 Admin이 사유를 남기고 승인합니다.
              </p>
            )
          ) : canApprove ? (
            <ScorecardRevisionForm jobId={jobId} version={displayedVersion.version} />
          ) : (
            <p className="info-banner" role="status">
              승인본은 변경할 수 없습니다. 변경이 필요하면 Hiring Manager 또는 Admin이 새 초안
              버전을 생성합니다.
            </p>
          )}
        </section>
      </section>

      <VersionHistory versions={workspace.versionHistory} />
    </>
  );
}

function ScorecardMetadata({ scorecard }: { scorecard: ScorecardDetail }) {
  return (
    <div className="metadata-grid" aria-label="Scorecard 계약 메타데이터">
      <div>
        <span>Model</span>
        <strong>{scorecard.version.model_id}</strong>
      </div>
      <div>
        <span>Prompt</span>
        <strong>{scorecard.version.prompt_version}</strong>
      </div>
      <div>
        <span>Schema</span>
        <strong>{scorecard.version.schema_version}</strong>
      </div>
      <div>
        <span>Source hash</span>
        <strong>{scorecard.version.source_job_description_hash.slice(0, 12)}…</strong>
      </div>
    </div>
  );
}

function AmbiguitySection({
  jobId,
  canReview,
  isDraft,
  scorecard,
  unresolvedCount,
}: {
  jobId: string;
  canReview: boolean;
  isDraft: boolean;
  scorecard: ScorecardDetail;
  unresolvedCount: number;
}) {
  return (
    <section className="subsection" aria-labelledby="ambiguous-phrases-title">
      <div className="section-heading section-heading-inline">
        <div>
          <p className="eyebrow">Ambiguity review</p>
          <h3 id="ambiguous-phrases-title">모호한 표현 검토</h3>
        </div>
        <span className="count-label">{unresolvedCount}개 미해결</span>
      </div>
      {scorecard.version.ambiguous_phrases.length > 0 ? (
        <ul className="ambiguity-list">
          {scorecard.version.ambiguous_phrases.map((phrase) => {
            const criterion = scorecard.criteria.find(
              (item) => item.source_phrase === phrase.source_phrase,
            );
            const currentStatus = criterion?.ambiguity_status ?? phrase.ambiguity_status;
            return (
              <li key={`${phrase.source_phrase}-${phrase.ambiguity_note}`}>
                <div className="ambiguity-item-heading">
                  <strong>“{phrase.source_phrase ?? "모호한 표현"}”</strong>
                  <span className="status-chip status-scorecard_pending_approval">
                    {ambiguityStatusLabels[currentStatus]}
                  </span>
                </div>
                <span>{phrase.ambiguity_note ?? "추가 검토가 필요한 표현입니다."}</span>
                {phrase.suggested_interview_question ? (
                  <p className="ambiguity-question">
                    <strong>AI 제안 질문</strong> {phrase.suggested_interview_question}
                  </p>
                ) : null}
                {criterion ? (
                  <div className="ambiguity-linked-criterion">
                    <div>
                      <span className="eyebrow">연결된 평가 기준</span>
                      <strong>{criterion.name}</strong>
                      <p>{criterion.definition}</p>
                    </div>
                    {canReview ? (
                      <AmbiguityReviewForm
                        jobId={jobId}
                        scorecardVersionId={scorecard.version.id}
                        criterion={criterion}
                      />
                    ) : isDraft ? (
                      <p className="info-banner" role="status">
                        이 표현은 담당 Hiring Manager 또는 Admin이 검토할 수 있습니다.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="info-banner" role="status">
                    연결된 평가 기준을 찾지 못했습니다. 승인 전에 사람의 확인이 필요합니다.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="info-banner" role="status">
          AI가 별도 검토가 필요한 표현을 찾지 못했습니다. 기준은 여전히 사람의 승인 대상입니다.
        </p>
      )}
    </section>
  );
}

function CriteriaSection({ scorecard }: { scorecard: ScorecardDetail }) {
  return (
    <section className="subsection" aria-labelledby="criteria-title">
      <div className="section-heading section-heading-inline">
        <div>
          <p className="eyebrow">Criteria</p>
          <h3 id="criteria-title">평가 기준</h3>
        </div>
        <span className="count-label">{scorecard.criteria.length}개</span>
      </div>
      <div className="criteria-list">
        {scorecard.criteria.map((criterion) => (
          <article className="criterion-card" key={criterion.id}>
            <div className="criterion-heading">
              <h4>{criterion.name}</h4>
              <span className="status-chip status-draft">
                {criterionTypeLabels[criterion.type]}
              </span>
            </div>
            <p>{criterion.definition}</p>
            <dl className="criterion-meta">
              <div>
                <dt>이력서 평가</dt>
                <dd>{criterion.resume_assessable ? "가능" : "불가 · 면접에서 확인"}</dd>
              </div>
              <div>
                <dt>모호성</dt>
                <dd>{ambiguityStatusLabels[criterion.ambiguity_status]}</dd>
              </div>
            </dl>
            <div className="evidence-copy">
              <strong>인정 근거</strong>
              <ul>
                {criterion.accepted_evidence.length > 0 ? (
                  criterion.accepted_evidence.map((evidence) => <li key={evidence}>{evidence}</li>)
                ) : (
                  <li>이력서 근거 없음 · 면접에서 확인</li>
                )}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function VersionHistory({ versions }: { versions: ScorecardVersionHistoryRecord[] }) {
  return (
    <section className="panel" aria-labelledby="version-history-title">
      <div className="section-heading">
        <p className="eyebrow">Immutable history</p>
        <h2 id="version-history-title">Scorecard 버전 이력</h2>
      </div>
      <ol className="version-history-list">
        {versions.map((version) => (
          <li key={version.id}>
            <div>
              <strong>v{version.version_number}</strong>
              <span className={`status-chip ${scorecardStatusClass(version.status)}`}>
                {scorecardStatusLabel(version.status)}
              </span>
            </div>
            <span>
              {version.approved_at
                ? `${version.approver?.display_name ?? "승인 사용자"} · ${formatDate(version.approved_at)}`
                : `생성 ${formatDate(version.created_at)}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function scorecardStatusLabel(status: string) {
  return (
    { DRAFT: "초안", PENDING_APPROVAL: "승인 대기", APPROVED: "승인됨", SUPERSEDED: "이전 승인본" }[
      status
    ] ?? status
  );
}
function scorecardStatusClass(status: string) {
  return status === "APPROVED"
    ? "status-ready_for_intake"
    : status === "SUPERSEDED"
      ? "status-archived"
      : status === "PENDING_APPROVAL"
        ? "status-scorecard_pending_approval"
        : "status-draft";
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "시각 미기록";
}

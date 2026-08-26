"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import type { CriterionCalibrationSummaryRecord } from "@hirelens/domain";

import {
  createManualFrameworkRevisionAction,
  generateFrameworkRevisionAction,
  recordCriterionCalibrationNoActionAction,
  saveFrameworkRevisionDraftAction,
} from "../actions";
import { initialFrameworkRevisionActionState, initialScorecardActionState } from "../action-state";
import { visibleCopy } from "../../_components/visible-copy";

interface CriterionDiagnosisPanelProps {
  jobId: string;
  summaries: CriterionCalibrationSummaryRecord[];
  activeScorecardVersionId: string | null;
  activeScorecardVersionNumber: number | null;
  hasWorkingDraft: boolean;
}

export function CriterionDiagnosisPanel({
  jobId,
  summaries,
  activeScorecardVersionId,
  activeScorecardVersionNumber,
  hasWorkingDraft,
}: CriterionDiagnosisPanelProps) {
  return (
    <section className="panel" aria-labelledby="criterion-diagnosis-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id="criterion-diagnosis-title">평가 기준 진단</h2>
          <p className="section-copy">
            담당자가 확인한 면접 결과만 집계합니다. 진단이 기준을 자동으로 바꾸지는 않습니다.
          </p>
        </div>
        <span className="count-label">
          {summaries.filter((summary) => summary.status === "REVIEW_REQUIRED").length}건 검토 필요
        </span>
      </div>
      {summaries.length === 0 ? (
        <p className="empty-copy">승인된 평가 기준이 없어 진단할 수 없습니다.</p>
      ) : (
        <div className="diagnosis-list">
          {summaries.map((summary) => {
            const reviewRequired = summary.status === "REVIEW_REQUIRED";
            return (
              <article
                className={`diagnosis-card${reviewRequired ? "" : " diagnosis-observing"}`}
                key={summary.lineage_id}
              >
                <div className="section-heading section-heading-inline">
                  <div>
                    <span className="version-label">
                      {criterionTypeLabel(summary.criterion_type)}
                    </span>
                    <h3>{summary.criterion_name}</h3>
                  </div>
                  <span
                    className={`status-chip ${reviewRequired ? "status-failed" : "status-queued"}`}
                  >
                    {reviewRequired ? "검토 필요" : "관측 중"}
                  </span>
                </div>
                {reviewRequired ? (
                  <p>
                    지원서에서 직접 근거로 확인된 {summary.supported_observations}건 중{" "}
                    {summary.level_insufficient_count}건이 면접에서 필요한 수준·범위에 미달했습니다.
                  </p>
                ) : (
                  <p>
                    수준·범위 어긋남 {summary.level_insufficient_count}건 · 진단에는 3건 이상과 40%
                    이상의 비율이 필요합니다.
                  </p>
                )}
                <dl className="diagnosis-metrics">
                  <div>
                    <dt>직접 근거 관찰</dt>
                    <dd>{summary.supported_observations}건</dd>
                  </div>
                  <div>
                    <dt>수준 어긋남</dt>
                    <dd>{Math.round(summary.mismatch_ratio * 100)}%</dd>
                  </div>
                  <div>
                    <dt>확정 관찰</dt>
                    <dd>{summary.confirmed_observation_count}건</dd>
                  </div>
                </dl>
                <p className="section-copy">
                  집계 제외 {summary.false_claim_excluded_count + summary.ai_misread_excluded_count}
                  건 — 사실과 다른 지원서 {summary.false_claim_excluded_count}건, 시스템 해석 차이{" "}
                  {summary.ai_misread_excluded_count}건
                </p>
                {reviewRequired &&
                activeScorecardVersionId &&
                activeScorecardVersionNumber !== null ? (
                  <CriterionRevisionActions
                    jobId={jobId}
                    summary={summary}
                    activeScorecardVersionId={activeScorecardVersionId}
                    activeScorecardVersionNumber={activeScorecardVersionNumber}
                    disabled={hasWorkingDraft}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CriterionRevisionActions({
  jobId,
  summary,
  activeScorecardVersionId,
  activeScorecardVersionNumber,
  disabled,
}: {
  jobId: string;
  summary: CriterionCalibrationSummaryRecord;
  activeScorecardVersionId: string;
  activeScorecardVersionNumber: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [generationState, generateAction, generating] = useActionState(
    generateFrameworkRevisionAction,
    initialFrameworkRevisionActionState,
  );
  const [saveState, saveAction, saving] = useActionState(
    saveFrameworkRevisionDraftAction,
    initialScorecardActionState,
  );
  const [manualState, manualAction, creatingManual] = useActionState(
    createManualFrameworkRevisionAction,
    initialScorecardActionState,
  );
  const [noActionState, noActionAction, recordingNoAction] = useActionState(
    recordCriterionCalibrationNoActionAction,
    initialScorecardActionState,
  );

  useEffect(() => {
    if (saveState.status === "success" || manualState.status === "success") router.refresh();
  }, [manualState.status, router, saveState.status]);

  if (disabled) {
    return (
      <p className="info-banner" role="status">
        작업 중인 평가 기준 초안을 먼저 수정하거나 승인하세요.
      </p>
    );
  }

  return (
    <div className="diagnosis-actions">
      <div className="button-row" aria-label={`${summary.criterion_name} 진단 조치`}>
        <form action={generateAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="lineageId" value={summary.lineage_id} />
          <button className="button button-primary" type="submit" disabled={generating}>
            {generating ? "AI 개정안 생성 중…" : "AI 개정안 요청"}
          </button>
        </form>
      </div>

      {generationState.status === "error" ? (
        <p className="error-banner" role="alert">
          {visibleCopy(generationState.message ?? "AI 개정안을 생성하지 못했습니다.")}
        </p>
      ) : null}
      {generationState.status === "success" &&
      generationState.proposal &&
      generationState.proposalToken ? (
        <form action={saveAction} className="framework-revision-form">
          <input type="hidden" name="jobId" value={jobId} />
          <input
            type="hidden"
            name="proposalJson"
            value={JSON.stringify(generationState.proposal)}
          />
          <input type="hidden" name="proposalToken" value={generationState.proposalToken} />
          <div className="draft-origin-banner draft-origin-ai" role="status">
            <strong>AI 개정안</strong>
            <span>바로 반영되지 않습니다. 초안으로 저장한 뒤 검토하고 승인해야 적용됩니다.</span>
          </div>
          <div className="framework-revision-diff">
            <RevisionEvidenceColumn
              title={`현재 기준 v${activeScorecardVersionNumber}`}
              accepted={generationState.proposal.before.accepted_evidence}
              excluded={generationState.proposal.before.excluded_evidence}
            />
            <RevisionEvidenceColumn
              title={`개정 초안 v${activeScorecardVersionNumber + 1}`}
              accepted={generationState.proposal.after.accepted_evidence}
              excluded={generationState.proposal.after.excluded_evidence}
            />
          </div>
          <p className="section-copy">
            <strong>제안 이유:</strong> {visibleCopy(generationState.proposal.rationale)}
          </p>
          <label>
            개정 사유
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={1000}
              defaultValue={`면접 관찰 ${summary.level_insufficient_count}건을 반영해 직접 근거 기준을 조정`}
            />
          </label>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? "개정 초안 저장 중…" : "새 초안으로 저장"}
          </button>
          {saveState.message ? (
            <p
              className={saveState.status === "error" ? "error-banner" : "success-banner"}
              role={saveState.status === "error" ? "alert" : "status"}
            >
              {visibleCopy(saveState.message)}
            </p>
          ) : null}
        </form>
      ) : null}

      <details className="diagnosis-secondary-action">
        <summary>직접 수정</summary>
        <form action={manualAction} className="compact-form">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="sourceScorecardVersionId" value={activeScorecardVersionId} />
          <input type="hidden" name="expectedVersionNumber" value={activeScorecardVersionNumber} />
          <label>
            개정 사유
            <textarea name="reason" required minLength={3} maxLength={1000} />
          </label>
          <button className="button button-quiet" type="submit" disabled={creatingManual}>
            {creatingManual ? "초안 생성 중…" : "직접 수정할 초안 만들기"}
          </button>
          {manualState.message ? (
            <p role={manualState.status === "error" ? "alert" : "status"}>
              {visibleCopy(manualState.message)}
            </p>
          ) : null}
        </form>
      </details>

      <details className="diagnosis-secondary-action">
        <summary>조치하지 않음</summary>
        <form action={noActionAction} className="compact-form">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="lineageId" value={summary.lineage_id} />
          <label>
            기준을 유지하는 이유
            <textarea name="reason" required minLength={3} maxLength={1000} />
          </label>
          <button className="button button-quiet" type="submit" disabled={recordingNoAction}>
            {recordingNoAction ? "기록 중…" : "판단 기록"}
          </button>
          {noActionState.message ? (
            <p role={noActionState.status === "error" ? "alert" : "status"}>
              {visibleCopy(noActionState.message)}
            </p>
          ) : null}
        </form>
      </details>
    </div>
  );
}

function RevisionEvidenceColumn({
  title,
  accepted,
  excluded,
}: {
  title: string;
  accepted: string[];
  excluded: string[];
}) {
  return (
    <section aria-label={title}>
      <h4>{title}</h4>
      <strong>직접 인정 근거</strong>
      <ul>
        {accepted.map((item) => (
          <li key={item}>{visibleCopy(item)}</li>
        ))}
      </ul>
      <strong>인정하지 않음</strong>
      {excluded.length > 0 ? (
        <ul>
          {excluded.map((item) => (
            <li key={item}>{visibleCopy(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">명시된 제외 항목 없음</p>
      )}
    </section>
  );
}

function criterionTypeLabel(type: CriterionCalibrationSummaryRecord["criterion_type"]) {
  return { REQUIRED: "필수", PREFERRED: "우대", INTERVIEW_ONLY: "면접 확인" }[type];
}

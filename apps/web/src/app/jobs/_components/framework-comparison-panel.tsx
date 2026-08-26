"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { FrameworkComparison } from "@hirelens/domain";

import { enqueueFrameworkReanalysisAction } from "../actions";
import { initialScorecardActionState } from "../action-state";
import { visibleCopy } from "../../_components/visible-copy";

export function FrameworkComparisonPanel({
  jobId,
  comparison,
}: {
  jobId: string;
  comparison: FrameworkComparison;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    enqueueFrameworkReanalysisAction,
    initialScorecardActionState,
  );
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  const [before, after] = comparison.versions;
  const reanalysisComplete =
    after.completed_count > 0 &&
    after.pending_count === 0 &&
    after.failed_count === 0 &&
    after.application_count >= before.application_count;

  return (
    <section className="panel" aria-labelledby="framework-comparison-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id="framework-comparison-title">평가 기준 버전 비교</h2>
          <p className="section-copy">
            다시 분석한 결과는 따로 저장되며, 이미 기록한 면접 결과와 결정은 그대로 남습니다.
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="jobId" value={jobId} />
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? "재분석 요청 중…" : reanalysisComplete ? "재분석 다시 확인" : "v2로 재분석"}
          </button>
        </form>
      </div>
      {state.message ? (
        <p
          className={state.status === "error" ? "error-banner" : "success-banner"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {visibleCopy(state.message)}
        </p>
      ) : null}
      <div className="framework-version-grid">
        {comparison.versions.map((version) => (
          <article key={version.id} className="framework-version-card">
            <div className="section-heading section-heading-inline">
              <h3>평가 기준 v{version.version_number}</h3>
              <span
                className={`status-chip ${version.status === "APPROVED" ? "status-completed" : "status-queued"}`}
              >
                {version.status === "APPROVED" ? "현재 승인본" : "이전 승인본"}
              </span>
            </div>
            <dl className="diagnosis-metrics">
              <div>
                <dt>분석 완료</dt>
                <dd>
                  {version.completed_count}/{version.application_count}건
                </dd>
              </div>
              <div>
                <dt>직접 근거</dt>
                <dd>{version.supported_applications}명</dd>
              </div>
              <div>
                <dt>부분 근거</dt>
                <dd>{version.partial_applications}명</dd>
              </div>
              <div>
                <dt>근거 미발견</dt>
                <dd>{version.not_found_applications}명</dd>
              </div>
            </dl>
            {version.pending_count > 0 ? (
              <p className="info-banner" role="status">
                {version.pending_count}건 처리 중
              </p>
            ) : null}
            {version.failed_count > 0 ? (
              <p className="error-banner" role="alert">
                {version.failed_count}건은 실패·격리·OCR 확인 상태입니다.
              </p>
            ) : null}
          </article>
        ))}
      </div>
      <div className="framework-criterion-comparison-list">
        {comparison.criteria.map((criterion) => (
          <article className="framework-criterion-comparison" key={criterion.lineage_id}>
            <h3>{visibleCopy(criterion.after?.name ?? criterion.before?.name ?? "기준")}</h3>
            <div className="framework-revision-diff">
              <CriterionVersionColumn
                title={`v${before.version_number}`}
                criterion={criterion.before}
              />
              <CriterionVersionColumn
                title={`v${after.version_number}`}
                criterion={criterion.after}
              />
            </div>
          </article>
        ))}
      </div>
      {comparison.application_changes.length > 0 ? (
        <section
          className="framework-application-changes"
          aria-labelledby="application-changes-title"
        >
          <div className="section-heading section-heading-inline">
            <h3 id="application-changes-title">지원서별 근거 상태 변화</h3>
            <span className="count-label">{comparison.application_changes.length}건</span>
          </div>
          <ul>
            {comparison.application_changes.map((change) => (
              <li
                key={`${change.application_id}:${change.lineage_id}`}
                className="framework-application-change"
              >
                <Link href={`/applications/${change.application_id}`}>
                  지원서 {change.application_id.slice(0, 8)}
                </Link>
                <span>{visibleCopy(change.criterion_name)}</span>
                <span>
                  {evidenceStatusLabel(change.before_status)} →{" "}
                  {evidenceStatusLabel(change.after_status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : after.completed_count > 0 ? (
        <p className="empty-copy">완료된 재분석에서 달라진 기준별 근거 상태가 없습니다.</p>
      ) : null}
    </section>
  );
}

function CriterionVersionColumn({
  title,
  criterion,
}: {
  title: string;
  criterion: FrameworkComparison["criteria"][number]["before"];
}) {
  if (!criterion) {
    return (
      <section aria-label={title}>
        <h4>{title}</h4>
        <p className="empty-copy">이 버전에는 없는 기준입니다.</p>
      </section>
    );
  }
  return (
    <section aria-label={title}>
      <h4>{title}</h4>
      <p>{visibleCopy(criterion.name)}</p>
      <dl className="diagnosis-metrics">
        <div>
          <dt>직접 근거</dt>
          <dd>{criterion.supported_applications}명</dd>
        </div>
        <div>
          <dt>부분 근거</dt>
          <dd>{criterion.partial_applications}명</dd>
        </div>
        <div>
          <dt>근거 미발견</dt>
          <dd>{criterion.not_found_applications}명</dd>
        </div>
      </dl>
      {criterion.excluded_evidence.length > 0 ? (
        <>
          <strong>직접 근거로 인정하지 않음</strong>
          <ul>
            {criterion.excluded_evidence.map((item) => (
              <li key={item}>{visibleCopy(item)}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function evidenceStatusLabel(
  status: FrameworkComparison["application_changes"][number]["before_status"],
) {
  return {
    SUPPORTED: "직접 근거",
    PARTIAL: "부분 근거",
    NOT_FOUND: "근거 미발견",
    CONTRADICTED: "상충 근거",
    HUMAN_ONLY: "면접 확인",
  }[status];
}

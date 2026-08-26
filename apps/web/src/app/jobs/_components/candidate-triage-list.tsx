"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

interface TriageCriterion {
  name: string;
  type: "REQUIRED" | "PREFERRED" | "INTERVIEW_ONLY";
  status: string;
}

interface CandidateTriageItem {
  id: string;
  label: string;
  workflowState: string;
  processingStatus: string;
  criteria: TriageCriterion[];
  submittedAt: string;
}

const PROCESSING_LABELS: Record<string, string> = {
  QUEUED: "분석 대기",
  EXTRACTING: "지원서 읽는 중",
  ANALYZING: "근거 찾는 중",
  VALIDATING: "원문 대조 중",
  COMPLETED: "검토 가능",
  RETRY_PENDING: "재시도 대기",
  NEEDS_OCR: "글자 인식 필요",
  FAILED: "처리 실패",
  QUARANTINED: "검증 실패",
};

const STAGE_LABELS: Record<string, string> = {
  NEW: "검토 대기",
  MANAGER_REVIEW_REQUESTED: "책임자 검토 요청됨",
  INTERVIEW_SELECTED: "면접 예정",
  INTERVIEW_HOLD: "보류",
  MORE_INFORMATION_REQUIRED: "정보 보완 요청",
  INTERVIEW_COMPLETED: "면접 결과 기록됨",
};

const EVIDENCE_LABELS: Record<string, string> = {
  SUPPORTED: "근거 있음",
  PARTIAL: "근거 일부",
  NOT_FOUND: "근거 못 찾음",
  CONTRADICTED: "본인이 없다고 기재",
  HUMAN_ONLY: "면접 확인",
  PENDING: "결과 대기",
};

const EVIDENCE_FILTERS = ["SUPPORTED", "PARTIAL", "NOT_FOUND", "CONTRADICTED"] as const;

function label(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export function CandidateTriageList({ items }: { items: CandidateTriageItem[] }) {
  const [processing, setProcessing] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const [evidence, setEvidence] = useState("ALL");

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (processing === "ALL" || item.processingStatus === processing) &&
          (stage === "ALL" || item.workflowState === stage) &&
          (evidence === "ALL" || item.criteria.some((c) => c.status === evidence)),
      ),
    [evidence, items, processing, stage],
  );

  const processingOptions = [...new Set(items.map((item) => item.processingStatus))];
  const stageOptions = [...new Set(items.map((item) => item.workflowState))];

  return (
    <>
      <div className="triage-filters" aria-label="지원서 필터">
        <label>
          지원서 처리
          <select value={processing} onChange={(event) => setProcessing(event.target.value)}>
            <option value="ALL">전체</option>
            {processingOptions.map((value) => (
              <option key={value} value={value}>
                {label(PROCESSING_LABELS, value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          검토 단계
          <select value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="ALL">전체</option>
            {stageOptions.map((value) => (
              <option key={value} value={value}>
                {label(STAGE_LABELS, value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          근거 상태
          <select value={evidence} onChange={(event) => setEvidence(event.target.value)}>
            <option value="ALL">전체</option>
            {EVIDENCE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {label(EVIDENCE_LABELS, value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="triage-count">
        {items.length}명 중 {visible.length}명 표시
      </p>

      {visible.length === 0 ? (
        <p className="empty-copy">선택한 조건에 해당하는 지원서가 없습니다.</p>
      ) : (
        <div className="history-list">
          {visible.map((item) => {
            const required = item.criteria.filter((c) => c.type === "REQUIRED");
            const met = required.filter((c) => c.status === "SUPPORTED");
            const gaps = required.filter(
              (c) => c.status === "NOT_FOUND" || c.status === "CONTRADICTED",
            );
            const partial = required.filter((c) => c.status === "PARTIAL");
            const ready = item.processingStatus === "COMPLETED";

            return (
              <Link
                className="history-item application-link"
                key={item.id}
                href={`/applications/${item.id}`}
              >
                <div className="section-heading-inline">
                  <strong>{item.label}</strong>
                  <span
                    className={`status-chip status-${item.processingStatus.toLowerCase()}`}
                    title={label(PROCESSING_LABELS, item.processingStatus)}
                  >
                    {label(STAGE_LABELS, item.workflowState)}
                  </span>
                </div>

                {ready && required.length > 0 ? (
                  <span className="triage-summary">
                    필수 {required.length}개 중 <strong>{met.length}개</strong> 근거 확인
                    {partial.length > 0 ? ` · ${partial.length}개 확인 필요` : ""}
                  </span>
                ) : (
                  <span className="triage-summary">
                    {label(PROCESSING_LABELS, item.processingStatus)}
                  </span>
                )}

                {gaps.length > 0 ? (
                  <span className="triage-gap">
                    {gaps.map((c) => c.name).join(" · ")} —{" "}
                    {gaps.some((c) => c.status === "CONTRADICTED")
                      ? "본인이 해당 경험이 없다고 기재"
                      : "제출 자료에서 근거를 찾지 못함"}
                  </span>
                ) : null}

                <small>
                  {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(
                    new Date(item.submittedAt),
                  )}{" "}
                  접수
                </small>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

interface CandidateTriageItem {
  id: string;
  label: string;
  workflowState: string;
  processingStatus: string;
  criterionStatuses: string[];
  submittedAt: string;
}

export function CandidateTriageList({ items }: { items: CandidateTriageItem[] }) {
  const [processing, setProcessing] = useState("ALL");
  const [workflow, setWorkflow] = useState("ALL");
  const [criterion, setCriterion] = useState("ALL");
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (processing === "ALL" || item.processingStatus === processing) &&
          (workflow === "ALL" || item.workflowState === workflow) &&
          (criterion === "ALL" || item.criterionStatuses.includes(criterion)),
      ),
    [criterion, items, processing, workflow],
  );

  return (
    <>
      <div className="triage-filters" aria-label="지원서 필터">
        <label>
          처리 상태
          <select value={processing} onChange={(event) => setProcessing(event.target.value)}>
            <option value="ALL">전체</option>
            {[...new Set(items.map((item) => item.processingStatus))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          사람 검토 상태
          <select value={workflow} onChange={(event) => setWorkflow(event.target.value)}>
            <option value="ALL">전체</option>
            {[...new Set(items.map((item) => item.workflowState))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          기준 근거 상태
          <select value={criterion} onChange={(event) => setCriterion(event.target.value)}>
            <option value="ALL">전체</option>
            {["SUPPORTED", "PARTIAL", "NOT_FOUND", "CONTRADICTED", "HUMAN_ONLY"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="empty-copy">선택한 조건에 해당하는 지원서가 없습니다.</p>
      ) : (
        <div className="history-list">
          {visible.map((item) => (
            <Link
              className="history-item application-link"
              key={item.id}
              href={`/applications/${item.id}`}
            >
              <div className="section-heading-inline">
                <strong>{item.label}</strong>
                <span className={`status-chip status-${item.processingStatus.toLowerCase()}`}>
                  {item.processingStatus}
                </span>
              </div>
              <span>사람 업무 상태: {item.workflowState}</span>
              <span>
                기준별 근거:{" "}
                {item.criterionStatuses.length > 0
                  ? item.criterionStatuses.join(" · ")
                  : "검증 결과 대기"}
              </span>
              <small>
                {new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.submittedAt))}
              </small>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

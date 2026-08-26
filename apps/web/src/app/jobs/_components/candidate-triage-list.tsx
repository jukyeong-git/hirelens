"use client";

import Link from "next/link";

interface CandidateTriageItem {
  id: string;
  label: string;
  sourceLabel: string;
  submittedAt: string;
  atsStatus: string;
  evidenceCount: number;
}

export function CandidateTriageList({ items }: { items: CandidateTriageItem[] }) {
  return (
    <>
      {items.length === 0 ? (
        <p className="empty-copy">선택한 조건에 해당하는 지원서가 없습니다.</p>
      ) : (
        <div className="history-list">
          {items.map((item) => (
            <Link
              className="history-item application-link"
              key={item.id}
              href={`/applications/${item.id}`}
            >
              <div className="application-link-heading">
                <strong>{item.label}</strong>
                <span className="application-link-detail">상세 보기 →</span>
              </div>
              <small>
                {item.sourceLabel} ·{" "}
                {new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "medium",
                }).format(new Date(item.submittedAt))}{" "}
                접수
              </small>
              <span className="application-link-detail">
                {item.atsStatus} · 직접·부분 근거 {item.evidenceCount}건
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

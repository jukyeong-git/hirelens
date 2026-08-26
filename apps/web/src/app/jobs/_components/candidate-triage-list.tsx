"use client";

import Link from "next/link";

interface CandidateTriageItem {
  id: string;
  label: string;
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
              <div className="section-heading-inline">
                <strong>{item.label}</strong>
              </div>
              <span className="application-link-detail">상세 보기 →</span>
              <span className="application-link-detail">
                {item.atsStatus}
                {item.evidenceCount > 0 ? ` · 검증 근거 ${item.evidenceCount}건` : ""}
              </span>
              <small>
                {new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "medium",
                }).format(new Date(item.submittedAt))}
              </small>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

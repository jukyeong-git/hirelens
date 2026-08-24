import type { ResumeProcessingRunRecord } from "@hirelens/domain";

export function ProcessingStatus({ runs }: { runs: ResumeProcessingRunRecord[] }) {
  return (
    <section className="panel" aria-labelledby="processing-title">
      <p className="eyebrow">File processing</p>
      <h2 id="processing-title">파일 처리 상태</h2>
      <p className="section-copy">
        시스템이 PDF 페이지 텍스트를 준비하는 상태입니다. AI 근거 또는 사람의 채용 결정이 아닙니다.
      </p>
      {runs.length === 0 ? (
        <p className="empty-copy">처리 작업이 아직 생성되지 않았습니다.</p>
      ) : (
        <div className="history-list">
          {runs.map((run) => (
            <article className="history-item" key={run.id}>
              <strong>{statusLabel(run.status)}</strong>
              <span>
                시도 {run.attempt_count}/2 ·{" "}
                {run.error_category ? `안전 오류 분류: ${run.error_category}` : "오류 없음"}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function statusLabel(status: string) {
  return (
    {
      QUEUED: "대기 중",
      EXTRACTING: "PDF 텍스트 추출 중",
      COMPLETED: "추출 완료",
      NEEDS_OCR: "이미지 전용 PDF — OCR 필요",
      FAILED: "추출 실패",
      RETRY_PENDING: "재시도 대기",
    }[status] ?? status
  );
}

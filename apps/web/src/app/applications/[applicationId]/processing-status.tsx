import type { ResumeProcessingRunRecord } from "@hirelens/domain";

export function ProcessingStatus({ runs }: { runs: ResumeProcessingRunRecord[] }) {
  return (
    <section className="panel" aria-labelledby="processing-title">
      <p className="eyebrow">File processing</p>
      <h2 id="processing-title">파일 처리 상태</h2>
      <p className="section-copy">파일 처리 상태 · AI 근거 및 사람의 채용 결정과 분리</p>
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
              {run.model_id ? (
                <span>
                  {run.model_id === "PREPROCESSED_SYNTHETIC"
                    ? "사전 처리 합성 결과"
                    : `라이브 OpenAI 결과 · ${run.model_id}`}
                </span>
              ) : null}
              {run.prompt_version && run.schema_version ? (
                <span>
                  프롬프트 {run.prompt_version} · 스키마 {run.schema_version} · 파이프라인{" "}
                  {run.pipeline_version}
                </span>
              ) : null}
              {run.total_tokens !== null && run.estimated_cost_microusd !== null ? (
                <span>
                  토큰 {run.total_tokens.toLocaleString("ko-KR")} · 추정 비용 $
                  {(run.estimated_cost_microusd / 1_000_000).toFixed(6)}
                </span>
              ) : null}
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
      ANALYZING: "AI 근거 분석 중",
      VALIDATING: "원문 인용문 검증 중",
      COMPLETED: "근거 검증 완료",
      NEEDS_OCR: "이미지 전용 PDF — OCR 필요",
      FAILED: "추출 실패",
      RETRY_PENDING: "재시도 대기",
      QUARANTINED: "검증 실패 결과 격리",
    }[status] ?? status
  );
}

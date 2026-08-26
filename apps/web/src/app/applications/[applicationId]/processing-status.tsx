import type { ResumeProcessingRunRecord } from "@hirelens/domain";

interface ProcessingStatusProps {
  runs: ResumeProcessingRunRecord[];
  viewerRole: string;
}

/** What the reader needs to know, and what they can do about it. */
const OUTCOMES: Record<string, { title: string; detail: string }> = {
  QUEUED: { title: "분석 대기 중", detail: "곧 지원서를 읽습니다." },
  EXTRACTING: { title: "지원서 읽는 중", detail: "문서에서 글자를 가져오고 있습니다." },
  ANALYZING: { title: "근거 찾는 중", detail: "평가 기준별로 근거를 찾고 있습니다." },
  VALIDATING: { title: "원문 대조 중", detail: "찾은 문장이 지원서에 실제로 있는지 확인합니다." },
  RETRY_PENDING: {
    title: "다시 시도합니다",
    detail: "일시적인 문제가 있어 자동으로 재시도합니다.",
  },
  COMPLETED: {
    title: "분석 완료",
    detail: "모든 근거가 지원서 원문과 대조를 마쳤습니다.",
  },
  NEEDS_OCR: {
    title: "글자를 읽지 못했습니다",
    detail: "글자가 없는 이미지 지원서입니다. 원문을 직접 확인해 주세요.",
  },
  FAILED: {
    title: "분석하지 못했습니다",
    detail: "지원서를 처리하는 중 문제가 생겼습니다. 관리자에게 문의하세요.",
  },
  QUARANTINED: {
    title: "결과를 저장하지 않았습니다",
    detail: "AI가 제시한 근거가 지원서 원문과 일치하지 않아 보관하지 않았습니다.",
  },
};

export function ProcessingStatus({ runs, viewerRole }: ProcessingStatusProps) {
  const latest = runs[0] ?? null;
  const outcome = latest ? OUTCOMES[latest.status] : null;

  return (
    <section className="panel" aria-labelledby="processing-title">
      <h2 id="processing-title">지원서 분석</h2>
      {!latest ? (
        <p className="empty-copy">아직 분석이 시작되지 않았습니다.</p>
      ) : (
        <>
          <div className="section-heading-inline">
            <strong>{outcome?.title ?? latest.status}</strong>
            {latest.completed_at ? (
              <span className="version-label">
                {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long" }).format(
                  new Date(latest.completed_at),
                )}
              </span>
            ) : null}
          </div>
          <p>{outcome?.detail ?? ""}</p>

          {/* Model, prompt, and schema versions are stored for traceability on
              every run. Operators need them when a run misbehaves; a recruiter
              reading a candidate does not, and showing them reads as a debug
              screen. */}
          {viewerRole === "ADMIN" ? (
            <details className="processing-technical">
              <summary>기술 정보</summary>
              <dl>
                <div>
                  <dt>모델</dt>
                  <dd>
                    {latest.model_id === "PREPROCESSED_SYNTHETIC"
                      ? "사전 처리된 합성 결과"
                      : (latest.model_id ?? "—")}
                  </dd>
                </div>
                <div>
                  <dt>계약 버전</dt>
                  <dd>
                    프롬프트 {latest.prompt_version ?? "—"} · 스키마 {latest.schema_version ?? "—"}{" "}
                    · 파이프라인 {latest.pipeline_version}
                  </dd>
                </div>
                <div>
                  <dt>시도</dt>
                  <dd>
                    {latest.attempt_count}회
                    {latest.error_category ? ` · ${latest.error_category}` : ""}
                  </dd>
                </div>
                {latest.total_tokens !== null && latest.estimated_cost_microusd !== null ? (
                  <div>
                    <dt>사용량</dt>
                    <dd>
                      토큰 {latest.total_tokens.toLocaleString("ko-KR")} · 약 $
                      {(latest.estimated_cost_microusd / 1_000_000).toFixed(4)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

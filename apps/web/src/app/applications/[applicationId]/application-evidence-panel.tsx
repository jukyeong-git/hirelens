import type {
  CriterionRecord,
  EvidenceItemRecord,
  ResumePageRecord,
  ResumeProcessingRunRecord,
} from "@hirelens/domain";

interface ApplicationEvidencePanelProps {
  criteria: CriterionRecord[];
  evidence: EvidenceItemRecord[];
  pages: ResumePageRecord[];
  runs: ResumeProcessingRunRecord[];
}

export function ApplicationEvidencePanel({
  criteria,
  evidence,
  pages,
  runs,
}: ApplicationEvidencePanelProps) {
  const criterionById = new Map(criteria.map((criterion) => [criterion.id, criterion]));
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const grouped = new Map<string, EvidenceItemRecord[]>();
  for (const item of evidence) {
    grouped.set(item.criterion_id, [...(grouped.get(item.criterion_id) ?? []), item]);
  }
  const latestRun = runs[0] ?? null;

  return (
    <section className="panel" aria-labelledby="evidence-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id="evidence-title">AI 지원서 근거</h2>
        </div>
        <span className={`status-chip status-${(latestRun?.status ?? "QUEUED").toLowerCase()}`}>
          {processingLabel(latestRun?.status ?? "QUEUED")}
        </span>
      </div>
      {latestRun?.status === "QUARANTINED" ? (
        <p className="form-alert form-alert-error" role="alert">
          모델 결과가 원문 또는 계약 검증을 통과하지 못해 격리되었습니다. 신뢰 가능한 AI 근거로
          표시하지 않습니다.
        </p>
      ) : null}
      {latestRun?.status === "NEEDS_OCR" ? (
        <p className="form-alert form-alert-warning" role="status">
          이미지 전용 PDF입니다. P0에서는 OCR을 실행하지 않으며 사람이 원문을 검토해야 합니다.
        </p>
      ) : null}
      {evidence.length === 0 ? (
        <p className="empty-copy">
          {latestRun
            ? "아직 검증 완료된 근거가 없습니다."
            : "처리 작업이 아직 생성되지 않았습니다."}
        </p>
      ) : (
        <div className="evidence-split">
          <div className="criterion-evidence-list" aria-label="기준별 AI 근거">
            {criteria.map((criterion) => {
              const items = grouped.get(criterion.id) ?? [];
              const summary = items[0];
              const displayStatus = summary?.status ?? "PENDING";
              return (
                <article className="criterion-evidence-card" key={criterion.id}>
                  <div className="section-heading-inline">
                    <div>
                      <span className="version-label">{criterion.type}</span>
                      <h3>{criterion.name}</h3>
                    </div>
                    <span className={`evidence-status evidence-${displayStatus.toLowerCase()}`}>
                      {evidenceLabel(displayStatus)}
                    </span>
                  </div>
                  <p>{criterion.definition}</p>
                  {summary?.interpretation ? (
                    <p>
                      <strong>해석:</strong> {summary.interpretation}
                    </p>
                  ) : null}
                  {summary?.uncertainty ? (
                    <p>
                      <strong>불확실성:</strong> {summary.uncertainty}
                    </p>
                  ) : null}
                  {items
                    .filter((item) => item.exact_quote)
                    .map((item) => {
                      const page = item.resume_page_id ? pageById.get(item.resume_page_id) : null;
                      return (
                        <blockquote key={item.id}>
                          “{item.exact_quote}”
                          {page ? (
                            <a href={`#source-page-${page.page_number}`}>
                              원문 {page.page_number}페이지 보기
                            </a>
                          ) : null}
                        </blockquote>
                      );
                    })}
                  {summary?.status === "NOT_FOUND" ? (
                    <p className="careful-absence">제출 자료에서 근거를 찾지 못함.</p>
                  ) : null}
                  {summary?.suggested_interview_question ? (
                    <p>
                      <strong>확인 질문:</strong> {summary.suggested_interview_question}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
          <aside className="source-page-list" aria-label="지원서 원문 페이지">
            <h3>원문 페이지</h3>
            {pages.map((page) => (
              <article id={`source-page-${page.page_number}`} key={page.id} tabIndex={-1}>
                <strong>{page.page_number}페이지</strong>
                <p>{page.raw_text || "추출 가능한 텍스트가 없습니다."}</p>
              </article>
            ))}
          </aside>
        </div>
      )}
      {evidence.some((item) => !criterionById.has(item.criterion_id)) ? (
        <p className="form-alert form-alert-error" role="alert">
          현재 승인 기준과 연결되지 않는 근거가 감지되어 숨겼습니다.
        </p>
      ) : null}
      {latestRun?.status === "COMPLETED" &&
      criteria.some((criterion) => !grouped.has(criterion.id)) ? (
        <p className="form-alert form-alert-error" role="alert">
          완료된 실행에 일부 평가 기준 결과가 없어 해당 항목을 결과 대기로 표시했습니다.
        </p>
      ) : null}
    </section>
  );
}

function evidenceLabel(status: string) {
  return (
    (
      {
        SUPPORTED: "직접 근거",
        PARTIAL: "부분 근거",
        NOT_FOUND: "근거 미발견",
        CONTRADICTED: "명시적 상충",
        HUMAN_ONLY: "사람 확인 전용",
        PENDING: "결과 대기",
      } as Record<string, string>
    )[status] ?? status
  );
}

function processingLabel(status: string) {
  return (
    (
      {
        QUEUED: "대기",
        EXTRACTING: "PDF 추출",
        ANALYZING: "AI 분석",
        VALIDATING: "원문 검증",
        COMPLETED: "검토 가능",
        RETRY_PENDING: "재시도 대기",
        NEEDS_OCR: "OCR 필요",
        FAILED: "처리 실패",
        QUARANTINED: "격리",
      } as Record<string, string>
    )[status] ?? status
  );
}

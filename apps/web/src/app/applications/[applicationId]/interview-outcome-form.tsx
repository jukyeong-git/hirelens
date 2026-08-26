"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import type {
  CriterionRecord,
  EvidenceItemRecord,
  InterviewCriterionVerdict,
  InterviewWeaknessType,
  ResumePageRecord,
} from "@hirelens/domain";

import { initialReviewActionState } from "../../jobs/action-state";
import { recordPostInterviewReviewAction } from "../../jobs/actions";

interface InterviewOutcomeFormProps {
  applicationId: string;
  scorecardVersionId: string;
  criteria: CriterionRecord[];
  evidence: EvidenceItemRecord[];
  pages: ResumePageRecord[];
}

interface ObservationValue {
  verdict: InterviewCriterionVerdict | "";
  weaknessType: InterviewWeaknessType | null;
  note: string;
}

export function InterviewOutcomeForm({
  applicationId,
  scorecardVersionId,
  criteria,
  evidence,
  pages,
}: InterviewOutcomeFormProps) {
  const [state, formAction, pending] = useActionState(
    recordPostInterviewReviewAction,
    initialReviewActionState,
  );
  const [localError, setLocalError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [values, setValues] = useState<Record<string, ObservationValue>>(() =>
    Object.fromEntries(
      criteria.map((criterion) => [criterion.id, { verdict: "", weaknessType: null, note: "" }]),
    ),
  );
  const evidenceByCriterion = useMemo(() => {
    const grouped = new Map<string, EvidenceItemRecord[]>();
    for (const item of evidence) {
      grouped.set(item.criterion_id, [...(grouped.get(item.criterion_id) ?? []), item]);
    }
    return grouped;
  }, [evidence]);
  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const completedCount = criteria.filter((criterion) => values[criterion.id]?.verdict).length;
  const observations = criteria.map((criterion) => ({
    criterionId: criterion.id,
    verdict: values[criterion.id]?.verdict,
    weaknessType: values[criterion.id]?.weaknessType ?? null,
    note: values[criterion.id]?.note.trim() || null,
  }));

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [state.status]);

  return (
    <section className="panel" aria-labelledby="post-interview-review-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id="post-interview-review-title">면접 결과 기록</h2>
          <p className="section-copy">
            지원서 원문을 참고해 사람이 확인한 결과를 기록합니다. AI 판정은 선택 후 비교용으로
            표시됩니다.
          </p>
        </div>
        <span className="count-label">
          {completedCount}/{criteria.length}개 응답
        </span>
      </div>

      <form
        action={formAction}
        className="scorecard-workflow-form"
        onSubmit={(event) => {
          if (completedCount !== criteria.length) {
            event.preventDefault();
            setLocalError("모든 평가 기준의 면접 결과를 선택하세요.");
            requestAnimationFrame(() => errorRef.current?.focus());
          } else {
            setLocalError("");
          }
        }}
      >
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="scorecardVersionId" value={scorecardVersionId} />
        <input type="hidden" name="observations" value={JSON.stringify(observations)} />

        {localError || state.status === "error" ? (
          <p ref={errorRef} className="form-alert form-alert-error" role="alert" tabIndex={-1}>
            {localError || state.message}
          </p>
        ) : null}

        <div className="criterion-evidence-list">
          {criteria.map((criterion) => {
            const current = values[criterion.id] ?? {
              verdict: "",
              weaknessType: null,
              note: "",
            };
            const items = evidenceByCriterion.get(criterion.id) ?? [];
            const summary = items[0];
            return (
              <fieldset className="interview-verdict-card" key={criterion.id}>
                <legend>
                  <span className="version-label">{criterionTypeLabel(criterion.type)}</span>{" "}
                  {criterion.name}
                </legend>
                <p>{criterion.definition}</p>
                <div className="interview-source-evidence">
                  <strong>지원서 원문 근거</strong>
                  {items.some((item) => item.exact_quote) ? (
                    items
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
                      })
                  ) : (
                    <p className="careful-absence">
                      제출 자료에서 이 기준을 뒷받침하는 근거를 찾지 못했습니다.
                    </p>
                  )}
                </div>
                <label>
                  면접에서 확인한 결과
                  <select
                    aria-label={`${criterion.name} 면접 결과`}
                    value={current.verdict}
                    disabled={pending}
                    onChange={(event) => {
                      const verdict = event.target.value as InterviewCriterionVerdict | "";
                      setValues((previous) => ({
                        ...previous,
                        [criterion.id]: {
                          ...current,
                          verdict,
                          weaknessType: verdict === "WEAKER" ? current.weaknessType : null,
                        },
                      }));
                    }}
                  >
                    <option value="">선택하세요</option>
                    <option value="MATCHED">지원서 내용대로였음</option>
                    <option value="WEAKER">지원서보다 약했음</option>
                    <option value="STRONGER">지원서보다 나았음</option>
                    <option value="NOT_ASKED">면접에서 묻지 않음</option>
                  </select>
                </label>
                {current.verdict === "WEAKER" ? (
                  <label>
                    어떤 점이 달랐습니까?
                    <select
                      aria-label={`${criterion.name} 차이 유형`}
                      value={current.weaknessType ?? ""}
                      required
                      disabled={pending}
                      onChange={(event) =>
                        setValues((previous) => ({
                          ...previous,
                          [criterion.id]: {
                            ...current,
                            weaknessType: event.target.value as InterviewWeaknessType,
                          },
                        }))
                      }
                    >
                      <option value="">선택하세요</option>
                      <option value="FALSE_CLAIM">지원서 내용이 사실과 달랐음</option>
                      <option value="LEVEL_INSUFFICIENT">
                        사실이지만 필요한 수준·범위가 아니었음
                      </option>
                      <option value="AI_MISREAD">지원서 표현을 시스템이 다르게 읽음</option>
                    </select>
                  </label>
                ) : null}
                <label>
                  관찰 메모 (선택)
                  <textarea
                    aria-label={`${criterion.name} 관찰 메모`}
                    maxLength={1000}
                    value={current.note}
                    disabled={pending}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [criterion.id]: { ...current, note: event.target.value },
                      }))
                    }
                  />
                </label>
                {current.verdict ? (
                  <div className="interview-verdict-comparison" role="status">
                    <span
                      className={`evidence-status evidence-${(summary?.status ?? "PENDING").toLowerCase()}`}
                    >
                      AI 지원서 근거: {evidenceLabel(summary?.status ?? "PENDING")}
                    </span>
                    {summary?.status === "SUPPORTED" && current.verdict === "WEAKER" ? (
                      <p className="verdict-mismatch">
                        지원서에서는 직접 근거였지만 면접 관찰과 어긋납니다.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
            );
          })}
        </div>

        <label>
          평가 기준 밖의 판단 이유 (선택)
          <textarea name="offCriteriaReason" maxLength={2000} disabled={pending} />
        </label>
        <label>
          최종 결정
          <select name="decision" required defaultValue="" disabled={pending}>
            <option value="" disabled>
              선택하세요
            </option>
            <option value="PROCEED">다음 단계 진행</option>
            <option value="HOLD">보류</option>
            <option value="DO_NOT_PROCEED">진행하지 않음</option>
          </select>
        </label>
        <label>
          사유 분류
          <select name="reasonCode" required defaultValue="" disabled={pending}>
            <option value="" disabled>
              선택하세요
            </option>
            <option value="EVIDENCE_REVIEW">근거 검토</option>
            <option value="INTERVIEW_REQUIRED">추가 인터뷰 필요</option>
            <option value="ROLE_ALIGNMENT">직무 기준 정합성</option>
            <option value="BUSINESS_CONTEXT">업무 상황</option>
          </select>
        </label>
        <label>
          상세 사유
          <textarea name="reasonDetail" required maxLength={2000} disabled={pending} />
        </label>
        <label>
          확신도
          <select name="confidence" required defaultValue="MEDIUM" disabled={pending}>
            <option value="HIGH">높음</option>
            <option value="MEDIUM">중간</option>
            <option value="LOW">낮음</option>
          </select>
        </label>
        <label>
          추가 메모 (선택)
          <textarea name="note" maxLength={2000} disabled={pending} />
        </label>
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "저장 중…" : "면접 결과와 최종 결정 저장"}
        </button>
        {state.status === "success" ? (
          <p className="form-alert form-alert-success" role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function criterionTypeLabel(type: CriterionRecord["type"]) {
  return { REQUIRED: "필수", PREFERRED: "우대", INTERVIEW_ONLY: "면접 확인" }[type];
}

function evidenceLabel(status: string) {
  return (
    {
      SUPPORTED: "직접 근거",
      PARTIAL: "부분 근거",
      NOT_FOUND: "근거 미발견",
      CONTRADICTED: "명시적 상충",
      HUMAN_ONLY: "사람 확인 전용",
      PENDING: "결과 대기",
    }[status] ?? status
  );
}

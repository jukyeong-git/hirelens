"use client";

import { useId, useState } from "react";
import { useActionState } from "react";

import type { AmbiguityResolution, CriterionType, ScorecardCriterion } from "@hirelens/domain";

import { initialAmbiguityReviewActionState } from "../action-state";
import { reviewScorecardAmbiguityAction } from "../actions";
import { visibleCopy } from "../../_components/visible-copy";

interface AmbiguityReviewFormProps {
  jobId: string;
  scorecardVersionId: string;
  criterion: ScorecardCriterion & { id: string };
}

export function AmbiguityReviewForm({
  jobId,
  scorecardVersionId,
  criterion,
}: AmbiguityReviewFormProps) {
  const [state, formAction, pending] = useActionState(
    reviewScorecardAmbiguityAction,
    initialAmbiguityReviewActionState,
  );
  const [resolution, setResolution] = useState<AmbiguityResolution>(
    criterion.type === "INTERVIEW_ONLY" || criterion.ambiguity_status === "HUMAN_ONLY"
      ? "INTERVIEW_ONLY"
      : "CLARIFY",
  );
  const [criterionType, setCriterionType] = useState<CriterionType>(
    criterion.type === "INTERVIEW_ONLY" ? "REQUIRED" : criterion.type,
  );
  const [resumeAssessable, setResumeAssessable] = useState(
    criterion.resume_assessable ? "true" : "false",
  );
  const definitionId = useId();
  const acceptedEvidenceId = useId();
  const alternativeEvidenceId = useId();
  const criterionTypeId = useId();
  const resumeAssessableId = useId();
  const questionId = useId();
  const reasonId = useId();

  if (criterion.ambiguity_status === "CLEAR") {
    return <p className="review-complete">사람의 검토가 완료된 기준입니다.</p>;
  }

  return (
    <form action={formAction} className="ambiguity-review-form">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scorecardVersionId" value={scorecardVersionId} />
      <input type="hidden" name="criterionId" value={criterion.id} />
      <input
        type="hidden"
        name="expectedSnapshot"
        value={JSON.stringify({
          type: criterion.type,
          definition: criterion.definition,
          accepted_evidence: criterion.accepted_evidence,
          alternative_evidence: criterion.alternative_evidence,
          resume_assessable: criterion.resume_assessable,
          ambiguity_status: criterion.ambiguity_status,
          suggested_interview_question: criterion.suggested_interview_question,
        })}
      />

      <fieldset disabled={pending}>
        <legend>사람의 검토 결과</legend>

        <label>
          검토 결과
          <select
            name="resolution"
            value={resolution}
            onChange={(event) => setResolution(event.target.value as AmbiguityResolution)}
          >
            <option value="CLARIFY">기준을 구체화해서 이력서 평가에 사용</option>
            <option value="INTERVIEW_ONLY">면접 전용으로 분류</option>
          </select>
        </label>

        <label htmlFor={definitionId}>
          사람이 확정할 기준 정의
          <textarea
            id={definitionId}
            name="definition"
            defaultValue={criterion.definition}
            rows={3}
            required
          />
        </label>

        <div className="form-grid-two">
          <label htmlFor={criterionTypeId}>
            기준 유형
            {resolution === "INTERVIEW_ONLY" ? (
              <>
                <input type="hidden" name="criterionType" value="INTERVIEW_ONLY" />
                <select id={criterionTypeId} value="INTERVIEW_ONLY" disabled>
                  <option value="INTERVIEW_ONLY">면접 전용</option>
                </select>
              </>
            ) : (
              <select
                id={criterionTypeId}
                name="criterionType"
                value={criterionType === "INTERVIEW_ONLY" ? "REQUIRED" : criterionType}
                onChange={(event) => setCriterionType(event.target.value as CriterionType)}
              >
                <option value="REQUIRED">필수</option>
                <option value="PREFERRED">우대</option>
              </select>
            )}
          </label>

          <label htmlFor={resumeAssessableId}>
            이력서 평가
            {resolution === "INTERVIEW_ONLY" ? (
              <>
                <input type="hidden" name="resumeAssessable" value="false" />
                <select id={resumeAssessableId} value="false" disabled>
                  <option value="false">불가 · 면접에서 확인</option>
                </select>
              </>
            ) : (
              <select
                id={resumeAssessableId}
                name="resumeAssessable"
                value={resumeAssessable}
                onChange={(event) => setResumeAssessable(event.target.value)}
              >
                <option value="true">가능</option>
                <option value="false">불가 · 면접에서 확인</option>
              </select>
            )}
          </label>
        </div>

        <label htmlFor={acceptedEvidenceId}>
          인정 근거 · 줄마다 한 항목
          <textarea
            id={acceptedEvidenceId}
            name="acceptedEvidence"
            defaultValue={criterion.accepted_evidence.join("\n")}
            rows={3}
          />
        </label>

        <label htmlFor={alternativeEvidenceId}>
          대체 근거 · 줄마다 한 항목
          <textarea
            id={alternativeEvidenceId}
            name="alternativeEvidence"
            defaultValue={criterion.alternative_evidence.join("\n")}
            rows={2}
          />
        </label>

        <label htmlFor={questionId}>
          면접 확인 질문
          <textarea
            id={questionId}
            name="suggestedInterviewQuestion"
            defaultValue={criterion.suggested_interview_question ?? ""}
            rows={2}
          />
        </label>

        <label htmlFor={reasonId}>
          검토 사유
          <textarea
            id={reasonId}
            name="reason"
            placeholder="예: 이력서에서 확인할 운영 범위를 배포·장애 대응으로 구체화함"
            rows={2}
            required
          />
        </label>
      </fieldset>

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "검토 저장 중…" : "검토 결과 저장"}
        </button>
        <span className="form-help">
          저장 후에도 AI가 처음 표시한 표현과 사람이 정한 결과는 검토 상태에서 구분됩니다.
        </span>
      </div>

      {state.status === "success" ? (
        <p className="form-alert form-alert-success" role="status">
          {visibleCopy(state.message)}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="form-alert form-alert-error" role="alert">
          {visibleCopy(state.message)}
        </p>
      ) : null}
    </form>
  );
}

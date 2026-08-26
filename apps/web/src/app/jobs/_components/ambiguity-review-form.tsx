"use client";

import { useId, useState } from "react";
import { useActionState } from "react";

import type { AmbiguityResolution, CriterionType, ScorecardCriterion } from "@hirelens/domain";

import { SegmentedControl } from "../../_components/segmented-control";
import { FieldSelect } from "../../_components/field-select";
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
    return <p className="review-complete">검토를 마친 기준입니다.</p>;
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
        <legend>검토 결과</legend>

        <SegmentedControl
          legend="이 기준을 어떻게 하시겠습니까?"
          name="resolution"
          value={resolution}
          onChange={(value) => setResolution(value as AmbiguityResolution)}
          columns={2}
          options={[
            {
              value: "CLARIFY",
              label: "구체화해서 이력서로 확인",
              hint: "무엇이 근거인지 명확히 적습니다",
            },
            {
              value: "INTERVIEW_ONLY",
              label: "면접에서만 확인",
              hint: "서류로는 판단하지 않습니다",
            },
          ]}
        />

        <label htmlFor={definitionId}>
          확정할 기준 정의
          <textarea
            id={definitionId}
            name="definition"
            defaultValue={criterion.definition}
            rows={3}
            required
          />
        </label>

        <div className="form-grid-two">
          <div className="field">
            <label htmlFor={criterionTypeId}>기준 유형</label>
            {resolution === "INTERVIEW_ONLY" ? (
              <>
                <input type="hidden" name="criterionType" value="INTERVIEW_ONLY" />
                <FieldSelect
                  id={criterionTypeId}
                  ariaLabel="기준 유형"
                  value="INTERVIEW_ONLY"
                  onChange={() => undefined}
                  disabled
                  options={[{ value: "INTERVIEW_ONLY", label: "면접 전용" }]}
                />
              </>
            ) : (
              <FieldSelect
                id={criterionTypeId}
                name="criterionType"
                ariaLabel="기준 유형"
                value={criterionType === "INTERVIEW_ONLY" ? "REQUIRED" : criterionType}
                onChange={(value) => setCriterionType(value as CriterionType)}
                options={[
                  { value: "REQUIRED", label: "필수", hint: "없으면 이 역할을 못 맡습니다" },
                  { value: "PREFERRED", label: "우대", hint: "있으면 좋지만 필수는 아닙니다" },
                ]}
              />
            )}
          </div>

          <div className="field">
            <label htmlFor={resumeAssessableId}>이력서로 확인</label>
            {resolution === "INTERVIEW_ONLY" ? (
              <>
                <input type="hidden" name="resumeAssessable" value="false" />
                <FieldSelect
                  id={resumeAssessableId}
                  ariaLabel="이력서로 확인"
                  value="false"
                  onChange={() => undefined}
                  disabled
                  options={[{ value: "false", label: "불가 · 면접에서 확인" }]}
                />
              </>
            ) : (
              <FieldSelect
                id={resumeAssessableId}
                name="resumeAssessable"
                ariaLabel="이력서로 확인"
                value={resumeAssessable}
                onChange={setResumeAssessable}
                options={[
                  { value: "true", label: "가능" },
                  { value: "false", label: "불가 · 면접에서 확인" },
                ]}
              />
            )}
          </div>
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
          저장 후에도 AI가 처음 짚은 표현과 담당자가 확정한 내용이 구분되어 기록에 남습니다.
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

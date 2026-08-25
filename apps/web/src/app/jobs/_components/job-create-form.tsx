"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import type { ProfileRecord } from "@hirelens/domain";

import { initialJobActionState, initialJobRequisitionDraftActionState } from "../action-state";
import { createJobAction, generateJobRequisitionDraftAction } from "../actions";
import { visibleCopy } from "../../_components/visible-copy";

interface JobCreateFormProps {
  viewerId: string;
  viewerName: string;
  profiles: ProfileRecord[];
}

export function JobCreateForm({ viewerId, viewerName, profiles }: JobCreateFormProps) {
  const [state, formAction, pending] = useActionState(createJobAction, initialJobActionState);
  const [draftState, draftFormAction, draftPending] = useActionState(
    generateJobRequisitionDraftAction,
    initialJobRequisitionDraftActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [rawJobDescription, setRawJobDescription] = useState("");
  const recruiters = profiles.filter((profile) => profile.role === "RECRUITER");

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setRawJobDescription("");
    }
  }, [state.status]);

  useEffect(() => {
    if (draftState.status === "success" && draftState.rawJobDescription) {
      setRawJobDescription(draftState.rawJobDescription);
    }
  }, [draftState.rawJobDescription, draftState.status]);

  return (
    <section className="panel" aria-labelledby="create-job-title">
      <div className="section-heading section-heading-inline">
        <div>
          <p className="eyebrow">New opening</p>
          <h2 id="create-job-title">Job 초안 생성</h2>
        </div>
        <span className="status-chip status-draft">DRAFT로 시작</span>
      </div>

      <p className="section-copy">
        담당 Hiring Manager는 현재 로그인한 사용자로 고정됩니다. Recruiter를 지정한 뒤 지원서 검토
        기준을 준비합니다.
      </p>

      <p className="form-alert form-alert-warning" role="note">
        AI는 편집 가능한 Job Requisition/직무 설명 초안만 제안합니다. 자동 저장·승인·제출·공고
        게시에는 관여하지 않으며, 최종 내용은 Hiring Manager가 검토하고 저장해야 합니다.
      </p>

      {state.status === "error" ? (
        <p className="form-alert form-alert-error" role="alert">
          {visibleCopy(state.message)}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="form-alert form-alert-success" role="status">
          {visibleCopy(state.message)}
        </p>
      ) : null}
      {draftState.status === "error" ? (
        <p className="form-alert form-alert-error" role="alert">
          {visibleCopy(draftState.message)}
        </p>
      ) : null}
      {draftState.status === "success" ? (
        <p className="form-alert form-alert-success" role="status">
          {visibleCopy(draftState.message)}{" "}
          {draftState.promptVersion ? `(${draftState.promptVersion})` : ""}
        </p>
      ) : null}

      <form ref={formRef} className="job-form" action={formAction}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="title">직무명</label>
            <input id="title" name="title" maxLength={120} required />
          </div>
          <div className="field">
            <label htmlFor="department">부서</label>
            <input id="department" name="department" maxLength={120} required />
          </div>
          <div className="field">
            <label htmlFor="recruiterId">Recruiter / owner</label>
            <select id="recruiterId" name="recruiterId" required defaultValue="">
              <option value="" disabled>
                Recruiter 선택
              </option>
              {recruiters.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </select>
            <span id="recruiter-help" className="field-help">
              Recruiter는 Job 초안의 소유자입니다.
            </span>
          </div>
          <div className="field">
            <label htmlFor="hiringManagerId">Hiring Manager</label>
            <input type="hidden" name="hiringManagerId" value={viewerId} />
            <input
              id="hiringManagerId"
              value={viewerName}
              readOnly
              aria-describedby="hiring-manager-help"
            />
            <span id="hiring-manager-help" className="field-help">
              현재 로그인한 Hiring Manager로 고정됩니다.
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="authorBrief">채용 필요성 / 추가 요청</label>
          <textarea
            id="authorBrief"
            name="authorBrief"
            rows={4}
            maxLength={4_000}
            aria-describedby="author-brief-help"
            required
          />
          <span id="author-brief-help" className="field-help">
            AI 초안의 입력값입니다. 보상, 법적 자격, 회사 정책처럼 사람이 확정해야 하는 내용은 직접
            검토해 작성하세요. 이 입력값 자체는 Job 저장 전까지 보관하지 않습니다.
          </span>
        </div>

        <div className="field">
          <label htmlFor="rawJobDescription">
            직무 설명 {draftState.status === "success" ? "(AI 초안)" : ""}
          </label>
          <textarea
            id="rawJobDescription"
            name="rawJobDescription"
            rows={7}
            maxLength={20_000}
            aria-describedby="job-description-help"
            required
            value={rawJobDescription}
            onChange={(event) => setRawJobDescription(event.target.value)}
          />
          <span id="job-description-help" className="field-help">
            AI 초안은 편집 가능한 제안입니다. 내용을 검토·수정해 저장한 뒤, Hiring Manager가 이
            설명을 바탕으로 AI 검토 기준 초안을 요청할 수 있습니다.
          </span>
        </div>

        {recruiters.length === 0 ? (
          <p className="form-alert form-alert-warning" role="status">
            선택할 수 있는 Recruiter가 없습니다. 권한 또는 Profile seed를 확인하세요.
          </p>
        ) : null}

        <div className="form-actions">
          <button
            className="button button-secondary"
            type="submit"
            formAction={draftFormAction}
            disabled={pending || draftPending}
          >
            {draftPending ? "AI 초안 생성 중…" : "AI로 Job Requisition 초안 만들기"}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending || draftPending || recruiters.length === 0}
          >
            {pending ? "저장 중…" : "Job 초안 저장"}
          </button>
          <span className="form-help">
            AI 초안 또는 직접 작성한 필수 항목을 모두 입력해야 저장할 수 있습니다.
          </span>
        </div>
      </form>
    </section>
  );
}

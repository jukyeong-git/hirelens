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
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [recruiterId, setRecruiterId] = useState("");
  const [hiringNeed, setHiringNeed] = useState("");
  const [rawJobDescription, setRawJobDescription] = useState("");
  const recruiters = profiles.filter((profile) => profile.role === "RECRUITER");

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setTitle("");
      setDepartment("");
      setRecruiterId("");
      setHiringNeed("");
      setRawJobDescription("");
    }
  }, [state.status]);

  useEffect(() => {
    if (draftState.status === "success" && draftState.rawJobDescription) {
      setRawJobDescription(draftState.rawJobDescription);
    }
  }, [draftState.rawJobDescription, draftState.status]);

  return (
    <section className="panel" aria-label="채용 생성 입력">
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
          AI 초안을 직무 설명에 채웠습니다. 내용을 검토·수정한 뒤 직접 저장하세요.
        </p>
      ) : null}

      <form
        ref={formRef}
        className="job-form"
        action={formAction}
        onKeyDown={(event) => {
          const target = event.target;
          if (
            event.key === "Enter" &&
            !(target instanceof HTMLTextAreaElement) &&
            !(target instanceof HTMLButtonElement)
          ) {
            event.preventDefault();
          }
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="title">직무명</label>
            <input
              id="title"
              name="title"
              maxLength={120}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="department">부서</label>
            <input
              id="department"
              name="department"
              maxLength={120}
              required
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="recruiterId">채용 담당자</label>
            <select
              id="recruiterId"
              name="recruiterId"
              required
              value={recruiterId}
              onChange={(event) => setRecruiterId(event.target.value)}
            >
              <option value="" disabled>
                채용 담당자 선택
              </option>
              {recruiters.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hiringManagerId">채용 책임자</label>
            <input type="hidden" name="hiringManagerId" value={viewerId} />
            <input id="hiringManagerId" value={viewerName} readOnly />
          </div>
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
            required
            value={rawJobDescription}
            onChange={(event) => setRawJobDescription(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="hiringNeed">요청 사유</label>
          <textarea
            id="hiringNeed"
            name="hiringNeed"
            rows={4}
            maxLength={4_000}
            required
            value={hiringNeed}
            onChange={(event) => setHiringNeed(event.target.value)}
          />
        </div>

        {recruiters.length === 0 ? (
          <p className="form-alert form-alert-warning" role="status">
            선택할 수 있는 채용 담당자가 없습니다. 권한 또는 Profile seed를 확인하세요.
          </p>
        ) : null}

        <div className="form-actions job-create-actions">
          <button
            className="button button-secondary"
            type="submit"
            formAction={draftFormAction}
            formNoValidate
            disabled={pending || draftPending}
          >
            {draftPending ? "AI 초안 생성 중…" : "AI 초안"}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={pending || draftPending || recruiters.length === 0}
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

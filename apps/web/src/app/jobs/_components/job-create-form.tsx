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
  const [roleSummary, setRoleSummary] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [requirements, setRequirements] = useState("");
  const [preferredQualifications, setPreferredQualifications] = useState("");
  const draftRequestSnapshot = useRef({
    roleSummary: "",
    responsibilities: "",
    requirements: "",
    preferredQualifications: "",
  });
  const recruiters = profiles.filter((profile) => profile.role === "RECRUITER");

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setTitle("");
      setDepartment("");
      setRecruiterId("");
      setHiringNeed("");
      setRoleSummary("");
      setResponsibilities("");
      setRequirements("");
      setPreferredQualifications("");
    }
  }, [state.status]);

  useEffect(() => {
    if (draftState.status === "success") {
      setRoleSummary((current) =>
        current === draftRequestSnapshot.current.roleSummary
          ? (draftState.roleSummary ?? current)
          : current,
      );
      setResponsibilities((current) =>
        current === draftRequestSnapshot.current.responsibilities
          ? (draftState.responsibilities ?? current)
          : current,
      );
      setRequirements((current) =>
        current === draftRequestSnapshot.current.requirements
          ? (draftState.requirements ?? current)
          : current,
      );
      setPreferredQualifications((current) =>
        current === draftRequestSnapshot.current.preferredQualifications
          ? (draftState.preferredQualifications ?? current)
          : current,
      );
    }
  }, [draftState]);

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
          <label htmlFor="roleSummary">역할 개요</label>
          <textarea
            id="roleSummary"
            name="roleSummary"
            rows={4}
            maxLength={4_000}
            required
            value={roleSummary}
            onChange={(event) => setRoleSummary(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="responsibilities">주요 책임</label>
          <textarea
            id="responsibilities"
            name="responsibilities"
            rows={6}
            maxLength={10_000}
            required
            value={responsibilities}
            onChange={(event) => setResponsibilities(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="requirements">자격 요건</label>
          <textarea
            id="requirements"
            name="requirements"
            rows={6}
            maxLength={10_000}
            required
            value={requirements}
            onChange={(event) => setRequirements(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="preferredQualifications">우대 사항</label>
          <textarea
            id="preferredQualifications"
            name="preferredQualifications"
            rows={5}
            maxLength={10_000}
            required
            value={preferredQualifications}
            onChange={(event) => setPreferredQualifications(event.target.value)}
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
            onClick={() => {
              draftRequestSnapshot.current = {
                roleSummary,
                responsibilities,
                requirements,
                preferredQualifications,
              };
            }}
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

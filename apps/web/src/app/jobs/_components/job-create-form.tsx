"use client";

import { useActionState, useEffect, useRef } from "react";

import type { AppRole, ProfileRecord } from "@hirelens/domain";

import { initialJobActionState } from "../action-state";
import { createJobAction } from "../actions";

interface JobCreateFormProps {
  viewerId: string;
  viewerRole: AppRole;
  profiles: ProfileRecord[];
}

export function JobCreateForm({ viewerId, viewerRole, profiles }: JobCreateFormProps) {
  const [state, formAction, pending] = useActionState(createJobAction, initialJobActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const recruiters = profiles.filter((profile) => profile.role === "RECRUITER");
  const hiringManagers = profiles.filter((profile) => profile.role === "HIRING_MANAGER");

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

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
        직무 설명과 담당자를 저장하면 Hiring Manager가 다음 단계의 scorecard 작업을 이어갈 수
        있습니다.
      </p>

      {state.status === "error" ? (
        <p className="form-alert form-alert-error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="form-alert form-alert-success" role="status">
          {state.message}
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
            {viewerRole === "RECRUITER" ? (
              <>
                <input type="hidden" name="recruiterId" value={viewerId} />
                <input
                  id="recruiterId"
                  value={
                    profiles.find((profile) => profile.id === viewerId)?.display_name ??
                    "현재 Recruiter"
                  }
                  readOnly
                  aria-describedby="recruiter-help"
                />
              </>
            ) : (
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
            )}
            <span id="recruiter-help" className="field-help">
              Recruiter는 Job 초안의 소유자입니다.
            </span>
          </div>
          <div className="field">
            <label htmlFor="hiringManagerId">Hiring Manager</label>
            <select id="hiringManagerId" name="hiringManagerId" required defaultValue="">
              <option value="" disabled>
                Hiring Manager 선택
              </option>
              {hiringManagers.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="rawJobDescription">직무 설명</label>
          <textarea
            id="rawJobDescription"
            name="rawJobDescription"
            rows={7}
            maxLength={20_000}
            aria-describedby="job-description-help"
            required
          />
          <span id="job-description-help" className="field-help">
            다음 티켓에서 이 설명을 scorecard 초안의 입력으로 사용합니다. 현재는 저장만 합니다.
          </span>
        </div>

        {hiringManagers.length === 0 ? (
          <p className="form-alert form-alert-warning" role="status">
            선택할 수 있는 Hiring Manager가 없습니다. 권한 또는 Profile seed를 확인하세요.
          </p>
        ) : null}

        <div className="form-actions">
          <button
            className="button button-primary"
            type="submit"
            disabled={pending || hiringManagers.length === 0}
          >
            {pending ? "저장 중…" : "Job 초안 저장"}
          </button>
          <span className="form-help">필수 항목을 모두 입력해야 저장할 수 있습니다.</span>
        </div>
      </form>
    </section>
  );
}

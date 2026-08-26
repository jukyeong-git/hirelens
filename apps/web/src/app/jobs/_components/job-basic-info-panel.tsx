"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import type { JobRecord, ProfileRecord } from "@hirelens/domain";

import { visibleCopy, visibleMultilineCopy } from "../../_components/visible-copy";
import { initialJobActionState } from "../action-state";
import { updateJobBasicInfoAction } from "../actions";

export function JobBasicInfoPanel({
  job,
  profiles,
  canEdit,
}: {
  job: JobRecord;
  profiles: ProfileRecord[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [navigationActionTarget, setNavigationActionTarget] = useState<HTMLElement | null>(null);
  const [state, action, pending] = useActionState(
    updateJobBasicInfoAction,
    initialJobActionState,
  );
  const recruiters = profiles.filter((profile) => profile.role === "RECRUITER");
  const hiringManager = profiles.find((profile) => profile.id === job.hiring_manager_id);

  useEffect(() => {
    setNavigationActionTarget(document.getElementById("overview-navigation-action"));
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      setHasUnsavedChanges(false);
      setIsEditing(false);
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <>
      {navigationActionTarget && canEdit
        ? createPortal(
            <button
              className={`button ${isEditing ? "button-primary" : "button-quiet"} button-compact`}
              type="button"
              disabled={pending || (isEditing && !hasUnsavedChanges)}
              onClick={() => {
                if (!isEditing) {
                  setHasUnsavedChanges(false);
                  setIsEditing(true);
                  return;
                }

                const form = document.getElementById("job-basic-info-form");
                if (form instanceof HTMLFormElement) {
                  form.requestSubmit();
                }
              }}
            >
              {pending ? "저장 중…" : isEditing ? "저장" : "수정"}
            </button>,
            navigationActionTarget,
          )
        : null}

      <section className="panel" aria-label="기본 정보">
        {isEditing ? (
          <form
            id="job-basic-info-form"
            action={action}
            className="job-form"
            onChange={(event) => {
              const formData = new FormData(event.currentTarget);
              setHasUnsavedChanges(
                String(formData.get("title") ?? "") !== job.title ||
                  String(formData.get("department") ?? "") !== job.department ||
                  String(formData.get("recruiterId") ?? "") !== job.recruiter_id ||
                  String(formData.get("rawJobDescription") ?? "") !==
                    job.raw_job_description ||
                  String(formData.get("hiringNeed") ?? "") !== job.hiring_need,
              );
            }}
          >
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="expectedUpdatedAt" value={job.updated_at} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="edit-job-title">직무명</label>
                <input
                  id="edit-job-title"
                  name="title"
                  defaultValue={job.title}
                  maxLength={120}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="edit-job-department">부서</label>
                <input
                  id="edit-job-department"
                  name="department"
                  defaultValue={job.department}
                  maxLength={120}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="edit-job-recruiter">채용 담당자</label>
                <select
                  id="edit-job-recruiter"
                  name="recruiterId"
                  defaultValue={job.recruiter_id}
                  required
                >
                  {recruiters.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {visibleCopy(profile.display_name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="edit-job-hiring-manager">채용 책임자</label>
                <input
                  id="edit-job-hiring-manager"
                  value={visibleCopy(hiringManager?.display_name ?? "확인 가능한 사용자")}
                  readOnly
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="edit-job-description">직무 설명</label>
              <textarea
                id="edit-job-description"
                name="rawJobDescription"
                defaultValue={job.raw_job_description}
                rows={10}
                maxLength={20_000}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="edit-hiring-need">요청 사유</label>
              <textarea
                id="edit-hiring-need"
                name="hiringNeed"
                defaultValue={job.hiring_need}
                rows={5}
                maxLength={4_000}
                required
              />
            </div>
            <div className="form-actions job-create-actions">
              <button
                className="button button-quiet"
                type="button"
                onClick={() => {
                  setHasUnsavedChanges(false);
                  setIsEditing(false);
                }}
                disabled={pending}
              >
                취소
              </button>
            </div>
            {state.status === "error" ? (
              <p className="form-alert form-alert-error" role="alert">
                {visibleCopy(state.message)}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="job-basic-info-readonly">
            <section className="subsection" aria-labelledby="job-description-title">
              <h3 id="job-description-title">직무 설명</h3>
              <p className="job-description">{visibleMultilineCopy(job.raw_job_description)}</p>
            </section>
            <section className="subsection" aria-labelledby="request-reason-title">
              <h3 id="request-reason-title">요청 사유</h3>
              <p className="job-description">{visibleMultilineCopy(job.hiring_need)}</p>
            </section>
          </div>
        )}
      </section>
    </>
  );
}

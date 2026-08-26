"use client";

import { useActionState } from "react";

import type {
  AppRole,
  JobPostingRecord,
  JobPostingStatusHistoryRecord,
  JobRecord,
  ScorecardWorkspace,
} from "@hirelens/domain";
import { derivePublicPostingContentDraft } from "@hirelens/domain";

import { initialJobPostingActionState } from "../action-state";
import {
  closeJobPostingAction,
  createJobPostingDraftAction,
  publishJobPostingAction,
  updateJobPostingContentAction,
} from "../actions";
import { visibleCopy } from "../../_components/visible-copy";

interface JobPostingWorkflowProps {
  job: JobRecord;
  posting: JobPostingRecord | null;
  history: JobPostingStatusHistoryRecord[];
  viewerId: string;
  viewerRole: AppRole;
  scorecardWorkspace: ScorecardWorkspace;
}

const statusLabel = {
  DRAFT: "초안",
  PUBLISHED: "게시 중",
  CLOSED: "종료됨",
} as const;

export function JobPostingWorkflow({
  job,
  posting,
  history,
  viewerId,
  viewerRole,
  scorecardWorkspace,
}: JobPostingWorkflowProps) {
  const [createState, createAction, createPending] = useActionState(
    createJobPostingDraftAction,
    initialJobPostingActionState,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishJobPostingAction,
    initialJobPostingActionState,
  );
  const [closeState, closeAction, closePending] = useActionState(
    closeJobPostingAction,
    initialJobPostingActionState,
  );
  const [contentState, contentAction, contentPending] = useActionState(
    updateJobPostingContentAction,
    initialJobPostingActionState,
  );
  const isAssignedRecruiter = viewerRole === "RECRUITER" && viewerId === job.recruiter_id;
  const canManage = viewerRole === "ADMIN" || isAssignedRecruiter;
  const hasApprovedFramework = scorecardWorkspace.activeApprovedVersion !== null;
  const hasCompletePublicContent = hasPublicContent(posting);
  const canPublish = Boolean(
    posting?.status === "DRAFT" && hasApprovedFramework && hasCompletePublicContent,
  );
  const orderedHistory = [...history].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const suggestedContent = derivePublicPostingContentDraft(job.raw_job_description);
  const usesSuggestedContent =
    !posting?.public_summary?.trim() ||
    !posting.public_responsibilities?.trim() ||
    !posting.public_requirements?.trim();

  return (
    <section className="panel" aria-labelledby="job-posting-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id="job-posting-title">채용 공고</h2>
        </div>
        {posting ? (
          <span className={`status-chip status-${posting.status.toLowerCase()}`}>
            {statusLabel[posting.status]}
          </span>
        ) : null}
      </div>

      {!posting && canManage ? (
        <form action={createAction} className="form-actions">
          <input type="hidden" name="jobId" value={job.id} />
          <button className="button button-quiet" type="submit" disabled={createPending}>
            {createPending ? "초안 생성 중…" : "공고 초안 만들기"}
          </button>
          <span className="form-help">게시 후 공개 경로 활성화</span>
          <ActionMessage state={createState} />
        </form>
      ) : null}

      {posting ? (
        <section className="posting-content-editor" aria-labelledby="posting-content-title">
          <div className="section-heading section-heading-inline">
            <div>
              <h3 id="posting-content-title">공고 내용</h3>
            </div>
            <span className="status-chip status-draft">
              {hasCompletePublicContent ? "공개 문구 준비됨" : "공개 문구 입력 필요"}
            </span>
          </div>

          <p className="form-help">
            공개 URL 식별자: <code>/careers/{posting.public_slug}</code> (변경 불가)
          </p>

          {canManage && posting.status === "DRAFT" ? (
            <form action={contentAction} className="posting-content-form">
              <input type="hidden" name="jobId" value={job.id} />
              {usesSuggestedContent ? (
                <p className="form-alert form-alert-info" role="status">
                  채용 책임자가 작성한 직무 설명을 공고 초안으로 불러왔습니다. 공개 전에 내용을
                  확인하고 저장하세요.
                </p>
              ) : null}
              <label>
                공개 직무명
                <input
                  name="publicTitle"
                  defaultValue={posting.public_title ?? job.title}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                공개 요약
                <textarea
                  name="publicSummary"
                  defaultValue={posting.public_summary?.trim() || suggestedContent.summary}
                  maxLength={4000}
                  rows={4}
                  required
                />
              </label>
              <label>
                주요 업무
                <textarea
                  name="publicResponsibilities"
                  defaultValue={
                    posting.public_responsibilities?.trim() || suggestedContent.responsibilities
                  }
                  maxLength={10000}
                  rows={6}
                  required
                />
              </label>
              <label>
                필수 자격
                <textarea
                  name="publicRequirements"
                  defaultValue={
                    posting.public_requirements?.trim() || suggestedContent.requirements
                  }
                  maxLength={10000}
                  rows={6}
                  required
                />
              </label>
              <div className="form-grid form-grid-two">
                <label>
                  근무지
                  <input
                    name="publicLocation"
                    defaultValue={posting.public_location ?? ""}
                    maxLength={200}
                    required
                  />
                </label>
                <label>
                  고용 형태
                  <input
                    name="publicEmploymentType"
                    defaultValue={posting.public_employment_type ?? ""}
                    maxLength={120}
                    required
                  />
                </label>
              </div>
              <div className="form-actions">
                <button className="button button-quiet" type="submit" disabled={contentPending}>
                  {contentPending ? "공고 내용 저장 중…" : "공고 내용 저장"}
                </button>
                <span className="form-help">저장 후 후보자 화면 확인</span>
                <ActionMessage state={contentState} />
              </div>
            </form>
          ) : null}

          {!canManage && posting.status === "DRAFT" ? (
            <p className="info-banner" role="status">
              공고 내용은 배정된 채용 담당자 또는 관리자만 수정할 수 있습니다.
            </p>
          ) : null}

          <PublicPostingPreview posting={posting} />
        </section>
      ) : null}

      {posting?.status === "DRAFT" && canManage ? (
        <form
          action={publishAction}
          className="form-actions"
          onSubmit={(event) => {
            if (!window.confirm("이 공고를 후보자에게 공개하시겠습니까?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="jobId" value={job.id} />
          <button
            className="button button-primary"
            type="submit"
            disabled={!canPublish || publishPending}
          >
            {publishPending ? "게시 중…" : "공고 게시"}
          </button>
          <span className="form-help">
            승인된 지원서 평가 기준과 공고 내용이 있어야 게시할 수 있습니다.
          </span>
          {!canPublish ? (
            <p className="form-alert form-alert-warning" role="status">
              {!hasApprovedFramework
                ? "승인된 지원서 평가 기준을 확인하세요."
                : "공고 내용을 모두 입력하고 저장하세요."}
            </p>
          ) : null}
          <ActionMessage state={publishState} />
        </form>
      ) : null}

      {posting?.status === "PUBLISHED" && canManage ? (
        <form
          action={closeAction}
          className="form-actions"
          onSubmit={(event) => {
            if (!window.confirm("공고를 종료하면 다시 게시할 수 없습니다. 계속하시겠습니까?")) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="jobId" value={job.id} />
          <button className="button button-quiet" type="submit" disabled={closePending}>
            {closePending ? "종료 중…" : "공고 종료"}
          </button>
          <span className="form-help">종료된 공고는 P0에서 재개할 수 없습니다.</span>
          <ActionMessage state={closeState} />
        </form>
      ) : null}

      {posting?.status === "CLOSED" ? (
        <p className="info-banner" role="status">
          이 공고는 종료되었습니다. 다시 채용하려면 새 공고를 만드세요.
        </p>
      ) : null}

      <section aria-labelledby="job-posting-history-title">
        <div className="section-heading">
          <h3 id="job-posting-history-title">공고 상태 이력</h3>
        </div>
        {orderedHistory.length === 0 ? (
          <p className="section-copy">아직 공고 상태 변경 이력이 없습니다.</p>
        ) : (
          <ol className="history-list" aria-label="시간 순 공고 상태 이력">
            {orderedHistory.map((event) => (
              <li key={event.id} className="history-item">
                <strong>
                  {event.prior_status ? statusLabel[event.prior_status] : "생성"} →{" "}
                  {statusLabel[event.new_status]}
                </strong>
                <span>
                  처리 역할: {event.actor_role} · 날짜: {formatDate(event.created_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function hasPublicContent(posting: JobPostingRecord | null) {
  return Boolean(
    posting?.public_title?.trim() &&
      posting.public_summary?.trim() &&
      posting.public_responsibilities?.trim() &&
      posting.public_requirements?.trim() &&
      posting.public_location?.trim() &&
      posting.public_employment_type?.trim(),
  );
}

function PublicPostingPreview({ posting }: { posting: JobPostingRecord }) {
  if (!hasPublicContent(posting)) {
    return (
      <div className="empty-state" role="status">
        공고 내용을 저장하면 공개 미리보기가 표시됩니다.
      </div>
    );
  }

  return (
    <article
      className={`public-posting-preview${posting.status === "PUBLISHED" ? " is-published" : ""}`}
      aria-labelledby="public-preview-title"
    >
      <div className="section-heading section-heading-inline">
        <div>
          <h4 id="public-preview-title">
            {posting.status === "PUBLISHED" ? "게시된 채용 공고" : "공개 미리보기"}
          </h4>
          {posting.status === "PUBLISHED" && posting.published_at ? (
            <p className="form-help">게시일 {formatDate(posting.published_at)}</p>
          ) : null}
        </div>
        {posting.status === "PUBLISHED" ? (
          <a
            className="button button-quiet"
            href={`/careers/${posting.public_slug}`}
            target="_blank"
            rel="noreferrer"
          >
            공개 페이지 열기
          </a>
        ) : null}
      </div>
      <header className="internal-public-posting-title">
        <h5>{visibleCopy(posting.public_title!)}</h5>
        <p>
          {visibleCopy(posting.public_location!)} · {visibleCopy(posting.public_employment_type!)}
        </p>
      </header>
      <PreviewText title="포지션 소개" value={visibleCopy(posting.public_summary!)} />
      <PreviewText title="주요 업무" value={visibleCopy(posting.public_responsibilities!)} />
      <PreviewText title="필수 자격" value={visibleCopy(posting.public_requirements!)} />
    </article>
  );
}

function PreviewText({ title, value }: { title: string; value: string }) {
  return (
    <section>
      <h6>{title}</h6>
      <p className="preserve-lines">{value}</p>
    </section>
  );
}

function ActionMessage({ state }: { state: { status: string; message?: string } }) {
  if (state.status === "error") {
    return (
      <p className="form-alert form-alert-error" role="alert">
        {visibleCopy(state.message ?? "요청 실패")}
      </p>
    );
  }
  if (state.status === "success") {
    return (
      <p className="form-alert form-alert-success" role="status">
        {visibleCopy(state.message ?? "요청 완료")}
      </p>
    );
  }
  return null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}

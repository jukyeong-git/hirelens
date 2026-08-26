"use client";

import { useActionState } from "react";

import type {
  AppRole,
  HumanReviewRecord,
  InterviewProgressionReviewRecord,
  ReviewAssignmentRecord,
  ReviewNoteRecord,
  ReviewNoteVersionRecord,
  ScorecardVersionRecord,
} from "@hirelens/domain";

import {
  createRecruiterNoteAction,
  saveHumanDecisionAction,
  requestHiringManagerReviewAction,
  recordInterviewProgressionAction,
  setRecruiterNoteDeletedAction,
  updateRecruiterNoteAction,
} from "../actions";
import { initialReviewActionState } from "../action-state";
import { visibleCopy } from "../../_components/visible-copy";

interface ApplicationReviewPanelProps {
  applicationId: string;
  viewerRole: AppRole;
  approvedVersion: ScorecardVersionRecord | null;
  reviews: HumanReviewRecord[];
  notes: Array<{ note: ReviewNoteRecord; versions: ReviewNoteVersionRecord[] }>;
  assignments: ReviewAssignmentRecord[];
  interviewReviews: InterviewProgressionReviewRecord[];
  profileNames: Record<string, string>;
}

export function ApplicationReviewPanel({
  applicationId,
  viewerRole,
  approvedVersion,
  reviews,
  notes,
  assignments,
  interviewReviews,
  profileNames,
}: ApplicationReviewPanelProps) {
  const canDecide = viewerRole === "ADMIN" || viewerRole === "HIRING_MANAGER";
  const canWriteNote = viewerRole === "ADMIN" || viewerRole === "RECRUITER";
  const currentReview = reviews[0] ?? null;
  const activeAssignment = assignments.find((assignment) => assignment.status === "ACTIVE") ?? null;
  const currentInterviewReview = interviewReviews[0] ?? null;

  return (
    <div className="review-workflow-stack">
      <div className="review-grid">
        <section className="panel" aria-labelledby="manager-request-title">
          <h2 id="manager-request-title">검토 요청</h2>
          {activeAssignment ? (
            <div className="history-item">
              <strong>검토 요청됨</strong>
              <span>{profileNames[activeAssignment.assigned_to] ?? "채용 책임자"}</span>
              {activeAssignment.request_note ? <p>{activeAssignment.request_note}</p> : null}
            </div>
          ) : canWriteNote ? (
            <ReviewRequestForm applicationId={applicationId} />
          ) : (
            <p className="empty-copy">아직 채용 책임자 검토 요청이 없습니다.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="interview-progression-title">
          <h2 id="interview-progression-title">인터뷰 판단</h2>
          {interviewReviews.length > 0 ? (
            <InterviewProgressionHistory reviews={interviewReviews} profileNames={profileNames} />
          ) : (
            <p className="empty-copy">아직 저장된 인터뷰 판단이 없습니다.</p>
          )}
          {viewerRole === "HIRING_MANAGER" && activeAssignment && approvedVersion ? (
            <InterviewProgressionForm
              applicationId={applicationId}
              scorecardVersionId={approvedVersion.id}
            />
          ) : (
            <p className="info-banner">활성 검토 요청을 받은 채용 책임자만 저장할 수 있습니다.</p>
          )}
        </section>
      </div>
      <div className="review-grid">
        <section className="panel" aria-labelledby="human-decision-title">
          <h2 id="human-decision-title">사람의 최종 결정</h2>
          {currentReview ? (
            <DecisionHistory reviews={reviews} profileNames={profileNames} />
          ) : (
            <p className="empty-copy">아직 저장된 최종 결정이 없습니다.</p>
          )}
          {canDecide &&
          (viewerRole === "ADMIN" || currentInterviewReview?.outcome === "INTERVIEW") ? (
            <DecisionForm applicationId={applicationId} approvedVersion={approvedVersion} />
          ) : (
            <p className="info-banner">
              최종 결정은 인터뷰 판단과 분리됩니다. 채용 책임자는 인터뷰 진행 기록 후, 관리자는 운영
              권한으로 저장할 수 있습니다.
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="recruiter-note-title">
          <h2 id="recruiter-note-title">채용 담당자 메모</h2>
          {canWriteNote ? <CreateNoteForm applicationId={applicationId} /> : null}
          {notes.length === 0 ? (
            <p className="empty-copy">표시할 임시 의견이 없습니다.</p>
          ) : (
            <NoteHistory applicationId={applicationId} notes={notes} canManage={canWriteNote} />
          )}
        </section>
      </div>
    </div>
  );
}

function ReviewRequestForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(
    requestHiringManagerReviewAction,
    initialReviewActionState,
  );
  return (
    <form action={formAction} className="scorecard-workflow-form compact-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label>
        요청 메모 (선택)
        <textarea name="note" maxLength={2000} disabled={pending} />
      </label>
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "요청 중…" : "채용 책임자 검토 요청"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function InterviewProgressionForm({
  applicationId,
  scorecardVersionId,
}: {
  applicationId: string;
  scorecardVersionId: string;
}) {
  const [state, formAction, pending] = useActionState(
    recordInterviewProgressionAction,
    initialReviewActionState,
  );
  return (
    <form action={formAction} className="scorecard-workflow-form compact-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="scorecardVersionId" value={scorecardVersionId} />
      <label>
        진행 판단
        <select name="outcome" required defaultValue="">
          <option value="" disabled>
            선택하세요
          </option>
          <option value="INTERVIEW">인터뷰 진행</option>
          <option value="HOLD">보류</option>
          <option value="MORE_INFORMATION_REQUIRED">추가 정보 요청</option>
        </select>
      </label>
      <label>
        판단 사유
        <textarea name="reason" required minLength={1} maxLength={2000} disabled={pending} />
      </label>
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "저장 중…" : "인터뷰 판단 저장"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function InterviewProgressionHistory({
  reviews,
  profileNames,
}: {
  reviews: InterviewProgressionReviewRecord[];
  profileNames: Record<string, string>;
}) {
  return (
    <div className="history-list">
      {reviews.map((review, index) => (
        <article className="history-item" key={review.id}>
          <strong>
            {index === 0 ? "현재 판단" : "이전 판단"}: {interviewLabel(review.outcome)}
          </strong>
          <p>{review.reason}</p>
          <span>
            {profileNames[review.reviewer_id] ?? "채용 책임자"} · {formatDate(review.created_at)}
          </span>
        </article>
      ))}
    </div>
  );
}

function DecisionForm({
  applicationId,
  approvedVersion,
}: {
  applicationId: string;
  approvedVersion: ScorecardVersionRecord | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveHumanDecisionAction,
    initialReviewActionState,
  );
  if (!approvedVersion)
    return (
      <p className="form-alert form-alert-warning" role="status">
        승인된 지원서 평가 기준이 아직 없어 최종 결정을 저장할 수 없습니다.
      </p>
    );
  return (
    <form action={formAction} className="scorecard-workflow-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="scorecardVersionId" value={approvedVersion.id} />
      <label>
        결정{" "}
        <select name="decision" required defaultValue="">
          <option value="" disabled>
            선택하세요
          </option>
          <option value="PROCEED">다음 단계 진행</option>
          <option value="HOLD">보류</option>
          <option value="DO_NOT_PROCEED">진행하지 않음</option>
        </select>
      </label>
      <label>
        사유 분류{" "}
        <select name="reasonCode" required defaultValue="">
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
        상세 사유{" "}
        <textarea
          name="reasonDetail"
          required
          minLength={1}
          maxLength={2000}
          disabled={pending}
          placeholder="사람이 검토한 근거와 판단 이유를 기록하세요."
        />
      </label>
      <label>
        확신도{" "}
        <select name="confidence" required defaultValue="MEDIUM">
          <option value="HIGH">높음</option>
          <option value="MEDIUM">중간</option>
          <option value="LOW">낮음</option>
        </select>
      </label>
      <label>
        추가 메모{" "}
        <textarea name="note" maxLength={2000} disabled={pending} placeholder="선택 사항" />
      </label>
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "결정 저장 중…" : "최종 결정 저장"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function CreateNoteForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(
    createRecruiterNoteAction,
    initialReviewActionState,
  );
  return (
    <form action={formAction} className="scorecard-workflow-form compact-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label>
        새 임시 의견{" "}
        <textarea
          name="body"
          required
          minLength={1}
          maxLength={4000}
          disabled={pending}
          placeholder="후속 확인 사항 또는 운영 맥락을 기록하세요."
        />
      </label>
      <button className="button button-quiet" type="submit" disabled={pending}>
        {pending ? "의견 저장 중…" : "임시 의견 추가"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function NoteHistory({
  applicationId,
  notes,
  canManage,
}: {
  applicationId: string;
  notes: Array<{ note: ReviewNoteRecord; versions: ReviewNoteVersionRecord[] }>;
  canManage: boolean;
}) {
  return (
    <div className="history-list">
      {notes.map(({ note, versions }) => (
        <article key={note.id} className="history-item">
          <strong>{note.deleted_at ? "삭제된 의견" : "임시 의견"}</strong>
          {versions.map((version) => (
            <p key={version.id}>
              <span className="version-label">v{version.version_number}</span> {version.body}
            </p>
          ))}
          {canManage ? (
            <NoteManageForm
              applicationId={applicationId}
              note={note}
              latestBody={versions[0]?.body ?? ""}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}

function NoteManageForm({
  applicationId,
  note,
  latestBody,
}: {
  applicationId: string;
  note: ReviewNoteRecord;
  latestBody: string;
}) {
  const [updateState, updateAction, updating] = useActionState(
    updateRecruiterNoteAction,
    initialReviewActionState,
  );
  const [lifecycleState, lifecycleAction, changing] = useActionState(
    setRecruiterNoteDeletedAction,
    initialReviewActionState,
  );
  return (
    <div className="note-manage">
      {!note.deleted_at ? (
        <form action={updateAction} className="compact-form">
          <input type="hidden" name="applicationId" value={applicationId} />
          <input type="hidden" name="noteId" value={note.id} />
          <label>
            새 버전
            <textarea
              name="body"
              required
              minLength={1}
              maxLength={4000}
              defaultValue={latestBody}
              disabled={updating}
            />
          </label>
          <button className="button button-quiet" type="submit" disabled={updating}>
            수정 이력 저장
          </button>
          <ActionMessage state={updateState} />
        </form>
      ) : null}
      <form action={lifecycleAction} className="compact-form">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="noteId" value={note.id} />
        <input type="hidden" name="shouldDelete" value={note.deleted_at ? "false" : "true"} />
        <label>
          {note.deleted_at ? "복구 사유" : "삭제 사유"}
          <input name="reason" required maxLength={1000} disabled={changing} />
        </label>
        <button className="button button-quiet" type="submit" disabled={changing}>
          {note.deleted_at ? "의견 복구" : "의견 삭제"}
        </button>
        <ActionMessage state={lifecycleState} />
      </form>
    </div>
  );
}

function DecisionHistory({
  reviews,
  profileNames,
}: {
  reviews: HumanReviewRecord[];
  profileNames: Record<string, string>;
}) {
  return (
    <div className="history-list">
      {reviews.map((review, index) => (
        <article key={review.id} className="history-item">
          <strong>
            {index === 0 ? "현재 결정" : "이전 결정"}: {decisionLabel(review.decision)}
          </strong>
          <p>
            {review.reason_code} · 확신도 {review.confidence}
          </p>
          <p>{review.reason_detail}</p>
          <span>
            {profileNames[review.reviewer_id] ?? "사용자"} · {formatDate(review.created_at)} · 검토
            기준 {review.scorecard_version_id.slice(0, 8)}
          </span>
        </article>
      ))}
    </div>
  );
}
function interviewLabel(value: string) {
  return (
    (
      {
        INTERVIEW: "인터뷰 진행",
        HOLD: "보류",
        MORE_INFORMATION_REQUIRED: "추가 정보 요청",
      } as Record<string, string>
    )[value] ?? value
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}
function ActionMessage({
  state,
}: {
  state: { status: "idle" | "success" | "error"; message?: string };
}) {
  return state.status === "idle" ? null : (
    <p
      className={`form-alert ${state.status === "success" ? "form-alert-success" : "form-alert-error"}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {visibleCopy(state.message ?? "")}
    </p>
  );
}
function decisionLabel(value: string) {
  return (
    { PROCEED: "다음 단계 진행", HOLD: "보류", DO_NOT_PROCEED: "진행하지 않음" }[value] ?? value
  );
}

"use client";

import { useActionState } from "react";

import type {
  AppRole,
  HumanReviewRecord,
  ReviewNoteRecord,
  ReviewNoteVersionRecord,
  ScorecardVersionRecord,
} from "@hirelens/domain";

import {
  createRecruiterNoteAction,
  saveHumanDecisionAction,
  setRecruiterNoteDeletedAction,
  updateRecruiterNoteAction,
} from "../actions";
import { initialReviewActionState } from "../action-state";

interface ApplicationReviewPanelProps {
  applicationId: string;
  viewerRole: AppRole;
  approvedVersion: ScorecardVersionRecord | null;
  reviews: HumanReviewRecord[];
  notes: Array<{ note: ReviewNoteRecord; versions: ReviewNoteVersionRecord[] }>;
}

export function ApplicationReviewPanel({
  applicationId,
  viewerRole,
  approvedVersion,
  reviews,
  notes,
}: ApplicationReviewPanelProps) {
  const canDecide = viewerRole === "ADMIN" || viewerRole === "HIRING_MANAGER";
  const canWriteNote = viewerRole === "ADMIN" || viewerRole === "RECRUITER";
  const currentReview = reviews[0] ?? null;

  return (
    <div className="review-grid">
      <section className="panel" aria-labelledby="human-decision-title">
        <p className="eyebrow">Human-only decision</p>
        <h2 id="human-decision-title">최종 결정</h2>
        <p className="section-copy">
          AI와 Recruiter 의견은 결정을 대신하지 않습니다. 모든 최초·변경 결정에는 사유가 필요합니다.
        </p>
        {currentReview ? (
          <DecisionHistory reviews={reviews} />
        ) : (
          <p className="empty-copy">아직 저장된 최종 결정이 없습니다.</p>
        )}
        {canDecide ? (
          <DecisionForm applicationId={applicationId} approvedVersion={approvedVersion} />
        ) : (
          <p className="info-banner">Recruiter는 최종 결정을 저장할 수 없습니다.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="recruiter-note-title">
        <p className="eyebrow">Recruiter working notes</p>
        <h2 id="recruiter-note-title">임시 의견과 이력</h2>
        <p className="section-copy">
          의견은 최종 결정과 분리됩니다. 변경·삭제·복구 이력은 유지됩니다.
        </p>
        {canWriteNote ? <CreateNoteForm applicationId={applicationId} /> : null}
        {notes.length === 0 ? (
          <p className="empty-copy">표시할 임시 의견이 없습니다.</p>
        ) : (
          <NoteHistory applicationId={applicationId} notes={notes} canManage={canWriteNote} />
        )}
      </section>
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
        승인된 Scorecard가 아직 없어 최종 결정을 저장할 수 없습니다.
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

function DecisionHistory({ reviews }: { reviews: HumanReviewRecord[] }) {
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
        </article>
      ))}
    </div>
  );
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
      {state.message}
    </p>
  );
}
function decisionLabel(value: string) {
  return (
    { PROCEED: "다음 단계 진행", HOLD: "보류", DO_NOT_PROCEED: "진행하지 않음" }[value] ?? value
  );
}

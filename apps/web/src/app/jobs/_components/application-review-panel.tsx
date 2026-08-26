"use client";

import { useActionState, useState } from "react";

import type {
  AppRole,
  HumanReviewRecord,
  InterviewProgressionReviewRecord,
  ReviewAssignmentRecord,
  ReviewNoteRecord,
  ReviewNoteVersionRecord,
  ScorecardVersionRecord,
} from "@hirelens/domain";

import { FieldSelect } from "../../_components/field-select";
import { SegmentedControl } from "../../_components/segmented-control";
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
  const canUseOperationalDecisionOverride = viewerRole === "ADMIN";
  const canWriteNote = viewerRole === "ADMIN" || viewerRole === "RECRUITER";
  const currentReview = reviews[0] ?? null;
  const activeAssignment = assignments.find((assignment) => assignment.status === "ACTIVE") ?? null;

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
          <h2 id="human-decision-title">최종 결정</h2>
          {currentReview ? (
            <DecisionHistory reviews={reviews} profileNames={profileNames} />
          ) : (
            <p className="empty-copy">아직 저장된 최종 결정이 없습니다.</p>
          )}
          {canUseOperationalDecisionOverride ? (
            <DecisionForm applicationId={applicationId} approvedVersion={approvedVersion} />
          ) : (
            <p className="info-banner">
              채용 책임자는 인터뷰 진행 후 기준별 관찰과 최종 결정을 함께 저장합니다. 관리자는 운영
              예외로 최종 결정만 저장할 수 있습니다.
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
  const [outcome, setOutcome] = useState("");
  return (
    <form action={formAction} className="scorecard-workflow-form compact-form">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="scorecardVersionId" value={scorecardVersionId} />
      <SegmentedControl
        legend="이 지원자를 면접까지 진행할까요?"
        options={[
          { value: "INTERVIEW", label: "면접 진행", tone: "positive" },
          { value: "HOLD", label: "보류", tone: "neutral" },
          { value: "MORE_INFORMATION_REQUIRED", label: "자료 보완 요청", tone: "caution" },
        ]}
        value={outcome}
        onChange={setOutcome}
        name="outcome"
        disabled={pending}
        columns={3}
      />
      <div className="field">
        <label htmlFor="progression-reason">그렇게 판단한 이유</label>
        <textarea
          id="progression-reason"
          name="reason"
          required
          minLength={1}
          maxLength={2000}
          disabled={pending}
          placeholder="어떤 기준의 근거를 보고 이렇게 정했는지 적어 주세요."
        />
      </div>
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
  const [decision, setDecision] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [confidence, setConfidence] = useState("MEDIUM");
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
      <SegmentedControl
        legend="이 지원자를 어떻게 할까요?"
        options={[
          { value: "PROCEED", label: "다음 단계 진행", tone: "positive" },
          { value: "HOLD", label: "보류", tone: "neutral" },
          { value: "DO_NOT_PROCEED", label: "진행하지 않음", tone: "critical" },
        ]}
        value={decision}
        onChange={setDecision}
        name="decision"
        disabled={pending}
        columns={3}
      />
      <div className="field">
        <label htmlFor="decision-reason-code">사유 분류</label>
        <FieldSelect
          id="decision-reason-code"
          options={[
            { value: "EVIDENCE_REVIEW", label: "근거 검토", hint: "기준별 확인 결과에 따른 판단" },
            { value: "INTERVIEW_REQUIRED", label: "추가 면접 필요", hint: "한 번 더 확인이 필요함" },
            { value: "ROLE_ALIGNMENT", label: "직무 정합성", hint: "요구 역량과 맞지 않음" },
            { value: "BUSINESS_CONTEXT", label: "업무 상황", hint: "채용 상황·조직 사정" },
          ]}
          value={reasonCode}
          onChange={setReasonCode}
          name="reasonCode"
          disabled={pending}
          ariaLabel="사유 분류"
        />
      </div>
      <div className="field">
        <label htmlFor="decision-reason-detail">결정 이유</label>
        <textarea
          id="decision-reason-detail"
          name="reasonDetail"
          required
          minLength={1}
          maxLength={2000}
          disabled={pending}
          placeholder="어떤 근거로 이렇게 판단했는지 적어 주세요."
        />
      </div>
      <SegmentedControl
        legend="이 판단에 대한 확신"
        options={[
          { value: "HIGH", label: "높음" },
          { value: "MEDIUM", label: "보통" },
          { value: "LOW", label: "낮음" },
        ]}
        value={confidence}
        onChange={setConfidence}
        name="confidence"
        disabled={pending}
        columns={3}
      />
      <div className="field">
        <label htmlFor="decision-note">추가 메모 (선택)</label>
        <textarea id="decision-note" name="note" maxLength={2000} disabled={pending} />
      </div>
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
            {reasonCodeLabel(review.reason_code)} · 확신도 {confidenceLabel(review.confidence)}
          </p>
          <p>{review.reason_detail}</p>
          <span>
            {profileNames[review.reviewer_id] ?? "사용자"} · {formatDate(review.created_at)}
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
function reasonCodeLabel(value: string) {
  return (
    (
      {
        EVIDENCE_REVIEW: "근거 검토",
        INTERVIEW_REQUIRED: "추가 인터뷰 필요",
        ROLE_ALIGNMENT: "직무 기준 정합성",
        BUSINESS_CONTEXT: "업무 상황",
      } as Record<string, string>
    )[value] ?? value
  );
}

function confidenceLabel(value: string) {
  return (
    ({ HIGH: "높음", MEDIUM: "보통", LOW: "낮음" } as Record<string, string>)[value] ?? value
  );
}

function decisionLabel(value: string) {
  return (
    { PROCEED: "다음 단계 진행", HOLD: "보류", DO_NOT_PROCEED: "진행하지 않음" }[value] ?? value
  );
}

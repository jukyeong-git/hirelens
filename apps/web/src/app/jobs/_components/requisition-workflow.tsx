"use client";

import { useActionState } from "react";

import type {
  JobSummary,
  JobRecord,
  AppRole,
  ProfileRecord,
  RequisitionStatusHistoryRecord,
  ScorecardWorkspace,
} from "@hirelens/domain";

import { initialRequisitionActionState } from "../action-state";
import {
  assignRequisitionApproverAction,
  resolveRequisitionApprovalAction,
  submitRequisitionAction,
} from "../actions";
import { visibleCopy } from "../../_components/visible-copy";

interface RequisitionWorkflowProps {
  job: JobRecord | JobSummary;
  viewerId: string;
  viewerRole: AppRole;
  approvers: ProfileRecord[];
  history: RequisitionStatusHistoryRecord[];
  scorecardWorkspace?: ScorecardWorkspace;
}

const labels: Record<JobRecord["requisition_status"], string> = {
  DRAFT: "초안",
  PENDING_APPROVAL: "승인 대기",
  APPROVED: "승인됨",
  RETURNED: "반려됨",
};

export function RequisitionWorkflow({
  job,
  viewerId,
  viewerRole,
  approvers,
  history,
  scorecardWorkspace,
}: RequisitionWorkflowProps) {
  const [assignmentState, assignAction, assignmentPending] = useActionState(
    assignRequisitionApproverAction,
    initialRequisitionActionState,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    submitRequisitionAction,
    initialRequisitionActionState,
  );
  const [resolutionState, resolveAction, resolutionPending] = useActionState(
    resolveRequisitionApprovalAction,
    initialRequisitionActionState,
  );
  const isAssignedHiringManager =
    viewerRole === "HIRING_MANAGER" && viewerId === job.hiring_manager_id;
  const isDesignatedApprover =
    viewerRole === "REQUISITION_APPROVER" && viewerId === job.requisition_approver_id;
  const canAssign =
    isAssignedHiringManager &&
    (job.requisition_status === "DRAFT" || job.requisition_status === "RETURNED");
  const hasApprovedScorecard = scorecardWorkspace?.activeApprovedVersion !== null;
  const canSubmit = canAssign && Boolean(job.requisition_approver_id) && hasApprovedScorecard;
  const chronologicalHistory = [...history].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const latestReturn = [...chronologicalHistory]
    .reverse()
    .find((event) => event.new_status === "RETURNED");
  const selectedApprover = approvers.find((profile) => profile.id === job.requisition_approver_id);

  return (
    <section className="panel" aria-labelledby={`requisition-workflow-title-${job.id}`}>
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id={`requisition-workflow-title-${job.id}`}>채용 요청 승인</h2>
        </div>
        <span className={`status-chip status-${job.requisition_status.toLowerCase()}`}>
          {labels[job.requisition_status]}
        </span>
      </div>
      <dl className="metadata-grid" aria-label="채용 요청 상태">
        <div>
          <span>채용 요청 상태</span>
          <strong>{labels[job.requisition_status]}</strong>
        </div>
        {viewerRole !== "REQUISITION_APPROVER" ? (
          <div>
            <span>평가 기준 상태</span>
            <strong>{hasApprovedScorecard ? "승인됨" : "승인 전"}</strong>
          </div>
        ) : null}
        {viewerRole !== "REQUISITION_APPROVER" ? (
          <div>
            <span>지정 승인자</span>
            <strong>{selectedApprover?.display_name ?? "미지정"}</strong>
          </div>
        ) : null}
        <div>
          <span>제출 시각</span>
          <strong>{job.submitted_at ? formatDate(job.submitted_at) : "아직 제출하지 않음"}</strong>
        </div>
      </dl>
      {latestReturn?.reason ? (
        <p className="form-alert form-alert-warning" role="status">
          <strong>최근 반려 사유:</strong> {latestReturn.reason}
          <br />
          <strong>다음 작업:</strong> 내용을 보완하고 승인자를 확인한 뒤 다시 제출하세요.
        </p>
      ) : null}
      {!isAssignedHiringManager && viewerRole !== "REQUISITION_APPROVER" ? (
        <p className="info-banner" role="status">
          이 영역은 읽기 전용입니다. 배정된 채용 책임자만 승인자를 지정하고 제출할 수 있습니다.
        </p>
      ) : null}
      {canAssign ? (
        <form action={assignAction} className="scorecard-workflow-form">
          <input type="hidden" name="jobId" value={job.id} />
          <label htmlFor="requisition-approver">채용 요청 승인자</label>
          <select
            id="requisition-approver"
            name="approverId"
            required
            defaultValue={job.requisition_approver_id ?? ""}
          >
            <option value="" disabled>
              승인자 선택
            </option>
            {approvers.map((approver) => (
              <option key={approver.id} value={approver.id}>
                {approver.display_name}
              </option>
            ))}
          </select>
          <button
            className="button button-quiet"
            type="submit"
            disabled={assignmentPending || approvers.length === 0}
          >
            {assignmentPending ? "지정 중…" : "승인자 저장"}
          </button>
          {assignmentState.status === "error" ? (
            <p className="form-alert form-alert-error" role="alert">
              {visibleCopy(assignmentState.message)}
            </p>
          ) : null}
          {assignmentState.status === "success" ? (
            <p className="form-alert form-alert-success" role="status">
              {visibleCopy(assignmentState.message)}
            </p>
          ) : null}
        </form>
      ) : null}
      {isAssignedHiringManager &&
      job.requisition_status !== "PENDING_APPROVAL" &&
      job.requisition_status !== "APPROVED" ? (
        <form action={submitAction} className="form-actions">
          <input type="hidden" name="jobId" value={job.id} />
          <button
            className="button button-primary"
            type="submit"
            disabled={!canSubmit || submitPending}
          >
            {submitPending ? "제출 중…" : "채용 요청 제출"}
          </button>
          <span className="form-help">승인자와 승인된 평가 기준이 있어야 제출할 수 있습니다.</span>
          {submitState.status === "error" ? (
            <p className="form-alert form-alert-error" role="alert">
              {visibleCopy(submitState.message)}
            </p>
          ) : null}
          {submitState.status === "success" ? (
            <p className="form-alert form-alert-success" role="status">
              {visibleCopy(submitState.message)}
            </p>
          ) : null}
        </form>
      ) : null}
      {job.requisition_status === "PENDING_APPROVAL" && !isDesignatedApprover ? (
        <p className="info-banner" role="status">
          지정 승인자의 검토를 기다리고 있습니다. 대기 중에는 승인자를 바꾸거나 다시 제출할 수
          없습니다.
        </p>
      ) : null}
      {isDesignatedApprover && job.requisition_status === "PENDING_APPROVAL" ? (
        <form
          action={resolveAction}
          className="scorecard-workflow-form"
          aria-describedby={`approval-help-${job.id}`}
        >
          <input type="hidden" name="jobId" value={job.id} />
          <fieldset disabled={resolutionPending}>
            <legend>채용 요청 처리</legend>
            <p id={`approval-help-${job.id}`} className="form-help">
              승인 또는 반려를 선택하고, 판단 근거를 남겨주세요. 이는 채용 결정이 아닙니다.
            </p>
            <div className="form-actions">
              <label>
                <input type="radio" name="status" value="APPROVED" required /> 승인
              </label>
              <label>
                <input type="radio" name="status" value="RETURNED" required /> 반려
              </label>
            </div>
            <label htmlFor={`requisition-reason-${job.id}`}>
              승인 또는 반려 사유
              <textarea
                id={`requisition-reason-${job.id}`}
                name="reason"
                required
                maxLength={1000}
                aria-describedby={`approval-help-${job.id}`}
              />
            </label>
          </fieldset>
          <button className="button button-primary" type="submit" disabled={resolutionPending}>
            {resolutionPending ? "저장 중…" : "처리 저장"}
          </button>
          {resolutionState.status === "error" ? (
            <p className="form-alert form-alert-error" role="alert">
              {visibleCopy(resolutionState.message)}
            </p>
          ) : null}
          {resolutionState.status === "success" ? (
            <p className="form-alert form-alert-success" role="status">
              {visibleCopy(resolutionState.message)}
            </p>
          ) : null}
        </form>
      ) : null}
      {viewerRole === "REQUISITION_APPROVER" && !isDesignatedApprover ? (
        <p className="form-alert form-alert-error" role="alert">
          이 채용 요청의 지정 승인자가 아니므로 처리할 수 없습니다.
        </p>
      ) : null}
      {job.requisition_status === "APPROVED" ? (
        <p className="info-banner" role="status">
          채용 요청이 승인되었습니다. 평가 기준 승인과는 별개의 업무 승인입니다.
        </p>
      ) : null}
      <section aria-labelledby={`requisition-history-title-${job.id}`}>
        <div className="section-heading">
          <h3 id={`requisition-history-title-${job.id}`}>채용 요청 상태 이력</h3>
        </div>
        {chronologicalHistory.length === 0 ? (
          <p className="section-copy">아직 기록된 상태 변경이 없습니다.</p>
        ) : (
          <ol className="history-list" aria-label="시간 순 채용 요청 상태 이력">
            {chronologicalHistory.map((event) => (
              <li key={event.id} className="history-item">
                <strong>
                  {labels[event.prior_status]} → {labels[event.new_status]}
                </strong>
                <span>
                  처리자: {event.actor_id} · 역할: {event.actor_role} · 날짜:{" "}
                  {formatDate(event.created_at)}
                </span>
                <span>사유: {event.reason ?? "사유 없음"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(value));
}

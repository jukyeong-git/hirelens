"use client";

import { useActionState } from "react";

import type { ScorecardVersionRecord } from "@hirelens/domain";

import { initialScorecardActionState } from "../action-state";
import { approveScorecardAction, createScorecardRevisionAction } from "../actions";
import { visibleCopy } from "../../_components/visible-copy";

interface ScorecardApprovalFormProps {
  jobId: string;
  version: ScorecardVersionRecord;
  unresolvedCount: number;
}

export function ScorecardApprovalForm({
  jobId,
  version,
  unresolvedCount,
}: ScorecardApprovalFormProps) {
  const [state, formAction, pending] = useActionState(
    approveScorecardAction,
    initialScorecardActionState,
  );
  const blocked = unresolvedCount > 0;

  return (
    <form action={formAction} className="scorecard-workflow-form">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scorecardVersionId" value={version.id} />
      <input type="hidden" name="expectedVersionNumber" value={version.version_number} />
      <input type="hidden" name="expectedStatus" value="DRAFT" />
      <input type="hidden" name="expectedContentRevision" value={version.content_revision} />
      <label>
        검토 기준 승인 사유 <span aria-hidden="true">*</span>
        <textarea
          name="reason"
          required
          minLength={1}
          maxLength={1000}
          placeholder="검토한 기준과 승인 근거를 기록하세요."
          disabled={blocked || pending}
        />
      </label>
      {blocked ? (
        <p className="form-alert form-alert-warning" role="status">
          검토 필요 기준 {unresolvedCount}개를 먼저 해소해야 승인할 수 있습니다.
        </p>
      ) : null}
      <button className="button button-primary" type="submit" disabled={blocked || pending}>
        {pending ? "승인 저장 중…" : `v${version.version_number} 검토 기준 승인`}
      </button>
      {state.status !== "idle" ? (
        <p
          className={`form-alert ${state.status === "success" ? "form-alert-success" : "form-alert-error"}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {visibleCopy(state.message)}
        </p>
      ) : null}
    </form>
  );
}

interface ScorecardRevisionFormProps {
  jobId: string;
  version: ScorecardVersionRecord;
}

export function ScorecardRevisionForm({ jobId, version }: ScorecardRevisionFormProps) {
  const [state, formAction, pending] = useActionState(
    createScorecardRevisionAction,
    initialScorecardActionState,
  );

  return (
    <form action={formAction} className="scorecard-workflow-form">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="sourceScorecardVersionId" value={version.id} />
      <input type="hidden" name="expectedVersionNumber" value={version.version_number} />
      <input type="hidden" name="expectedStatus" value="APPROVED" />
      <label>
        새 검토 기준 버전 생성 사유 <span aria-hidden="true">*</span>
        <textarea
          name="reason"
          required
          minLength={1}
          maxLength={1000}
          placeholder="승인된 검토 기준을 다시 검토해야 하는 이유를 기록하세요."
          disabled={pending}
        />
      </label>
      <button className="button button-quiet" type="submit" disabled={pending}>
        {pending ? "새 버전 생성 중…" : `v${version.version_number + 1} 검토 기준 초안 만들기`}
      </button>
      {state.status !== "idle" ? (
        <p
          className={`form-alert ${state.status === "success" ? "form-alert-success" : "form-alert-error"}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {visibleCopy(state.message)}
        </p>
      ) : null}
    </form>
  );
}

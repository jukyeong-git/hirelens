"use client";

import { useActionState } from "react";

import type { ScorecardVersionRecord } from "@hirelens/domain";

import { initialScorecardActionState } from "../action-state";
import { approveScorecardAction } from "../actions";
import { visibleCopy } from "../../_components/visible-copy";

interface ScorecardApprovalFormProps {
  jobId: string;
  version: ScorecardVersionRecord;
  unresolvedCount: number;
  compact?: boolean;
}

export function ScorecardApprovalForm({
  jobId,
  version,
  unresolvedCount,
  compact = false,
}: ScorecardApprovalFormProps) {
  const [state, formAction, pending] = useActionState(
    approveScorecardAction,
    initialScorecardActionState,
  );
  const blocked = unresolvedCount > 0;

  return (
    <form
      action={formAction}
      className={compact ? "header-approval-form" : "scorecard-workflow-form"}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="scorecardVersionId" value={version.id} />
      <input type="hidden" name="expectedVersionNumber" value={version.version_number} />
      <input type="hidden" name="expectedStatus" value="DRAFT" />
      <input type="hidden" name="expectedContentRevision" value={version.content_revision} />
      {blocked && !compact ? (
        <p className="form-alert form-alert-warning" role="status">
          확인 사항 {unresolvedCount}개를 모두 확인해야 채용 요청을 진행할 수 있습니다.
        </p>
      ) : null}
      <button
        className="button button-primary button-compact"
        type="submit"
        disabled={blocked || pending}
        title={blocked ? `확인 사항 ${unresolvedCount}개를 먼저 확인하세요.` : undefined}
      >
        {pending ? "요청 중…" : "채용 요청"}
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

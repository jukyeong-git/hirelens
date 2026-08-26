"use client";

import { useActionState } from "react";

import type { JobRecord, ScorecardWorkspace } from "@hirelens/domain";

import { initialJobActionState } from "../action-state";
import { discardJobDraftAction } from "../actions";
import { ScorecardApprovalForm } from "./scorecard-approval-form";
import { visibleCopy } from "../../_components/visible-copy";

export function JobHeaderActions({
  job,
  canManage,
  workspace,
}: {
  job: JobRecord;
  canManage: boolean;
  workspace: ScorecardWorkspace | null;
}) {
  const [deleteState, deleteAction, deleting] = useActionState(
    discardJobDraftAction,
    initialJobActionState,
  );
  const version = workspace?.latestWorkingVersion;
  const canDiscard =
    canManage &&
    job.requisition_status === "DRAFT" &&
    (job.status === "DRAFT" || job.status === "SCORECARD_PENDING_APPROVAL");

  return (
    <div className="requisition-header-actions" aria-label="채용 요청 작업">
      {deleteState.status === "error" ? (
        <p className="header-action-error" role="alert">
          {visibleCopy(deleteState.message)}
        </p>
      ) : null}
      <div className="requisition-header-action-buttons">
        {canDiscard ? (
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  "이 채용 요청을 삭제하시겠습니까? 삭제한 요청은 목록에서 사라집니다.",
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="expectedUpdatedAt" value={job.updated_at} />
            <button
              className="button button-danger button-compact"
              type="submit"
              disabled={deleting}
            >
              {deleting ? "삭제 중…" : "삭제"}
            </button>
          </form>
        ) : null}
        {canManage && version?.version.status === "DRAFT" ? (
          <ScorecardApprovalForm
            jobId={job.id}
            version={version.version}
            unresolvedCount={countUnconfirmedIssues(version)}
            compact
          />
        ) : null}
      </div>
    </div>
  );
}

function countUnconfirmedIssues(
  scorecard: NonNullable<ScorecardWorkspace["latestWorkingVersion"]>,
) {
  return (
    scorecard.version.ambiguous_phrases.filter(
      (phrase, index) =>
        phrase.ambiguity_status !== "CLEAR" &&
        !scorecard.version.confirmed_job_description_issue_keys.includes(String(index)),
    ).length +
    scorecard.criteria.filter(
      (criterion) =>
        criterion.ambiguity_status !== "CLEAR" &&
        !scorecard.version.confirmed_evaluation_criterion_ids.includes(criterion.id),
    ).length
  );
}

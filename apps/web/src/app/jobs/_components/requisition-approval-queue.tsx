import type { JobSummary, RequisitionStatusHistoryRecord } from "@hirelens/domain";
import Link from "next/link";

import { RequisitionWorkflow } from "./requisition-workflow";

interface RequisitionApprovalQueueProps {
  jobs: JobSummary[];
  viewerId: string;
  historiesByJobId: Map<string, RequisitionStatusHistoryRecord[]>;
  unavailableHistoryJobIds: Set<string>;
}

export function RequisitionApprovalQueue({
  jobs,
  viewerId,
  historiesByJobId,
  unavailableHistoryJobIds,
}: RequisitionApprovalQueueProps) {
  const pendingJobs = jobs.filter((job) => job.requisition_status === "PENDING_APPROVAL");

  return (
    <section aria-labelledby="requisition-approval-queue-title">
      <div className="section-heading section-heading-inline">
        <div>
          <p className="eyebrow">Requisition approver workspace</p>
          <h2 id="requisition-approval-queue-title">대기 중인 Requisition</h2>
          <p className="section-copy">
            지정된 Requisition만 처리합니다. 이 화면에는 지원서, 검토 기준, 후보자 근거가 표시되지
            않습니다.
          </p>
        </div>
        <span className="count-label">{pendingJobs.length}건 대기</span>
      </div>

      {pendingJobs.length === 0 ? (
        <section className="empty-state" aria-labelledby="empty-requisition-queue-title">
          <p className="eyebrow">No pending approvals</p>
          <h3 id="empty-requisition-queue-title">처리할 Requisition이 없습니다.</h3>
          <p>새로 제출되어 회원님에게 지정된 Requisition이 이곳에 표시됩니다.</p>
        </section>
      ) : (
        pendingJobs.map((job) => (
          <div key={job.id}>
            {unavailableHistoryJobIds.has(job.id) ? (
              <p className="form-alert form-alert-warning" role="status">
                상태 이력을 불러오지 못했습니다. 잠시 후 새로 고쳐 다시 시도하세요. 현재 처리 권한은
                서버에서 다시 확인됩니다.
              </p>
            ) : null}
            <RequisitionWorkflow
              job={job}
              viewerId={viewerId}
              viewerRole="REQUISITION_APPROVER"
              approvers={[]}
              history={historiesByJobId.get(job.id) ?? []}
            />
            <Link className="back-link" href={`/jobs/${job.id}`}>
              Requisition 원문 및 상세 보기 →
            </Link>
          </div>
        ))
      )}
    </section>
  );
}

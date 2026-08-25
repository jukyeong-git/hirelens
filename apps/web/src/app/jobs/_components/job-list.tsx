import Link from "next/link";

import type { JobListItem } from "@hirelens/domain";

import { visibleCopy } from "../../_components/visible-copy";

const statusLabels: Record<JobListItem["status"], string> = {
  DRAFT: "초안",
  SCORECARD_PENDING_APPROVAL: "검토 기준 승인 대기",
  READY_FOR_INTAKE: "접수 준비",
  ARCHIVED: "보관됨",
};

interface JobListProps {
  jobs: JobListItem[];
}

export function JobList({ jobs }: JobListProps) {
  if (jobs.length === 0) {
    return (
      <section className="empty-state" aria-labelledby="empty-jobs-title">
        <p className="eyebrow">No openings yet</p>
        <h2 id="empty-jobs-title">아직 Job이 없습니다.</h2>
        <p>첫 Job 초안을 저장하면 이곳에서 담당자와 상태를 확인할 수 있습니다.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="job-list-title">
      <div className="section-heading section-heading-inline">
        <div>
          <p className="eyebrow">Openings</p>
          <h2 id="job-list-title">Job 목록</h2>
        </div>
        <span className="count-label">{jobs.length}개</span>
      </div>

      <div className="table-wrap">
        <table className="job-table">
          <caption className="sr-only">접근 가능한 Job 목록</caption>
          <thead>
            <tr>
              <th scope="col">직무</th>
              <th scope="col">부서</th>
              <th scope="col">상태</th>
              <th scope="col">Recruiter</th>
              <th scope="col">Hiring Manager</th>
              <th scope="col">최근 변경</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <th scope="row">
                  <Link className="job-title job-title-link" href={`/jobs/${job.id}`}>
                    {visibleCopy(job.title)}
                  </Link>
                </th>
                <td>{visibleCopy(job.department)}</td>
                <td>
                  <span className={`status-chip status-${job.status.toLowerCase()}`}>
                    {statusLabels[job.status]}
                  </span>
                </td>
                <td>{visibleCopy(job.recruiter_name ?? "담당자 정보 없음")}</td>
                <td>{visibleCopy(job.hiring_manager_name ?? "담당자 정보 없음")}</td>
                <td>{formatUpdatedAt(job.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "시간 정보 없음";
  }

  return new Intl.DateTimeFormat("ko-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

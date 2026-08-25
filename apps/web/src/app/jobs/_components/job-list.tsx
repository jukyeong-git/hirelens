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
  title?: string;
  emptyTitle?: string;
}

export function JobList({
  jobs,
  title = "채용 요청 목록",
  emptyTitle = "아직 채용 요청이 없습니다.",
}: JobListProps) {
  if (jobs.length === 0) {
    return (
      <section className="empty-state" aria-labelledby="empty-jobs-title">
        <h2 id="empty-jobs-title">{emptyTitle}</h2>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="job-list-title">
      <div className="section-heading section-heading-inline">
        <div>
          <h2 id="job-list-title">{title}</h2>
        </div>
        <span className="count-label">{jobs.length}개</span>
      </div>

      <div className="table-wrap">
        <table className="job-table">
          <caption className="sr-only">접근 가능한 채용 요청 목록</caption>
          <thead>
            <tr>
              <th scope="col">직무</th>
              <th scope="col">부서</th>
              <th scope="col">상태</th>
              <th scope="col">채용 담당자</th>
              <th scope="col">채용 책임자</th>
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

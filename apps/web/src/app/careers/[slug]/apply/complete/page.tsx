import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicJobPosting } from "@hirelens/database";

import { getPublicSupabaseClient } from "../../../../../lib/supabase-server";
import { visibleCopy } from "../../../../_components/visible-copy";

export const dynamic = "force-dynamic";

export default async function ResumeApplicationCompletePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const posting = await getPublicJobPosting(getPublicSupabaseClient(), slug);

  if (!posting) notFound();

  return (
    <main
      className="public-careers-shell public-application-shell public-application-complete-shell"
      id="main-content"
    >
      <header className="public-careers-header requisition-header">
        <Link className="public-careers-brand" href="/careers">
          ← 채용 공고
        </Link>
        <p className="public-careers-label">지원 완료</p>
      </header>

      <section className="public-application-complete" aria-labelledby="application-complete-title">
        <div className="public-application-complete-icon" aria-hidden="true">
          ✓
        </div>
        <h1 id="application-complete-title">지원이 완료되었습니다</h1>
        <p className="public-application-complete-copy">
          <strong>{visibleCopy(posting.title)}</strong> 지원서가 정상적으로 접수되었습니다.
        </p>

        <div className="public-application-status-card" aria-label="지원서 상태">
          <div>
            <span>현재 상태</span>
            <strong>서류 검토 처리 중</strong>
          </div>
        </div>

        <div className="public-application-complete-actions">
          <Link className="button button-primary" href="/careers">
            채용공고 목록으로 돌아가기
          </Link>
          <Link className="button button-quiet" href={`/careers/${posting.public_slug}`}>
            공고 상세로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  );
}

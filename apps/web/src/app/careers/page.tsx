import Link from "next/link";

import { listPublicJobPostings } from "@hirelens/database";

import { getPublicSupabaseClient } from "../../lib/supabase-server";
import { visibleCopy } from "../_components/visible-copy";

export const dynamic = "force-dynamic";

export default async function PublicCareersPage() {
  const postings = await listPublicJobPostings(getPublicSupabaseClient());

  return (
    <main className="public-careers-shell" id="main-content">
      <header className="public-careers-header requisition-header">
        <div>
          <p className="eyebrow">Careers</p>
          <h1>채용 공고</h1>
          <p className="public-careers-lede">현재 공개된 포지션</p>
        </div>
        <div className="header-actions">
          <span className="count-label">{postings.length}개 공고</span>
        </div>
      </header>

      <section className="public-careers-list" aria-labelledby="public-careers-list-title">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Open positions</p>
            <h2 id="public-careers-list-title">포지션 목록</h2>
          </div>
          <span className="count-label">{postings.length}개</span>
        </div>

        {postings.length === 0 ? (
          <p className="empty-state">현재 공개된 포지션이 없습니다.</p>
        ) : (
          <div className="public-careers-grid">
            {postings.map((posting) => (
              <Link
                className="public-career-card"
                href={`/careers/${posting.public_slug}`}
                key={posting.public_slug}
              >
                <span className="eyebrow">{visibleCopy(posting.employment_type)}</span>
                <h3>{visibleCopy(posting.title)}</h3>
                <p className="public-career-meta">{visibleCopy(posting.location)}</p>
                <p>{visibleCopy(posting.summary)}</p>
                <span className="public-career-link">공고 상세 →</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

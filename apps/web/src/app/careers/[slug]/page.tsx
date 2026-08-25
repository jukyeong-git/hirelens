import { notFound } from "next/navigation";
import Link from "next/link";

import { getPublicJobPosting, listPublicJobPostings } from "@hirelens/database";

import { getPublicSupabaseClient } from "../../../lib/supabase-server";
import { visibleCopy } from "../../_components/visible-copy";
import { PublicApplicationForm } from "./public-application-form";

export const dynamic = "force-dynamic";

export default async function PublicCareerPostingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = getPublicSupabaseClient();
  const [posting, postings] = await Promise.all([
    getPublicJobPosting(client, slug),
    listPublicJobPostings(client),
  ]);

  if (!posting) {
    notFound();
  }

  return (
    <main className="public-careers-shell" id="main-content">
      <header className="public-careers-header requisition-header">
        <Link className="public-careers-brand" href="/careers">
          ← 채용 공고
        </Link>
        <p className="public-careers-label">공개 포지션</p>
      </header>

      <div className="public-careers-workspace">
        <aside className="public-careers-sidebar" aria-label="채용 중인 포지션">
          <div className="public-careers-sidebar-heading">
            <h2>채용 중인 포지션</h2>
            <span className="count-label">{postings.length}개</span>
          </div>
          <nav aria-label="공개 포지션">
            {postings.map((item) => {
              const selected = item.public_slug === posting.public_slug;
              return (
                <Link
                  className={`public-career-sidebar-link${selected ? " is-selected" : ""}`}
                  href={`/careers/${item.public_slug}`}
                  aria-current={selected ? "page" : undefined}
                  key={item.public_slug}
                >
                  <strong>{visibleCopy(item.title)}</strong>
                  <span>{visibleCopy(item.location)}</span>
                  <small>{visibleCopy(item.employment_type)}</small>
                </Link>
              );
            })}
          </nav>
        </aside>

        <article className="public-careers-card public-careers-detail">
          <header className="public-careers-title-block">
            <h1>{visibleCopy(posting.title)}</h1>
            <p className="public-careers-meta">
              {visibleCopy(posting.location)} · {visibleCopy(posting.employment_type)}
            </p>
          </header>

          <div className="public-careers-actions">
            <span className="status-chip status-published">게시 중</span>
            <PublicApplicationForm slug={posting.public_slug} />
          </div>

          <section aria-labelledby="public-summary-title">
            <h2 id="public-summary-title">포지션 소개</h2>
            <p>{visibleCopy(posting.summary)}</p>
          </section>

          <section aria-labelledby="public-responsibilities-title">
            <h2 id="public-responsibilities-title">주요 업무</h2>
            <p className="preserve-lines">{visibleCopy(posting.responsibilities)}</p>
          </section>

          <section aria-labelledby="public-requirements-title">
            <h2 id="public-requirements-title">필수 자격</h2>
            <p className="preserve-lines">{visibleCopy(posting.requirements)}</p>
          </section>
        </article>
      </div>
    </main>
  );
}

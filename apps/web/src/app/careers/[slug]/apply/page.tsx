import { notFound } from "next/navigation";
import Link from "next/link";

import { getPublicJobPosting } from "@hirelens/database";

import { getPublicSupabaseClient } from "../../../../lib/supabase-server";
import { visibleCopy } from "../../../_components/visible-copy";
import { ResumeApplicationForm } from "./resume-application-form";

export const dynamic = "force-dynamic";

export default async function ResumeApplicationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const posting = await getPublicJobPosting(getPublicSupabaseClient(), slug);

  if (!posting) notFound();

  return (
    <main className="public-careers-shell public-application-shell" id="main-content">
      <header className="public-careers-header requisition-header">
        <Link className="public-careers-brand" href={`/careers/${posting.public_slug}`}>
          ← 공고 상세
        </Link>
        <p className="public-careers-label">지원서 작성</p>
      </header>

      <section
        className="public-application-page public-application-workday"
        aria-labelledby="resume-application-title"
      >
        <div className="public-application-page-header">
          <h1 id="resume-application-title">이력서로 지원</h1>
        </div>

        <p className="public-application-required">필수 항목입니다.</p>

        <p className="public-application-introduction">PDF · 최대 5 MiB</p>

        <div className="public-application-job-context">
          지원 포지션: <strong>{visibleCopy(posting.title)}</strong>
        </div>

        <ResumeApplicationForm slug={posting.public_slug} />
      </section>
    </main>
  );
}

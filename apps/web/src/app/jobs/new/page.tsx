import { listProfiles } from "@hirelens/database";
import Link from "next/link";
import { redirect } from "next/navigation";

import { visibleCopy } from "../../_components/visible-copy";
import { JobCreateForm } from "../_components/job-create-form";
import { LoginForm } from "../_components/login-form";
import { getAuthenticatedViewer } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const authenticated = await getAuthenticatedViewer();

  if (!authenticated) {
    return (
      <main className="auth-shell" id="main-content">
        <section className="auth-card" aria-labelledby="login-title">
          <LoginForm />
        </section>
      </main>
    );
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "HIRING_MANAGER") redirect("/jobs");

  const profiles = await listProfiles(client);
  const safeProfiles = profiles.map((profile) => ({
    ...profile,
    display_name: visibleCopy(profile.display_name),
  }));

  return (
    <main className="app-shell" id="main-content">
      <Link className="back-link" href="/jobs">
        ← {visibleCopy(viewer.displayName)} 홈
      </Link>
      <header className="app-header requisition-header" aria-labelledby="new-job-title">
        <h1 id="new-job-title">채용 생성</h1>
        <span className="status-chip status-draft">초안</span>
      </header>
      <JobCreateForm
        viewerId={viewer.id}
        viewerName={visibleCopy(viewer.displayName)}
        profiles={safeProfiles}
      />
    </main>
  );
}

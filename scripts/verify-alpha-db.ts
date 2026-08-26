import { spawnSync } from "node:child_process";

import { parseEnvironment } from "@hirelens/domain";

const environment = parseEnvironment();
const testFiles = [
  "supabase/tests/database/alpha_024_025.sql",
  "supabase/tests/database/009_review_framework_draft_validation.sql",
  "supabase/tests/database/alpha_027_job_postings.sql",
  "supabase/tests/database/alpha_028_public_job_postings.sql",
  "supabase/tests/database/alpha_029_public_candidate_submission.sql",
  "supabase/tests/database/007_resume_processing_queue.sql",
  "supabase/tests/database/010_evidence_backend_slice.sql",
  "supabase/tests/database/014_edge_evidence_queue_consumer.sql",
  "supabase/tests/database/011_human_interview_gate.sql",
  "supabase/tests/database/012_preprocessed_demo_fallback.sql",
  "supabase/tests/database/013_real_resume_intake_policy.sql",
  "supabase/tests/database/015_hiring_manager_recruiter_profile_access.sql",
  "supabase/tests/database/016_job_hiring_need.sql",
  "supabase/tests/database/017_review_framework_draft_update.sql",
  "supabase/tests/database/018_single_review_framework.sql",
  "supabase/tests/database/019_scorecard_issue_confirmation_gate.sql",
  "supabase/tests/database/020_job_basic_info_update.sql",
  "supabase/tests/database/021_discard_job_draft.sql",
];

if (environment.SUPABASE_ENV !== "hosted-alpha" || !environment.DATABASE_URL) {
  console.error(
    "Alpha DB verification requires SUPABASE_ENV=hosted-alpha and DATABASE_URL from .env.local.",
  );
  process.exit(1);
}

let failed = false;
for (const testFile of testFiles) {
  const result = spawnSync(
    "psql",
    [
      environment.DATABASE_URL,
      "--no-psqlrc",
      "--quiet",
      "--set",
      "ON_ERROR_STOP=1",
      "--file",
      testFile,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGCONNECT_TIMEOUT: "10" },
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const failures = output.match(/^\s*not ok\b/gm)?.length ?? 0;
  if (result.status !== 0 || failures > 0) failed = true;
  console.log(`${testFile}: ${result.status === 0 && failures === 0 ? "PASS" : "FAIL"}`);
  if (failures > 0) console.log(`  pgTAP failures: ${failures}`);
  if (result.status !== 0 && result.stderr) console.log(`  psql: ${result.stderr.trim()}`);
}

if (failed) {
  process.exit(1);
}

console.log(
  "Alpha DB verification passed. All fixtures ran inside transactions and were rolled back.",
);

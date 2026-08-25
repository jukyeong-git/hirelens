import { spawnSync } from "node:child_process";

import { parseEnvironment } from "@hirelens/domain";

const action = process.argv[2];
const environment = parseEnvironment();

function runSupabase(args: string[]): number {
  const result = spawnSync("supabase", args, { stdio: "inherit" });

  if (result.error) {
    console.error("Supabase CLI is required for this command.");
    return 1;
  }

  return result.status ?? 1;
}

if (action === "start") {
  console.log(
    `SUPABASE_ENV=${environment.SUPABASE_ENV} uses hosted Alpha Supabase; local Docker Supabase is disabled.`,
  );
  process.exit(0);
}

if (action === "reset") {
  console.error(
    "Database reset is disabled. Alpha verification is rollback-only and never resets shared data.",
  );
  process.exitCode = 1;
}

if (action === "link" || action === "push") {
  if (!environment.SUPABASE_PROJECT_REF) {
    console.error("SUPABASE_PROJECT_REF is required to link a hosted Supabase project.");
    process.exitCode = 1;
  } else if (!["hosted-dev", "hosted-alpha"].includes(environment.SUPABASE_ENV)) {
    console.error("Hosted Supabase commands require SUPABASE_ENV=hosted-dev or hosted-alpha.");
    process.exitCode = 1;
  } else if (action === "push" && process.env.SUPABASE_CONFIRM_MIGRATION !== "YES") {
    console.error(
      "Refusing remote migration push. Set SUPABASE_CONFIRM_MIGRATION=YES after verifying the project ref.",
    );
    process.exitCode = 1;
  } else if (action === "link") {
    process.exit(runSupabase(["link", "--project-ref", environment.SUPABASE_PROJECT_REF]));
  } else {
    const linkStatus = runSupabase(["link", "--project-ref", environment.SUPABASE_PROJECT_REF]);
    if (linkStatus !== 0) {
      process.exit(linkStatus);
    }
    process.exit(runSupabase(["db", "push"]));
  }
} else if (action !== "start" && action !== "reset") {
  console.error(`Unknown database action: ${action ?? "(missing)"}`);
  process.exitCode = 1;
}

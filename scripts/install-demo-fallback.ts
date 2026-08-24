import { createSupabaseRestClient } from "@hirelens/database";
import { parseEnvironment } from "@hirelens/domain";

if (process.env.SUPABASE_CONFIRM_DEMO_SEED !== "YES") {
  throw new Error("Set SUPABASE_CONFIRM_DEMO_SEED=YES to install the synthetic fallback.");
}

async function main() {
  const environment = parseEnvironment();
  if (
    environment.SUPABASE_ENV !== "hosted-alpha" ||
    !environment.SUPABASE_PROJECT_REF ||
    !environment.NEXT_PUBLIC_SUPABASE_URL ||
    !environment.SUPABASE_SECRET_KEY
  ) {
    throw new Error("Hosted Alpha project ref, URL, and secret key are required.");
  }
  const projectHostname = new URL(environment.NEXT_PUBLIC_SUPABASE_URL).hostname;
  if (projectHostname.split(".")[0] !== environment.SUPABASE_PROJECT_REF) {
    throw new Error("Supabase URL does not match SUPABASE_PROJECT_REF.");
  }

  const client = createSupabaseRestClient({
    url: environment.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: environment.SUPABASE_SECRET_KEY,
  });
  await client.request("/rest/v1/rpc/install_preprocessed_demo_evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  console.log("Synthetic preprocessed demo evidence is installed.");
}

void main();

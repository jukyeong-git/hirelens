import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import pg from "pg";

import { parseEnvironment } from "@hirelens/domain";

const action = process.argv[2];
const environment = parseEnvironment();

function assertAlphaProjectIdentity(): { projectRef: string; projectUrl: string } {
  if (environment.APP_ENV !== "alpha" || environment.SUPABASE_ENV !== "hosted-alpha") {
    throw new Error("Edge consumer changes are restricted to APP_ENV=alpha on hosted Alpha");
  }
  const projectRef = required("SUPABASE_PROJECT_REF");
  const publicUrl = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  const expectedHost = `${projectRef}.supabase.co`;
  if (publicUrl.protocol !== "https:" || publicUrl.hostname !== expectedHost) {
    throw new Error("Supabase URL does not match SUPABASE_PROJECT_REF");
  }
  const databaseUrl = new URL(required("DATABASE_URL"));
  const databaseUser = decodeURIComponent(databaseUrl.username);
  const directDatabaseMatch = databaseUrl.hostname === `db.${expectedHost}`;
  const poolerDatabaseMatch =
    databaseUrl.hostname.endsWith(".pooler.supabase.com") &&
    databaseUser === `postgres.${projectRef}`;
  if (!directDatabaseMatch && !poolerDatabaseMatch) {
    throw new Error("DATABASE_URL does not match SUPABASE_PROJECT_REF");
  }
  return { projectRef, projectUrl: `https://${expectedHost}` };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function runSupabase(args: string[]): void {
  const result = spawnSync("supabase", args, { stdio: "inherit" });
  if (result.error) throw new Error("Supabase CLI is required");
  if (result.status !== 0) throw new Error(`Supabase CLI failed with status ${result.status}`);
}

async function deploy(): Promise<void> {
  const { projectRef } = assertAlphaProjectIdentity();
  runSupabase([
    "functions",
    "deploy",
    "process-evidence-queue",
    "--project-ref",
    projectRef,
    "--use-api",
  ]);
}

async function upsertVaultSecret(
  client: pg.Client,
  name: string,
  secret: string,
  description: string,
): Promise<void> {
  const existing = await client.query<{ id: string }>(
    "select id::text from vault.decrypted_secrets where name = $1 order by created_at desc limit 1",
    [name],
  );
  if (existing.rows[0]) {
    await client.query("select vault.update_secret($1::uuid, $2, $3, $4)", [
      existing.rows[0].id,
      secret,
      name,
      description,
    ]);
  } else {
    await client.query("select vault.create_secret($1, $2, $3)", [secret, name, description]);
  }
}

async function activate(): Promise<void> {
  const { projectRef, projectUrl } = assertAlphaProjectIdentity();
  if (process.env.EDGE_CONSUMER_CONFIRM_ACTIVATION !== "YES") {
    throw new Error("Set EDGE_CONSUMER_CONFIRM_ACTIVATION=YES to enable the Alpha cron consumer");
  }
  if (process.env.EDGE_CONSUMER_NODE_WORKER_STOPPED !== "YES") {
    throw new Error("Stop the Node queue worker and set EDGE_CONSUMER_NODE_WORKER_STOPPED=YES");
  }

  const invocationSecret = required("EVIDENCE_CONSUMER_CRON_SECRET");
  if (invocationSecret.length < 32) {
    throw new Error("EVIDENCE_CONSUMER_CRON_SECRET must contain at least 32 characters");
  }
  const functionSecrets: Record<string, string> = {
    EVIDENCE_CONSUMER_CRON_SECRET: invocationSecret,
    EVIDENCE_QUEUE_VISIBILITY_SECONDS: String(environment.EVIDENCE_QUEUE_VISIBILITY_SECONDS),
    OPENAI_API_KEY: required("OPENAI_API_KEY"),
    OPENAI_MODEL: required("OPENAI_MODEL"),
    AI_PIPELINE_VERSION: environment.AI_PIPELINE_VERSION,
    AI_EVIDENCE_PROMPT_VERSION: environment.AI_EVIDENCE_PROMPT_VERSION,
    AI_SCHEMA_VERSION: environment.AI_SCHEMA_VERSION,
    AI_MAX_INPUT_TOKENS: String(environment.AI_MAX_INPUT_TOKENS),
    AI_MAX_OUTPUT_TOKENS: String(environment.AI_MAX_OUTPUT_TOKENS),
    AI_MAX_TOTAL_TOKENS_PER_RUN: String(environment.AI_MAX_TOTAL_TOKENS_PER_RUN),
    AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS: String(
      environment.AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    ),
    AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS: String(
      environment.AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    ),
    AI_MAX_COST_MICROUSD_PER_RUN: String(environment.AI_MAX_COST_MICROUSD_PER_RUN),
  };

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "hirelens-edge-consumer-"));
  const secretFile = path.join(temporaryDirectory, "secrets.env");
  try {
    await writeFile(
      secretFile,
      `${Object.entries(functionSecrets)
        .map(([name, value]) => `${name}=${value.replaceAll("\n", "")}`)
        .join("\n")}\n`,
      { mode: 0o600 },
    );
    runSupabase(["secrets", "set", "--project-ref", projectRef, "--env-file", secretFile]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const database = new pg.Client({ connectionString: environment.DATABASE_URL });
  await database.connect();
  try {
    const migration = await database.query<{ installed: boolean }>(
      "select to_regprocedure('public.dequeue_evidence_queue_message(integer,text)') is not null as installed",
    );
    if (!migration.rows[0]?.installed) {
      throw new Error("Apply the Edge consumer migration before activation");
    }
    await database.query("begin");
    await upsertVaultSecret(
      database,
      "hirelens_project_url",
      projectUrl,
      "HireLens Alpha Edge Function base URL",
    );
    await upsertVaultSecret(
      database,
      "hirelens_edge_invocation_secret",
      invocationSecret,
      "HireLens evidence consumer cron authentication",
    );
    const mode = await database.query(
      "update public.evidence_consumer_control set consumer_mode = 'EDGE', updated_at = now() where singleton returning consumer_mode",
    );
    if (mode.rowCount !== 1) throw new Error("Evidence consumer control row is missing");
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  } finally {
    await database.end();
  }
  console.log("Alpha Edge evidence consumer secrets and cron activation are configured.");
}

async function main(): Promise<void> {
  if (action === "deploy") await deploy();
  else if (action === "activate") await activate();
  else throw new Error("Usage: tsx scripts/edge-consumer.ts <deploy|activate>");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Edge consumer command failed");
  process.exitCode = 1;
});

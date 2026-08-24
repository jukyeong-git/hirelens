import pg from "pg";

import { createEvidenceAdapter } from "@hirelens/ai/server";

import { createSupabaseRestClient } from "@hirelens/database";
import { DOMAIN_PACKAGE_NAME, parseEnvironment } from "@hirelens/domain";
import { createEvidenceRunProcessor } from "./evidence-processor";

interface QueueMessage {
  msg_id: number;
  message: { processing_run_id?: string };
}

function isOpaqueUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  );
}

async function downloadResume(url: string, secret: string, path: string): Promise<Uint8Array> {
  const response = await fetch(`${url.replace(/\/+$/, "")}/storage/v1/object/resumes/${path}`, {
    headers: { apikey: secret },
  });
  if (!response.ok) {
    throw Object.assign(new Error("Resume storage download failed"), {
      category: response.status >= 500 ? "STORAGE_UNAVAILABLE" : "STORAGE_DOWNLOAD_FAILED",
      retryable: response.status >= 500,
    });
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function getWorkerHealth() {
  return {
    service: "worker",
    status: "ok" as const,
    package: DOMAIN_PACKAGE_NAME,
  };
}

export function startWorker() {
  const environment = parseEnvironment();
  const health = getWorkerHealth();

  if (
    !environment.DATABASE_URL ||
    !environment.SUPABASE_SECRET_KEY ||
    !environment.NEXT_PUBLIC_SUPABASE_URL ||
    !environment.OPENAI_API_KEY ||
    !environment.OPENAI_MODEL
  ) {
    throw new Error("Worker requires database, Supabase server, and OpenAI credentials");
  }
  if (environment.WORKER_MAX_ATTEMPTS !== 2) {
    throw new Error("WORKER_MAX_ATTEMPTS must be 2 for the Phase 3 processing contract");
  }

  const database = new pg.Client({ connectionString: environment.DATABASE_URL });
  const serviceClient = createSupabaseRestClient({
    url: environment.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: environment.SUPABASE_SECRET_KEY,
  });
  const evidenceAdapter = createEvidenceAdapter({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
    maxInputTokens: environment.AI_MAX_INPUT_TOKENS,
    maxOutputTokens: environment.AI_MAX_OUTPUT_TOKENS,
    maxTotalTokens: environment.AI_MAX_TOTAL_TOKENS_PER_RUN,
    inputCostMicrousdPerMillionTokens: environment.AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    outputCostMicrousdPerMillionTokens: environment.AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    maxCostMicrousdPerRun: environment.AI_MAX_COST_MICROUSD_PER_RUN,
  });
  if (
    evidenceAdapter.versions.pipeline !== environment.AI_PIPELINE_VERSION ||
    evidenceAdapter.versions.prompt !== environment.AI_EVIDENCE_PROMPT_VERSION ||
    evidenceAdapter.versions.schema !== environment.AI_SCHEMA_VERSION
  ) {
    throw new Error(
      "Worker AI contract environment versions do not match the compiled evidence contract",
    );
  }
  const processEvidenceRun = createEvidenceRunProcessor({
    client: serviceClient,
    adapter: evidenceAdapter,
    downloadResume: (path) =>
      downloadResume(environment.NEXT_PUBLIC_SUPABASE_URL!, environment.SUPABASE_SECRET_KEY!, path),
  });
  let polling = false;

  const processMessage = async (message: QueueMessage) => {
    const runId = message.message.processing_run_id;
    if (!isOpaqueUuid(runId)) return;
    await processEvidenceRun(runId);
  };

  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const result = await database.query<QueueMessage>(
        "select msg_id, message from pgmq.read($1, $2, $3)",
        [environment.PROCESSING_QUEUE, 30, environment.WORKER_CONCURRENCY],
      );
      await Promise.all(
        result.rows.map(async (message) => {
          await processMessage(message);
          await database.query("select pgmq.archive($1, $2)", [
            environment.PROCESSING_QUEUE,
            message.msg_id,
          ]);
        }),
      );
    } catch {
      console.error(
        JSON.stringify({
          service: "worker",
          event: "queue_poll_failed",
          category: "QUEUE_UNAVAILABLE",
        }),
      );
    } finally {
      polling = false;
    }
  };

  console.log(
    JSON.stringify({
      ...health,
      appEnv: environment.APP_ENV,
      message: "Worker queue processing is running.",
    }),
  );

  void database.connect().then(poll);
  const heartbeat = setInterval(() => void poll(), environment.WORKER_POLL_INTERVAL_MS);
  const stop = () => {
    clearInterval(heartbeat);
    void database.end();
    process.exitCode = 0;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

startWorker();

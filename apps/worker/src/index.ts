import pg from "pg";

import {
  claimResumeExtractionRun,
  completeResumeExtraction,
  createSupabaseRestClient,
  failResumeExtraction,
  markResumeExtractionNeedsOcr,
} from "@hirelens/database";
import { DOMAIN_PACKAGE_NAME, parseEnvironment } from "@hirelens/domain";
import { extractPdfPages, PdfExtractionError } from "@hirelens/pdf";

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
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
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
    !environment.NEXT_PUBLIC_SUPABASE_URL
  ) {
    throw new Error(
      "Worker requires DATABASE_URL, SUPABASE_SECRET_KEY, and NEXT_PUBLIC_SUPABASE_URL",
    );
  }
  if (environment.WORKER_MAX_ATTEMPTS !== 2) {
    throw new Error("WORKER_MAX_ATTEMPTS must be 2 for the Phase 3 processing contract");
  }

  const database = new pg.Client({ connectionString: environment.DATABASE_URL });
  const serviceClient = createSupabaseRestClient({
    url: environment.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: environment.SUPABASE_SECRET_KEY,
    accessToken: environment.SUPABASE_SECRET_KEY,
  });
  let polling = false;

  const processMessage = async (message: QueueMessage) => {
    const runId = message.message.processing_run_id;
    if (!isOpaqueUuid(runId)) return;
    const claimed = await claimResumeExtractionRun(serviceClient, runId);
    if (!claimed) return;

    try {
      const bytes = await downloadResume(
        environment.NEXT_PUBLIC_SUPABASE_URL!,
        environment.SUPABASE_SECRET_KEY!,
        claimed.storage_path,
      );
      const pages = await extractPdfPages(bytes);
      if (pages.every((page) => page.normalizedText.length === 0)) {
        await markResumeExtractionNeedsOcr(serviceClient, runId);
      } else {
        await completeResumeExtraction(serviceClient, { processingRunId: runId, pages });
      }
    } catch (error) {
      const details = error as { category?: string; retryable?: boolean };
      const category =
        error instanceof PdfExtractionError
          ? error.category
          : (details.category ?? "STORAGE_DOWNLOAD_FAILED");
      await failResumeExtraction(serviceClient, runId, category, details.retryable === true);
    }
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

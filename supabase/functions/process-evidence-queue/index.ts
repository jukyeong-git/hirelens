// Must be first: installing the canvas globals is an import side effect and
// pdfjs-dist reads them while its own module initialises.
import { installPdfRuntimeGlobals } from "./pdf-runtime-globals.ts";

import { createEvidenceRunProcessor } from "../../../apps/worker/src/evidence-processor.ts";

import { EVIDENCE_CONTRACT_VERSIONS } from "../../../packages/ai/src/versions.ts";
import { createEvidenceAdapter } from "../../../packages/ai/src/evidence-adapter.ts";
import {
  dequeueEvidenceQueueMessage,
  quarantineMalformedEvidenceQueueMessage,
  settleEvidenceQueueMessage,
} from "../../../packages/database/src/evidence.ts";
import { createSupabaseRestClient } from "../../../packages/database/src/rest.ts";

import {
  consumeOneEvidenceQueueMessage,
  invocationSecretMatches,
} from "../../../apps/worker/src/edge-consumer.ts";


function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required Edge Function environment: ${name}`);
  return value;
}

function integerEnvironment(name: string, fallback: number): number {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid integer Edge Function environment: ${name}`);
  }
  return value;
}

function storageObjectUrl(projectUrl: string, path: string): string {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${projectUrl.replace(/\/+$/u, "")}/storage/v1/object/resumes/${encodedPath}`;
}

async function downloadResume(
  projectUrl: string,
  serviceRoleKey: string,
  path: string,
): Promise<Uint8Array> {
  const response = await fetch(storageObjectUrl(projectUrl, path), {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) {
    throw Object.assign(new Error("Resume storage download failed"), {
      category: response.status >= 500 ? "STORAGE_UNAVAILABLE" : "STORAGE_DOWNLOAD_FAILED",
      retryable: response.status >= 500,
    });
  }
  return new Uint8Array(await response.arrayBuffer());
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeInvocationFailureCategory(error: unknown, stage: string): string {
  if (!(error instanceof Error)) return "UNEXPECTED";
  if (error.message === "Edge evidence contract environment does not match compiled versions") {
    return "AI_CONTRACT_VERSION_MISMATCH";
  }
  if (error.message.startsWith("Missing required Edge Function environment:")) {
    return "EDGE_ENVIRONMENT_MISSING";
  }
  if (error.message.startsWith("Invalid integer Edge Function environment:")) {
    return "EDGE_ENVIRONMENT_INVALID";
  }
  return `UNEXPECTED_${stage}`;
}

// The category alone cannot distinguish a missing Deno global from a failed npm
// resolution, and Edge logs are not reachable from the CLI. Surface the message
// for module-load failures only; later stages can carry resume content.
function safeInvocationFailureDetail(error: unknown, stage: string): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (!stage.endsWith("MODULE_LOAD")) return undefined;
  return error.message.slice(0, 300);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });

  let invocationSecret: string;
  try {
    invocationSecret = requiredEnvironment("EVIDENCE_CONSUMER_CRON_SECRET");
  } catch {
    return jsonResponse(503, { error: "CONSUMER_NOT_CONFIGURED" });
  }
  if (
    !invocationSecretMatches(request.headers.get("x-hirelens-invocation-secret"), invocationSecret)
  ) {
    return jsonResponse(401, { error: "UNAUTHORIZED" });
  }

  let stage = "MODULE_LOAD";
  try {
    stage = "PDF_MODULE_LOAD";
    // Must run before the import: pdfjs-dist reads canvas globals while its own
    // module is initialising.
    installPdfRuntimeGlobals();
    await import("../../../packages/pdf/src/index.ts");
    stage = "PROCESSOR_MODULE_LOAD";
    stage = "ENVIRONMENT";
    const projectUrl = requiredEnvironment("SUPABASE_URL");
    const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
    const openAiApiKey = requiredEnvironment("OPENAI_API_KEY");
    const openAiModel = requiredEnvironment("OPENAI_MODEL");
    const serviceClient = createSupabaseRestClient({
      url: projectUrl,
      publishableKey: serviceRoleKey,
      accessToken: serviceRoleKey,
    });
    const adapter = createEvidenceAdapter({
      apiKey: openAiApiKey,
      model: openAiModel,
      maxInputTokens: integerEnvironment("AI_MAX_INPUT_TOKENS", 24_000),
      maxOutputTokens: integerEnvironment("AI_MAX_OUTPUT_TOKENS", 8_000),
      maxTotalTokens: integerEnvironment("AI_MAX_TOTAL_TOKENS_PER_RUN", 32_000),
      inputCostMicrousdPerMillionTokens: integerEnvironment(
        "AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS",
        0,
      ),
      outputCostMicrousdPerMillionTokens: integerEnvironment(
        "AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS",
        0,
      ),
      maxCostMicrousdPerRun: integerEnvironment("AI_MAX_COST_MICROUSD_PER_RUN", 100_000),
      timeoutMs: integerEnvironment("AI_TIMEOUT_MS", 30_000),
    });
    if (
      (Deno.env.get("AI_PIPELINE_VERSION") ?? EVIDENCE_CONTRACT_VERSIONS.pipeline) !==
        adapter.versions.pipeline ||
      (Deno.env.get("AI_EVIDENCE_PROMPT_VERSION") ?? EVIDENCE_CONTRACT_VERSIONS.prompt) !==
        adapter.versions.prompt ||
      (Deno.env.get("AI_SCHEMA_VERSION") ?? EVIDENCE_CONTRACT_VERSIONS.schema) !==
        adapter.versions.schema
    ) {
      throw new Error("Edge evidence contract environment does not match compiled versions");
    }

    stage = "PROCESSOR_SETUP";
    const processRun = createEvidenceRunProcessor({
      client: serviceClient,
      adapter,
      downloadResume: (path) => downloadResume(projectUrl, serviceRoleKey, path),
    });
    const visibilitySeconds = integerEnvironment("EVIDENCE_QUEUE_VISIBILITY_SECONDS", 360);
    const result = await consumeOneEvidenceQueueMessage({
      dequeue: async () => {
        stage = "QUEUE_DEQUEUE";
        return dequeueEvidenceQueueMessage(serviceClient, visibilitySeconds);
      },
      quarantineMalformed: async (messageId) => {
        stage = "QUEUE_QUARANTINE";
        return quarantineMalformedEvidenceQueueMessage(serviceClient, messageId);
      },
      processRun: async (processingRunId) => {
        stage = "PROCESS_RUN";
        return processRun(processingRunId);
      },
      settle: async (messageId, processingRunId) => {
        stage = "QUEUE_SETTLE";
        return settleEvidenceQueueMessage(serviceClient, messageId, processingRunId);
      },
    });
    return jsonResponse(200, {
      status: result.status,
      ...(result.status === "PROCESSED"
        ? { outcome: result.outcome, settled: result.settled }
        : {}),
    });
  } catch (error) {
    const category = safeInvocationFailureCategory(error, stage);
    const detail = safeInvocationFailureDetail(error, stage);
    console.error(
      JSON.stringify({
        service: "evidence-edge-consumer",
        event: "invocation_failed",
        category,
        ...(detail ? { detail } : {}),
      }),
    );
    return jsonResponse(500, {
      error: "PROCESSING_FAILED",
      category,
      ...(detail ? { detail } : {}),
    });
  }
});

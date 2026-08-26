import { z } from "zod";

/**
 * The provider-call shell shared by the interview contracts.
 *
 * `revision-adapter.ts` and `evidence-adapter.ts` each carry their own copy of
 * this sequence — budget check, timed fetch, status mapping, output extraction,
 * strict validation, usage verification. The interview guide and the transcript
 * assessment need exactly the same sequence, so they share one implementation
 * rather than adding two more copies. The existing adapters are left alone:
 * their error codes are asserted by tests and read by callers.
 */

export type StructuredAdapterErrorCode =
  | "INVALID_CONFIGURATION"
  | "BUDGET_EXCEEDED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "RATE_LIMIT"
  | "PROVIDER_ERROR"
  | "PROVIDER_REQUEST_ERROR"
  | "REFUSAL"
  | "INCOMPLETE"
  | "MISSING_OUTPUT"
  | "INVALID_JSON"
  | "INVALID_SCHEMA"
  | "INVALID_USAGE";

export class StructuredAdapterError extends Error {
  constructor(
    public readonly code: StructuredAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StructuredAdapterError";
  }
  get retryable(): boolean {
    return ["TIMEOUT", "NETWORK_ERROR", "RATE_LIMIT", "PROVIDER_ERROR", "INCOMPLETE"].includes(
      this.code,
    );
  }
}

export interface StructuredAdapterOptions {
  apiKey: string;
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
  inputCostMicrousdPerMillionTokens: number;
  outputCostMicrousdPerMillionTokens: number;
  maxCostMicrousdPerRun: number;
  timeoutMs?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface StructuredAdapterUsage {
  providerRequestId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMicrousd: number;
  durationMs: number;
}

export interface StructuredCallSpec<TResult> {
  systemPrompt: string;
  userPrompt: string;
  responseFormat: unknown;
  /** Throws when the decoded payload violates the contract. */
  validate: (decoded: unknown) => TResult;
}

const usageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .passthrough();

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  options: StructuredAdapterOptions,
): number {
  return Math.ceil(
    (inputTokens * options.inputCostMicrousdPerMillionTokens +
      outputTokens * options.outputCostMicrousdPerMillionTokens) /
      1_000_000,
  );
}

function extractOutput(body: Record<string, unknown>): { text: string | null; refusal: boolean } {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return { text: body.output_text, refusal: false };
  }
  let text = "";
  let refusal = false;
  if (Array.isArray(body.output)) {
    for (const item of body.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const typed = part as { type?: unknown; text?: unknown; refusal?: unknown };
        if (typed.type === "refusal" || typeof typed.refusal === "string") refusal = true;
        if (typed.type === "output_text" && typeof typed.text === "string") text += typed.text;
      }
    }
  }
  return { text: text.trim() || null, refusal };
}

export function assertStructuredAdapterOptions(options: StructuredAdapterOptions): void {
  if (!options.apiKey.trim() || !options.model.trim()) {
    throw new StructuredAdapterError("INVALID_CONFIGURATION", "apiKey and model are required");
  }
  for (const [name, value] of Object.entries({
    maxInputTokens: options.maxInputTokens,
    maxOutputTokens: options.maxOutputTokens,
    maxTotalTokens: options.maxTotalTokens,
    maxCostMicrousdPerRun: options.maxCostMicrousdPerRun,
  })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new StructuredAdapterError(
        "INVALID_CONFIGURATION",
        `${name} must be a positive integer`,
      );
    }
  }
  if (!(options.fetchImpl ?? globalThis.fetch)) {
    throw new StructuredAdapterError("INVALID_CONFIGURATION", "fetch is required");
  }
}

export async function callStructured<TResult>(
  options: StructuredAdapterOptions,
  spec: StructuredCallSpec<TResult>,
  label: string,
): Promise<{ result: TResult; usage: StructuredAdapterUsage }> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const inputTokenUpperBound = new TextEncoder().encode(
    `${spec.systemPrompt}\n${spec.userPrompt}`,
  ).length;
  const maximumCost = estimateCost(inputTokenUpperBound, options.maxOutputTokens, options);
  if (
    inputTokenUpperBound > options.maxInputTokens ||
    inputTokenUpperBound + options.maxOutputTokens > options.maxTotalTokens ||
    maximumCost > options.maxCostMicrousdPerRun
  ) {
    throw new StructuredAdapterError(
      "BUDGET_EXCEEDED",
      `${label} request exceeds the configured per-run budget`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetchImpl(options.endpoint ?? "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        store: false,
        max_output_tokens: options.maxOutputTokens,
        input: [
          { role: "system", content: spec.systemPrompt },
          { role: "user", content: spec.userPrompt },
        ],
        text: { format: spec.responseFormat },
      }),
      signal: controller.signal,
    });
  } catch {
    throw new StructuredAdapterError(
      controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
      controller.signal.aborted
        ? `${label} request timed out`
        : `${label} request failed before receiving a response`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new StructuredAdapterError("RATE_LIMIT", `${label} request was rate limited`);
    }
    throw new StructuredAdapterError(
      response.status >= 500 || response.status === 408
        ? "PROVIDER_ERROR"
        : "PROVIDER_REQUEST_ERROR",
      `${label} request failed with status ${response.status}`,
    );
  }
  const body = (await response.json().catch(() => {
    throw new StructuredAdapterError("INVALID_JSON", "Provider response was not JSON");
  })) as Record<string, unknown>;
  if (body.status === "incomplete") {
    throw new StructuredAdapterError("INCOMPLETE", `Provider returned incomplete ${label} output`);
  }
  const output = extractOutput(body);
  if (output.refusal) {
    throw new StructuredAdapterError("REFUSAL", `Provider refused ${label} generation`);
  }
  if (!output.text) {
    throw new StructuredAdapterError("MISSING_OUTPUT", `Provider returned no ${label} output`);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(output.text);
  } catch {
    throw new StructuredAdapterError("INVALID_JSON", `${label} output was not JSON`);
  }
  const result = spec.validate(decoded);

  const usage = usageSchema.safeParse(body.usage);
  if (
    !usage.success ||
    usage.data.total_tokens !== usage.data.input_tokens + usage.data.output_tokens ||
    usage.data.input_tokens > options.maxInputTokens ||
    usage.data.output_tokens > options.maxOutputTokens ||
    usage.data.total_tokens > options.maxTotalTokens
  ) {
    throw new StructuredAdapterError(
      "INVALID_USAGE",
      "Provider usage was missing or exceeded configured caps",
    );
  }
  const cost = estimateCost(usage.data.input_tokens, usage.data.output_tokens, options);
  if (cost > options.maxCostMicrousdPerRun) {
    throw new StructuredAdapterError(
      "INVALID_USAGE",
      "Provider usage exceeded the per-run cost budget",
    );
  }
  return {
    result,
    usage: {
      providerRequestId: typeof body.id === "string" ? body.id : null,
      inputTokens: usage.data.input_tokens,
      outputTokens: usage.data.output_tokens,
      totalTokens: usage.data.total_tokens,
      estimatedCostMicrousd: cost,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
  };
}

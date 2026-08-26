import { z } from "zod";

import {
  frameworkRevisionPromptInputSchema,
  frameworkRevisionResponseFormat,
  validateFrameworkRevision,
  FrameworkRevisionValidationError,
  type FrameworkRevision,
  type FrameworkRevisionPromptInput,
} from "./revision";
import { buildFrameworkRevisionPrompt, FRAMEWORK_REVISION_SYSTEM_PROMPT } from "./revision-prompt";
import {
  FRAMEWORK_REVISION_CONTRACT_VERSIONS,
  type FrameworkRevisionContractVersions,
} from "./versions";

export type FrameworkRevisionAdapterErrorCode =
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
  | "INVALID_FINDING"
  | "PROTECTED_TRAIT_LANGUAGE"
  | "INVALID_USAGE";

export class FrameworkRevisionAdapterError extends Error {
  constructor(
    public readonly code: FrameworkRevisionAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FrameworkRevisionAdapterError";
  }
  get retryable(): boolean {
    return ["TIMEOUT", "NETWORK_ERROR", "RATE_LIMIT", "PROVIDER_ERROR", "INCOMPLETE"].includes(
      this.code,
    );
  }
  get quarantined(): boolean {
    return ["INVALID_SCHEMA", "INVALID_FINDING", "PROTECTED_TRAIT_LANGUAGE"].includes(this.code);
  }
}

export interface FrameworkRevisionAdapterOptions {
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

export interface FrameworkRevisionAdapterUsage {
  providerRequestId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMicrousd: number;
  durationMs: number;
}

export interface FrameworkRevisionAdapterResult {
  revision: FrameworkRevision;
  versions: FrameworkRevisionContractVersions;
  usage: FrameworkRevisionAdapterUsage;
}

export interface FrameworkRevisionAdapter {
  (input: FrameworkRevisionPromptInput): Promise<FrameworkRevisionAdapterResult>;
  versions: FrameworkRevisionContractVersions;
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
  options: FrameworkRevisionAdapterOptions,
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

export function createFrameworkRevisionAdapter(
  options: FrameworkRevisionAdapterOptions,
): FrameworkRevisionAdapter {
  if (!options.apiKey.trim() || !options.model.trim()) {
    throw new FrameworkRevisionAdapterError(
      "INVALID_CONFIGURATION",
      "apiKey and model are required",
    );
  }
  for (const [name, value] of Object.entries({
    maxInputTokens: options.maxInputTokens,
    maxOutputTokens: options.maxOutputTokens,
    maxTotalTokens: options.maxTotalTokens,
    maxCostMicrousdPerRun: options.maxCostMicrousdPerRun,
  })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new FrameworkRevisionAdapterError(
        "INVALID_CONFIGURATION",
        `${name} must be a positive integer`,
      );
    }
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new FrameworkRevisionAdapterError("INVALID_CONFIGURATION", "fetch is required");
  }
  const versions: FrameworkRevisionContractVersions = {
    model: options.model,
    ...FRAMEWORK_REVISION_CONTRACT_VERSIONS,
  };

  const generate = async (
    rawInput: FrameworkRevisionPromptInput,
  ): Promise<FrameworkRevisionAdapterResult> => {
    const input = frameworkRevisionPromptInputSchema.parse(rawInput);
    const prompt = buildFrameworkRevisionPrompt(input);
    const inputTokenUpperBound = new TextEncoder().encode(
      `${FRAMEWORK_REVISION_SYSTEM_PROMPT}\n${prompt}`,
    ).length;
    const maximumCost = estimateCost(inputTokenUpperBound, options.maxOutputTokens, options);
    if (
      inputTokenUpperBound > options.maxInputTokens ||
      inputTokenUpperBound + options.maxOutputTokens > options.maxTotalTokens ||
      maximumCost > options.maxCostMicrousdPerRun
    ) {
      throw new FrameworkRevisionAdapterError(
        "BUDGET_EXCEEDED",
        "Framework revision request exceeds the configured per-run budget",
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
            { role: "system", content: FRAMEWORK_REVISION_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          text: { format: frameworkRevisionResponseFormat },
        }),
        signal: controller.signal,
      });
    } catch {
      throw new FrameworkRevisionAdapterError(
        controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        controller.signal.aborted
          ? "Framework revision request timed out"
          : "Framework revision request failed before receiving a response",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new FrameworkRevisionAdapterError(
          "RATE_LIMIT",
          "Framework revision request was rate limited",
        );
      }
      throw new FrameworkRevisionAdapterError(
        response.status >= 500 || response.status === 408
          ? "PROVIDER_ERROR"
          : "PROVIDER_REQUEST_ERROR",
        `Framework revision request failed with status ${response.status}`,
      );
    }
    const body = (await response.json().catch(() => {
      throw new FrameworkRevisionAdapterError("INVALID_JSON", "Provider response was not JSON");
    })) as Record<string, unknown>;
    if (body.status === "incomplete") {
      throw new FrameworkRevisionAdapterError(
        "INCOMPLETE",
        "Provider returned incomplete framework revision output",
      );
    }
    const output = extractOutput(body);
    if (output.refusal) {
      throw new FrameworkRevisionAdapterError(
        "REFUSAL",
        "Provider refused framework revision generation",
      );
    }
    if (!output.text) {
      throw new FrameworkRevisionAdapterError(
        "MISSING_OUTPUT",
        "Provider returned no framework revision output",
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(output.text);
    } catch {
      throw new FrameworkRevisionAdapterError(
        "INVALID_JSON",
        "Framework revision output was not JSON",
      );
    }
    let revision: FrameworkRevision;
    try {
      revision = validateFrameworkRevision(decoded, input);
    } catch (error) {
      if (error instanceof FrameworkRevisionValidationError) {
        throw new FrameworkRevisionAdapterError(
          error.code === "PROTECTED_TRAIT_LANGUAGE"
            ? "PROTECTED_TRAIT_LANGUAGE"
            : "INVALID_FINDING",
          error.message,
        );
      }
      throw new FrameworkRevisionAdapterError(
        "INVALID_SCHEMA",
        "Framework revision output failed strict runtime validation",
      );
    }

    const usage = usageSchema.safeParse(body.usage);
    if (
      !usage.success ||
      usage.data.total_tokens !== usage.data.input_tokens + usage.data.output_tokens ||
      usage.data.input_tokens > options.maxInputTokens ||
      usage.data.output_tokens > options.maxOutputTokens ||
      usage.data.total_tokens > options.maxTotalTokens
    ) {
      throw new FrameworkRevisionAdapterError(
        "INVALID_USAGE",
        "Provider usage was missing or exceeded configured caps",
      );
    }
    const cost = estimateCost(usage.data.input_tokens, usage.data.output_tokens, options);
    if (cost > options.maxCostMicrousdPerRun) {
      throw new FrameworkRevisionAdapterError(
        "INVALID_USAGE",
        "Provider usage exceeded the per-run cost budget",
      );
    }
    return {
      revision,
      versions,
      usage: {
        providerRequestId: typeof body.id === "string" ? body.id : null,
        inputTokens: usage.data.input_tokens,
        outputTokens: usage.data.output_tokens,
        totalTokens: usage.data.total_tokens,
        estimatedCostMicrousd: cost,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      },
    };
  };

  return Object.assign(generate, { versions });
}

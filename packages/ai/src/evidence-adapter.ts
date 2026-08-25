import { z } from "zod";

import {
  evidenceExtractionResponseFormat,
  evidencePromptInputSchema,
  validateEvidenceExtraction,
  EvidenceValidationError,
  type EvidenceExtraction,
  type EvidencePromptInput,
} from "./evidence.ts";
import { buildEvidencePrompt, EVIDENCE_SYSTEM_PROMPT } from "./evidence-prompt.ts";
import { EVIDENCE_CONTRACT_VERSIONS, type EvidenceContractVersions } from "./versions.ts";

export type EvidenceAdapterErrorCode =
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
  | "UNKNOWN_CRITERION"
  | "INVALID_PAGE"
  | "QUOTE_MISMATCH"
  | "INVALID_USAGE";

export class EvidenceAdapterError extends Error {
  constructor(
    public readonly code: EvidenceAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EvidenceAdapterError";
  }
  get retryable(): boolean {
    return ["TIMEOUT", "NETWORK_ERROR", "RATE_LIMIT", "PROVIDER_ERROR", "INCOMPLETE"].includes(
      this.code,
    );
  }
  get quarantined(): boolean {
    return ["INVALID_SCHEMA", "UNKNOWN_CRITERION", "INVALID_PAGE", "QUOTE_MISMATCH"].includes(
      this.code,
    );
  }
}

export interface EvidenceAdapterOptions {
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
export interface EvidenceAdapterUsage {
  providerRequestId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMicrousd: number;
  durationMs: number;
}
export interface EvidenceAdapterResult {
  evidence: EvidenceExtraction;
  versions: EvidenceContractVersions;
  usage: EvidenceAdapterUsage;
}
export interface EvidenceAdapter {
  (input: EvidencePromptInput): Promise<EvidenceAdapterResult>;
  versions: EvidenceContractVersions;
}

const usageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  })
  .passthrough();
function estimatedCost(input: number, output: number, options: EvidenceAdapterOptions): number {
  return Math.ceil(
    (input * options.inputCostMicrousdPerMillionTokens +
      output * options.outputCostMicrousdPerMillionTokens) /
      1_000_000,
  );
}
function outputText(body: Record<string, unknown>): { text: string | null; refusal: boolean } {
  if (typeof body.output_text === "string" && body.output_text.trim())
    return { text: body.output_text, refusal: false };
  let text = "";
  let refusal = false;
  if (Array.isArray(body.output))
    for (const item of body.output) {
      if (
        !item ||
        typeof item !== "object" ||
        !Array.isArray((item as { content?: unknown }).content)
      )
        continue;
      for (const part of (item as { content: unknown[] }).content) {
        if (!part || typeof part !== "object") continue;
        const typed = part as { type?: unknown; text?: unknown; refusal?: unknown };
        if (typed.type === "refusal" || typeof typed.refusal === "string") refusal = true;
        if (typed.type === "output_text" && typeof typed.text === "string") text += typed.text;
      }
    }
  return { text: text.trim() || null, refusal };
}

export function createEvidenceAdapter(options: EvidenceAdapterOptions): EvidenceAdapter {
  if (!options.apiKey.trim() || !options.model.trim())
    throw new EvidenceAdapterError("INVALID_CONFIGURATION", "apiKey and model are required");
  for (const [name, value] of Object.entries({
    maxInputTokens: options.maxInputTokens,
    maxOutputTokens: options.maxOutputTokens,
    maxTotalTokens: options.maxTotalTokens,
    maxCostMicrousdPerRun: options.maxCostMicrousdPerRun,
  })) {
    if (!Number.isInteger(value) || value <= 0)
      throw new EvidenceAdapterError("INVALID_CONFIGURATION", `${name} must be a positive integer`);
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new EvidenceAdapterError("INVALID_CONFIGURATION", "fetch is required");
  const versions: EvidenceContractVersions = {
    model: options.model,
    ...EVIDENCE_CONTRACT_VERSIONS,
  };

  const analyze = async (rawInput: EvidencePromptInput): Promise<EvidenceAdapterResult> => {
    const input = evidencePromptInputSchema.parse(rawInput);
    const prompt = buildEvidencePrompt(input);
    const inputTokenUpperBound = new TextEncoder().encode(
      `${EVIDENCE_SYSTEM_PROMPT}\n${prompt}`,
    ).length;
    const maximumCost = estimatedCost(inputTokenUpperBound, options.maxOutputTokens, options);
    if (
      inputTokenUpperBound > options.maxInputTokens ||
      inputTokenUpperBound + options.maxOutputTokens > options.maxTotalTokens ||
      maximumCost > options.maxCostMicrousdPerRun
    ) {
      throw new EvidenceAdapterError(
        "BUDGET_EXCEEDED",
        "Evidence request exceeds the configured per-run budget",
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
            { role: "system", content: EVIDENCE_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          text: { format: evidenceExtractionResponseFormat },
        }),
        signal: controller.signal,
      });
    } catch {
      throw new EvidenceAdapterError(
        controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
        controller.signal.aborted
          ? "Evidence request timed out"
          : "Evidence request failed before receiving a response",
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      if (response.status === 429)
        throw new EvidenceAdapterError("RATE_LIMIT", "Evidence request was rate limited");
      throw new EvidenceAdapterError(
        response.status >= 500 || response.status === 408
          ? "PROVIDER_ERROR"
          : "PROVIDER_REQUEST_ERROR",
        `Evidence request failed with status ${response.status}`,
      );
    }
    const body = (await response.json().catch(() => {
      throw new EvidenceAdapterError("INVALID_JSON", "Provider response was not JSON");
    })) as Record<string, unknown>;
    if (body.status === "incomplete")
      throw new EvidenceAdapterError("INCOMPLETE", "Provider returned incomplete evidence output");
    const extracted = outputText(body);
    if (extracted.refusal)
      throw new EvidenceAdapterError("REFUSAL", "Provider refused evidence extraction");
    if (!extracted.text)
      throw new EvidenceAdapterError("MISSING_OUTPUT", "Provider returned no evidence output");
    let decoded: unknown;
    try {
      decoded = JSON.parse(extracted.text);
    } catch {
      throw new EvidenceAdapterError("INVALID_JSON", "Evidence output was not JSON");
    }
    let evidence: EvidenceExtraction;
    try {
      evidence = validateEvidenceExtraction(decoded, {
        allowedCriterionIds: new Set(input.criteria.map((criterion) => criterion.criterion_id)),
        humanOnlyCriterionIds: new Set(
          input.criteria
            .filter((criterion) => !criterion.resume_assessable)
            .map((criterion) => criterion.criterion_id),
        ),
        pageTextByNumber: new Map(input.pages.map((page) => [page.page_number, page.text])),
      });
    } catch (error) {
      if (error instanceof EvidenceValidationError) {
        const codes = new Set(error.issues.map((issue) => issue.code));
        if (codes.has("QUOTE_NOT_FOUND"))
          throw new EvidenceAdapterError("QUOTE_MISMATCH", error.message);
        if (codes.has("INVALID_PAGE_NUMBER"))
          throw new EvidenceAdapterError("INVALID_PAGE", error.message);
        if (
          codes.has("UNKNOWN_CRITERION") ||
          codes.has("MISSING_CRITERION") ||
          codes.has("INVALID_HUMAN_ONLY_STATUS")
        )
          throw new EvidenceAdapterError("UNKNOWN_CRITERION", error.message);
      }
      throw new EvidenceAdapterError(
        "INVALID_SCHEMA",
        "Evidence output failed strict runtime validation",
      );
    }
    const usageResult = usageSchema.safeParse(body.usage);
    if (
      !usageResult.success ||
      usageResult.data.total_tokens !==
        usageResult.data.input_tokens + usageResult.data.output_tokens ||
      usageResult.data.input_tokens > options.maxInputTokens ||
      usageResult.data.output_tokens > options.maxOutputTokens ||
      usageResult.data.total_tokens > options.maxTotalTokens
    )
      throw new EvidenceAdapterError(
        "INVALID_USAGE",
        "Provider usage was missing or exceeded configured caps",
      );
    const cost = estimatedCost(
      usageResult.data.input_tokens,
      usageResult.data.output_tokens,
      options,
    );
    if (cost > options.maxCostMicrousdPerRun)
      throw new EvidenceAdapterError(
        "INVALID_USAGE",
        "Provider usage exceeded the per-run cost budget",
      );
    return {
      evidence,
      versions,
      usage: {
        providerRequestId: typeof body.id === "string" ? body.id : null,
        inputTokens: usageResult.data.input_tokens,
        outputTokens: usageResult.data.output_tokens,
        totalTokens: usageResult.data.total_tokens,
        estimatedCostMicrousd: cost,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      },
    };
  };
  return Object.assign(analyze, { versions });
}

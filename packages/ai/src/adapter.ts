import {
  parseScorecardDraft,
  sanitizeScorecardDraftSourcePhrases,
  scorecardDraftResponseFormat,
  validateScorecardDraft,
  ScorecardDraftValidationError,
  type ScorecardDraft,
  type ScorecardDraftPromptInput,
} from "./scorecard-draft";
import { buildScorecardDraftPrompt, SCORECARD_DRAFT_SYSTEM_PROMPT } from "./prompt";
import {
  SCORECARD_DRAFT_CONTRACT_VERSIONS,
  SCORECARD_DRAFT_SCHEMA_NAME,
  type ScorecardDraftContractVersions,
} from "./versions";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 8_000;

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";
type TextVerbosity = "low" | "medium" | "high";

export interface ScorecardDraftAdapterOptions {
  /** Pass the server-held key; never source this from browser input or logs. */
  apiKey: string;
  /** Configure a pinned or approved model identifier at the server boundary. */
  model: string;
  /** Configure the API URL through server environment/configuration. */
  endpoint?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  reasoningEffort?: ReasoningEffort;
  verbosity?: TextVerbosity;
  fetchImpl?: typeof fetch;
}

export interface ScorecardDraftAdapterResult {
  draft: ScorecardDraft;
  versions: ScorecardDraftContractVersions;
}

export interface ScorecardDraftAdapter {
  (input: ScorecardDraftPromptInput): Promise<ScorecardDraftAdapterResult>;
  readonly versions: ScorecardDraftContractVersions;
}

export type ScorecardDraftAdapterErrorCode =
  | "SERVER_ONLY"
  | "INVALID_CONFIGURATION"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "REFUSAL"
  | "INCOMPLETE"
  | "MISSING_OUTPUT"
  | "INVALID_JSON"
  | "INVALID_SCHEMA"
  | "INVALID_SOURCE_PHRASE";

export class ScorecardDraftAdapterError extends Error {
  constructor(
    public readonly code: ScorecardDraftAdapterErrorCode,
    message: string,
    public readonly diagnostic?: Readonly<{
      httpStatus?: number;
      openAiRequestId?: string;
    }>,
  ) {
    super(message);
    this.name = "ScorecardDraftAdapterError";
  }
}

interface ResponsesApiBody {
  status?: unknown;
  incomplete_details?: unknown;
  output_text?: unknown;
  output?: unknown;
}

function requireServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new ScorecardDraftAdapterError(
      "SERVER_ONLY",
      "The scorecard draft adapter must run in a server-only runtime",
    );
  }
}

function resolveEndpoint(endpoint: string | undefined): string {
  const configuredEndpoint =
    endpoint ??
    (typeof process !== "undefined" ? process.env.OPENAI_RESPONSES_ENDPOINT : undefined);

  if (!configuredEndpoint) {
    throw new ScorecardDraftAdapterError(
      "INVALID_CONFIGURATION",
      "OPENAI_RESPONSES_ENDPOINT must be configured for the server adapter",
    );
  }

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(configuredEndpoint);
  } catch {
    throw new ScorecardDraftAdapterError(
      "INVALID_CONFIGURATION",
      "OPENAI_RESPONSES_ENDPOINT must be a valid URL",
    );
  }

  if (!/^https?:$/u.test(parsedEndpoint.protocol)) {
    throw new ScorecardDraftAdapterError(
      "INVALID_CONFIGURATION",
      "OPENAI_RESPONSES_ENDPOINT must use HTTP(S)",
    );
  }

  return parsedEndpoint.toString();
}

function extractOutputText(body: ResponsesApiBody): { text: string | null; refusal: boolean } {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return { text: body.output_text, refusal: false };
  }

  if (!Array.isArray(body.output)) {
    return { text: null, refusal: false };
  }

  let text: string | null = null;
  let refusal = false;
  for (const item of body.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typedPart = part as { type?: unknown; text?: unknown; refusal?: unknown };
      if (typedPart.type === "refusal" || typeof typedPart.refusal === "string") {
        refusal = true;
      }
      if (typedPart.type === "output_text" && typeof typedPart.text === "string") {
        text = text === null ? typedPart.text : `${text}${typedPart.text}`;
      }
    }
  }

  return { text: text?.trim() ? text : null, refusal };
}

function parseResponseBody(body: unknown): ResponsesApiBody {
  if (!body || typeof body !== "object") {
    throw new ScorecardDraftAdapterError("MISSING_OUTPUT", "OpenAI returned no response object");
  }
  return body as ResponsesApiBody;
}

export function createScorecardDraftAdapter(
  options: ScorecardDraftAdapterOptions,
): ScorecardDraftAdapter {
  requireServerRuntime();

  if (!options.apiKey.trim() || !options.model.trim()) {
    throw new ScorecardDraftAdapterError(
      "INVALID_CONFIGURATION",
      "apiKey and model are required for the server adapter",
    );
  }

  const endpoint = resolveEndpoint(options.endpoint);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new ScorecardDraftAdapterError(
      "INVALID_CONFIGURATION",
      `timeoutMs must be a positive integer no greater than ${MAX_TIMEOUT_MS}`,
    );
  }
  if (
    options.maxOutputTokens !== undefined &&
    (!Number.isInteger(options.maxOutputTokens) ||
      options.maxOutputTokens <= 0 ||
      options.maxOutputTokens > MAX_OUTPUT_TOKENS)
  ) {
    throw new ScorecardDraftAdapterError(
      "INVALID_CONFIGURATION",
      `maxOutputTokens must be a positive integer no greater than ${MAX_OUTPUT_TOKENS}`,
    );
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new ScorecardDraftAdapterError(
      "INVALID_CONFIGURATION",
      "A fetch implementation is required in this server runtime",
    );
  }

  const versions: ScorecardDraftContractVersions = {
    model: options.model,
    pipeline: SCORECARD_DRAFT_CONTRACT_VERSIONS.pipeline,
    prompt: SCORECARD_DRAFT_CONTRACT_VERSIONS.prompt,
    schema: SCORECARD_DRAFT_CONTRACT_VERSIONS.schema,
  };

  const generate = async (input: ScorecardDraftPromptInput) => {
    const parsedInput = {
      ...input,
      job_title: input.job_title,
      raw_job_description: input.raw_job_description,
      human_clarification: input.human_clarification ?? null,
    };
    const promptInput = parsedInput as ScorecardDraftPromptInput;
    const prompt = buildScorecardDraftPrompt(promptInput);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          store: false,
          ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
          ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
          input: [
            { role: "system", content: SCORECARD_DRAFT_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          text: {
            format: scorecardDraftResponseFormat,
            ...(options.verbosity ? { verbosity: options.verbosity } : {}),
          },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ScorecardDraftAdapterError("TIMEOUT", "OpenAI Responses request timed out");
      }
      void error;
      throw new ScorecardDraftAdapterError(
        "NETWORK_ERROR",
        "OpenAI Responses request failed before receiving a response",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ScorecardDraftAdapterError(
        "HTTP_ERROR",
        `OpenAI Responses request failed with status ${response.status}`,
        {
          httpStatus: response.status,
          openAiRequestId: response.headers.get("x-request-id") ?? undefined,
        },
      );
    }

    let body: ResponsesApiBody;
    try {
      body = parseResponseBody(await response.json());
    } catch (error) {
      if (error instanceof ScorecardDraftAdapterError) throw error;
      void error;
      throw new ScorecardDraftAdapterError(
        "INVALID_JSON",
        "OpenAI returned a response that was not valid JSON",
      );
    }

    if (body.status === "incomplete") {
      throw new ScorecardDraftAdapterError(
        "INCOMPLETE",
        "OpenAI returned an incomplete scorecard draft",
      );
    }

    const output = extractOutputText(body);
    if (output.refusal) {
      throw new ScorecardDraftAdapterError(
        "REFUSAL",
        "OpenAI refused to produce a scorecard draft",
      );
    }
    if (!output.text) {
      throw new ScorecardDraftAdapterError(
        "MISSING_OUTPUT",
        "OpenAI returned no scorecard draft output",
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(output.text) as unknown;
    } catch {
      throw new ScorecardDraftAdapterError(
        "INVALID_JSON",
        "OpenAI scorecard draft output was not valid JSON",
      );
    }

    let draft: ScorecardDraft;
    try {
      const schemaValidDraft = parseScorecardDraft(decoded);
      const sourceSafeDraft = sanitizeScorecardDraftSourcePhrases(
        schemaValidDraft,
        promptInput.raw_job_description,
      );
      draft = validateScorecardDraft(sourceSafeDraft, promptInput);
    } catch (error) {
      if (error instanceof ScorecardDraftValidationError) {
        const hasInvalidSourcePhrase = error.issues.some((issue) =>
          issue.path.endsWith("source_phrase"),
        );
        throw new ScorecardDraftAdapterError(
          hasInvalidSourcePhrase ? "INVALID_SOURCE_PHRASE" : "INVALID_SCHEMA",
          error.message,
        );
      }
      void error;
      throw new ScorecardDraftAdapterError(
        "INVALID_SCHEMA",
        "OpenAI scorecard draft output failed the strict runtime schema",
      );
    }

    return {
      draft: parseScorecardDraft(draft),
      versions,
    };
  };

  return Object.assign(generate, { versions }) as ScorecardDraftAdapter;
}

export { SCORECARD_DRAFT_SCHEMA_NAME };

import {
  jobRequisitionDraftPromptInputSchema,
  jobRequisitionDraftResponseFormat,
  parseJobRequisitionDraft,
  type JobRequisitionDraft,
  type JobRequisitionDraftPromptInput,
} from "./job-requisition-draft";
import {
  buildJobRequisitionDraftPrompt,
  JOB_REQUISITION_DRAFT_SYSTEM_PROMPT,
} from "./job-requisition-prompt";
import {
  JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS,
  type JobRequisitionDraftContractVersions,
} from "./versions";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;

export interface JobRequisitionDraftAdapterOptions {
  /** Pass the server-held key; never source this from browser input or logs. */
  apiKey: string;
  /** Configure an approved model identifier at the server boundary. */
  model: string;
  /** Configure the API URL through server environment/configuration. */
  endpoint?: string;
  /** A bounded request deadline; values above one minute are rejected. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface JobRequisitionDraftAdapterResult {
  draft: JobRequisitionDraft;
  versions: JobRequisitionDraftContractVersions;
}

export interface JobRequisitionDraftAdapter {
  (input: JobRequisitionDraftPromptInput): Promise<JobRequisitionDraftAdapterResult>;
  readonly versions: JobRequisitionDraftContractVersions;
}

export type JobRequisitionDraftAdapterErrorCode =
  | "SERVER_ONLY"
  | "INVALID_CONFIGURATION"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "REFUSAL"
  | "INCOMPLETE"
  | "MISSING_OUTPUT"
  | "INVALID_JSON"
  | "INVALID_SCHEMA";

/** Safe category only; neither source input nor model output is attached or logged. */
export class JobRequisitionDraftAdapterError extends Error {
  constructor(
    public readonly code: JobRequisitionDraftAdapterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "JobRequisitionDraftAdapterError";
  }
}

interface ResponsesApiBody {
  status?: unknown;
  output_text?: unknown;
  output?: unknown;
}

function requireServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new JobRequisitionDraftAdapterError(
      "SERVER_ONLY",
      "The job requisition draft adapter must run in a server-only runtime",
    );
  }
}

function resolveEndpoint(endpoint: string | undefined): string {
  const configuredEndpoint =
    endpoint ??
    (typeof process !== "undefined" ? process.env.OPENAI_RESPONSES_ENDPOINT : undefined);
  if (!configuredEndpoint) {
    throw new JobRequisitionDraftAdapterError(
      "INVALID_CONFIGURATION",
      "OPENAI_RESPONSES_ENDPOINT must be configured for the server adapter",
    );
  }

  try {
    const parsedEndpoint = new URL(configuredEndpoint);
    if (!/^https?:$/u.test(parsedEndpoint.protocol)) throw new Error("invalid protocol");
    return parsedEndpoint.toString();
  } catch {
    throw new JobRequisitionDraftAdapterError(
      "INVALID_CONFIGURATION",
      "OPENAI_RESPONSES_ENDPOINT must be a valid HTTP(S) URL",
    );
  }
}

function extractOutputText(body: ResponsesApiBody): { text: string | null; refusal: boolean } {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return { text: body.output_text, refusal: false };
  }
  if (!Array.isArray(body.output)) return { text: null, refusal: false };

  let text: string | null = null;
  let refusal = false;
  for (const item of body.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const typedPart = part as { type?: unknown; text?: unknown; refusal?: unknown };
      if (typedPart.type === "refusal" || typeof typedPart.refusal === "string") refusal = true;
      if (typedPart.type === "output_text" && typeof typedPart.text === "string") {
        text = text === null ? typedPart.text : `${text}${typedPart.text}`;
      }
    }
  }
  return { text: text?.trim() ? text : null, refusal };
}

export function createJobRequisitionDraftAdapter(
  options: JobRequisitionDraftAdapterOptions,
): JobRequisitionDraftAdapter {
  requireServerRuntime();
  if (!options.apiKey.trim() || !options.model.trim()) {
    throw new JobRequisitionDraftAdapterError(
      "INVALID_CONFIGURATION",
      "apiKey and model are required for the server adapter",
    );
  }

  const endpoint = resolveEndpoint(options.endpoint);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new JobRequisitionDraftAdapterError(
      "INVALID_CONFIGURATION",
      `timeoutMs must be a positive integer no greater than ${MAX_TIMEOUT_MS}`,
    );
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new JobRequisitionDraftAdapterError(
      "INVALID_CONFIGURATION",
      "A fetch implementation is required in this server runtime",
    );
  }

  const versions: JobRequisitionDraftContractVersions = {
    model: options.model,
    pipeline: JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.pipeline,
    prompt: JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.prompt,
    schema: JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.schema,
  };

  const generate = async (input: JobRequisitionDraftPromptInput) => {
    const promptInput = jobRequisitionDraftPromptInputSchema.parse({
      ...input,
      author_brief: input.author_brief ?? null,
    });
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
          input: [
            { role: "system", content: JOB_REQUISITION_DRAFT_SYSTEM_PROMPT },
            { role: "user", content: buildJobRequisitionDraftPrompt(promptInput) },
          ],
          text: { format: jobRequisitionDraftResponseFormat },
        }),
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new JobRequisitionDraftAdapterError("TIMEOUT", "OpenAI Responses request timed out");
      }
      throw new JobRequisitionDraftAdapterError(
        "NETWORK_ERROR",
        "OpenAI Responses request failed before receiving a response",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new JobRequisitionDraftAdapterError(
        "HTTP_ERROR",
        `OpenAI Responses request failed with status ${response.status}`,
      );
    }

    let body: ResponsesApiBody;
    try {
      const decoded = await response.json();
      if (!decoded || typeof decoded !== "object") throw new Error("missing response object");
      body = decoded as ResponsesApiBody;
    } catch {
      throw new JobRequisitionDraftAdapterError(
        "INVALID_JSON",
        "OpenAI returned a response that was not valid JSON",
      );
    }

    if (body.status === "incomplete") {
      throw new JobRequisitionDraftAdapterError(
        "INCOMPLETE",
        "OpenAI returned an incomplete job requisition draft",
      );
    }
    const output = extractOutputText(body);
    if (output.refusal) {
      throw new JobRequisitionDraftAdapterError(
        "REFUSAL",
        "OpenAI refused to produce a job requisition draft",
      );
    }
    if (!output.text) {
      throw new JobRequisitionDraftAdapterError(
        "MISSING_OUTPUT",
        "OpenAI returned no job requisition draft output",
      );
    }

    try {
      return { draft: parseJobRequisitionDraft(JSON.parse(output.text) as unknown), versions };
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new JobRequisitionDraftAdapterError(
          "INVALID_JSON",
          "OpenAI job requisition draft output was not valid JSON",
        );
      }
      throw new JobRequisitionDraftAdapterError(
        "INVALID_SCHEMA",
        "OpenAI job requisition draft output failed the strict runtime schema",
      );
    }
  };

  return Object.assign(generate, { versions }) as JobRequisitionDraftAdapter;
}

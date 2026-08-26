import { describe, expect, it, vi } from "vitest";

import { createScorecardDraftAdapter, ScorecardDraftAdapterError } from "./server";

const rawJobDescription =
  "Build reliable backend services. Experience operating production services and responding to incidents is required. Clear written communication is preferred.";

const draft = {
  contract: "SCORECARD_DRAFT",
  draft_only: true,
  ambiguous_phrases: [],
  criteria: [
    {
      client_id: "criterion-draft-1",
      name: "Production service operations",
      type: "REQUIRED",
      definition: "Experience operating production services.",
      accepted_evidence: ["Production service ownership is stated"],
      alternative_evidence: [],
      excluded_evidence: [],
      partial_evidence_guidance: "Production development is stated without ownership scope",
      evidence_fields: [{ field_name: "scope", description: "Operational scope" }],
      resume_assessable: true,
      source_phrase: "operating production services",
      ambiguity_note: null,
      ambiguity_status: "CLEAR",
      suggested_interview_question: null,
    },
  ],
};

describe("scorecard draft Responses adapter", () => {
  it("uses strict Structured Outputs and store:false without making a network call", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        model: string;
        store: boolean;
        max_output_tokens?: number;
        reasoning?: { effort?: string };
        text: { format: { strict: boolean; type: string; schema: unknown } };
      };
      expect(request.model).toBe("test-model");
      expect(request.store).toBe(false);
      expect(request.text.format.type).toBe("json_schema");
      expect(request.text.format.strict).toBe(true);
      expect(request.text.format.schema).toBeDefined();

      return new Response(
        JSON.stringify({ status: "completed", output_text: JSON.stringify(draft) }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const createDraft = createScorecardDraftAdapter({
      apiKey: "server-test-key",
      model: "test-model",
      endpoint: "https://example.test/v1/responses",
      timeoutMs: 45_000,
      maxOutputTokens: 3_500,
      reasoningEffort: "low",
      verbosity: "low",
      fetchImpl,
    });
    expect(createDraft.versions.model).toBe("test-model");
    const result = await createDraft({
      job_title: "Backend Engineer",
      raw_job_description: rawJobDescription,
      human_clarification: null,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.draft.draft_only).toBe(true);
    expect(result.versions).toEqual({
      model: "test-model",
      pipeline: "ai-pipeline-v2",
      prompt: "scorecard-draft-prompt-v4",
      schema: "scorecard-draft-schema-v3",
    });
  });

  it("bounds the Review Framework draft request for an interactive workflow", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        max_output_tokens?: number;
        reasoning?: { effort?: string };
        text?: { verbosity?: string };
      };
      expect(request.max_output_tokens).toBe(3_500);
      expect(request.reasoning?.effort).toBe("low");
      expect(request.text?.verbosity).toBe("low");
      return new Response(
        JSON.stringify({ status: "completed", output_text: JSON.stringify(draft) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const createDraft = createScorecardDraftAdapter({
      apiKey: "server-test-key",
      model: "test-model",
      endpoint: "https://example.test/v1/responses",
      timeoutMs: 45_000,
      maxOutputTokens: 3_500,
      reasoningEffort: "low",
      verbosity: "low",
      fetchImpl,
    });

    await createDraft({
      job_title: "Backend Engineer",
      raw_job_description: rawJobDescription,
      human_clarification: null,
    });
  });

  it("drops an unsupported source phrase instead of retaining it as a citation", async () => {
    const invalidSourceDraft = structuredClone(draft);
    invalidSourceDraft.criteria[0].source_phrase = "paraphrased production operations experience";

    const createDraft = createScorecardDraftAdapter({
      apiKey: "server-test-key",
      model: "test-model",
      endpoint: "https://example.test/v1/responses",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output_text: JSON.stringify(invalidSourceDraft),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    const result = await createDraft({
      job_title: "Backend Engineer",
      raw_job_description: rawJobDescription,
      human_clarification: null,
    });

    expect(result.draft.criteria[0]?.source_phrase).toBeNull();
    expect(result.draft.criteria[0]?.name).toBe("Production service operations");
  });

  it("does not treat refusals as retryable network failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [{ type: "message", content: [{ type: "refusal", refusal: "unsafe" }] }],
          }),
          { status: 200 },
        ),
    );

    const createDraft = createScorecardDraftAdapter({
      apiKey: "server-test-key",
      model: "test-model",
      endpoint: "https://example.test/v1/responses",
      fetchImpl,
    });

    await expect(
      createDraft({
        job_title: "Backend Engineer",
        raw_job_description: rawJobDescription,
        human_clarification: null,
      }),
    ).rejects.toMatchObject({ code: "REFUSAL" } satisfies Partial<ScorecardDraftAdapterError>);
  });

  it("retains only safe diagnostics for an HTTP failure", async () => {
    const createDraft = createScorecardDraftAdapter({
      apiKey: "server-test-key",
      model: "test-model",
      endpoint: "https://example.test/v1/responses",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "do not expose this" } }), {
          status: 403,
          headers: { "x-request-id": "req_test_456" },
        }),
    });

    await expect(
      createDraft({
        job_title: "Backend Engineer",
        raw_job_description: rawJobDescription,
        human_clarification: null,
      }),
    ).rejects.toMatchObject({
      code: "HTTP_ERROR",
      diagnostic: { httpStatus: 403, openAiRequestId: "req_test_456" },
    } satisfies Partial<ScorecardDraftAdapterError>);
  });
});

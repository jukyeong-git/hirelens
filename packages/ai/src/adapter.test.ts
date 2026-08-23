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
      pipeline: "ai-pipeline-v1",
      prompt: "scorecard-draft-prompt-v1",
      schema: "scorecard-draft-schema-v1",
    });
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
});

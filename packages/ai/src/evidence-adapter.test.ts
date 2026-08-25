import { describe, expect, it, vi } from "vitest";

import { createEvidenceAdapter, EvidenceAdapterError } from "./evidence-adapter";

const criterionId = "10000000-0000-0000-0000-000000000001";
const input = {
  criteria: [
    {
      criterion_id: criterionId,
      name: "Production operations",
      type: "REQUIRED" as const,
      definition: "Production operations",
      accepted_evidence: ["Stated operations responsibility"],
      alternative_evidence: [],
      partial_evidence_guidance: "Development without operations responsibility",
      evidence_fields: [{ field_name: "scope", description: "Operations scope" }],
      resume_assessable: true,
      suggested_interview_question: null,
    },
  ],
  pages: [{ page_number: 1, text: "Built and operated production services." }],
};
const output = {
  results: [
    {
      criterion_id: criterionId,
      status: "SUPPORTED",
      evidence: [{ page_number: 1, exact_quote: "operated production services" }],
      interpretation: "Direct operations evidence is stated.",
      uncertainty: null,
      suggested_interview_question: null,
    },
  ],
};

function adapter(
  fetchImpl: typeof fetch,
  overrides: Partial<Parameters<typeof createEvidenceAdapter>[0]> = {},
) {
  return createEvidenceAdapter({
    apiKey: "test-key",
    model: "test-model",
    maxInputTokens: 20_000,
    maxOutputTokens: 1_000,
    maxTotalTokens: 21_000,
    inputCostMicrousdPerMillionTokens: 1_000_000,
    outputCostMicrousdPerMillionTokens: 2_000_000,
    maxCostMicrousdPerRun: 100_000,
    fetchImpl,
    ...overrides,
  });
}

describe("evidence Responses adapter", () => {
  it("uses strict Structured Outputs, store:false, caps, usage, and source validation", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        store: boolean;
        max_output_tokens: number;
        text: { format: { strict: boolean } };
        input: unknown[];
      };
      expect(request.store).toBe(false);
      expect(request.max_output_tokens).toBe(1_000);
      expect(request.text.format.strict).toBe(true);
      expect(JSON.stringify(request.input)).not.toContain("test-key");
      return new Response(
        JSON.stringify({
          id: "resp_test",
          status: "completed",
          output_text: JSON.stringify(output),
          usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 },
        }),
        { status: 200 },
      );
    });
    const result = await adapter(fetchImpl)(input);
    expect(result.evidence).toEqual(output);
    expect(result.usage).toMatchObject({
      providerRequestId: "resp_test",
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      estimatedCostMicrousd: 280,
    });
    expect(result.versions).toMatchObject({
      model: "test-model",
      prompt: "evidence-extraction-prompt-v2",
      schema: "evidence-extraction-schema-v2",
    });
  });

  it("rejects a fabricated quote and does not retry a refusal", async () => {
    const fabricatedFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output_text: JSON.stringify({
              results: [
                { ...output.results[0], evidence: [{ page_number: 1, exact_quote: "fabricated" }] },
              ],
            }),
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          }),
          { status: 200 },
        ),
    );
    await expect(adapter(fabricatedFetch)(input)).rejects.toMatchObject({
      code: "QUOTE_MISMATCH",
      quarantined: true,
    } satisfies Partial<EvidenceAdapterError>);
    const refusalFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [{ content: [{ type: "refusal", refusal: "policy" }] }],
          }),
          { status: 200 },
        ),
    );
    await expect(adapter(refusalFetch)(input)).rejects.toMatchObject({
      code: "REFUSAL",
      retryable: false,
    } satisfies Partial<EvidenceAdapterError>);
  });

  it("blocks requests before network when the configured run budget is exceeded", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(adapter(fetchImpl, { maxInputTokens: 10 })(input)).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    } satisfies Partial<EvidenceAdapterError>);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

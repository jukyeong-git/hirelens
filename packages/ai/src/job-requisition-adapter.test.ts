import { describe, expect, it, vi } from "vitest";

import { createJobRequisitionDraftAdapter, JobRequisitionDraftAdapterError } from "./server";
import type { JobRequisitionDraftAdapterErrorCode } from "./server";

const input = {
  title: "Backend Engineer",
  department: "Platform Engineering",
};
const draft = {
  role_summary: "Build and operate reliable backend services.",
  responsibilities: "Design service APIs and improve operational reliability.",
  requirements: "Production backend development or operations experience.",
  preferred_qualifications: "Experience operating high-traffic services.",
};

function createAdapter(fetchImpl: typeof fetch) {
  return createJobRequisitionDraftAdapter({
    apiKey: "server-test-key",
    model: "test-model",
    endpoint: "https://example.test/v1/responses",
    fetchImpl,
  });
}

const failureCases: ReadonlyArray<readonly [string, unknown, JobRequisitionDraftAdapterErrorCode]> =
  [
    [
      "refusal",
      { status: "completed", output: [{ content: [{ type: "refusal", refusal: "unsafe" }] }] },
      "REFUSAL",
    ],
    ["incomplete", { status: "incomplete" }, "INCOMPLETE"],
    [
      "malformed output",
      { status: "completed", output_text: JSON.stringify({ ...draft, scorecard: [] }) },
      "INVALID_SCHEMA",
    ],
  ];

describe("job requisition draft Responses adapter", () => {
  it("uses strict Structured Outputs and store:false", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_request, init) => {
      const body = JSON.parse(String(init?.body)) as {
        store: boolean;
        text: { format: { name: string; strict: boolean; type: string } };
      };
      expect(body.store).toBe(false);
      expect(body.text.format).toMatchObject({
        name: "hirelens_job_requisition_draft",
        strict: true,
        type: "json_schema",
      });
      return new Response(
        JSON.stringify({ status: "completed", output_text: JSON.stringify(draft) }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    const result = await createAdapter(fetchImpl)(input);
    expect(result.draft).toEqual(draft);
    expect(result.versions).toEqual({
      model: "test-model",
      pipeline: "ai-pipeline-v1",
      prompt: "job-requisition-draft-prompt-v4",
      schema: "job-requisition-draft-schema-v2",
    });
  });

  it.each(failureCases)(
    "categorizes %s without treating it as a successful draft",
    async (_name, responseBody, code) => {
      const adapter = createAdapter(
        vi.fn<typeof fetch>(
          async () => new Response(JSON.stringify(responseBody), { status: 200 }),
        ),
      );

      await expect(adapter(input)).rejects.toMatchObject({
        code,
      } satisfies Partial<JobRequisitionDraftAdapterError>);
    },
  );

  it("rejects an unbounded timeout configuration", () => {
    expect(() =>
      createJobRequisitionDraftAdapter({
        apiKey: "server-test-key",
        model: "test-model",
        endpoint: "https://example.test/v1/responses",
        timeoutMs: 60_001,
        fetchImpl: async () => new Response(),
      }),
    ).toThrow(/timeoutMs/u);
  });

  it("keeps HTTP diagnostics safe and excludes the response body", async () => {
    const adapter = createAdapter(
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: { message: "do not expose this" } }), {
            status: 429,
            headers: { "x-request-id": "req_test_123" },
          }),
      ),
    );

    await expect(adapter(input)).rejects.toMatchObject({
      code: "HTTP_ERROR",
      diagnostic: { httpStatus: 429, openAiRequestId: "req_test_123" },
    } satisfies Partial<JobRequisitionDraftAdapterError>);
  });

  it("rejects oversized input before it reaches the model adapter", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response());
    const adapter = createAdapter(fetchImpl);

    await expect(adapter({ ...input, title: "x".repeat(161) })).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(
      adapter({ ...input, hiring_need: "x".repeat(4_001) } as never),
    ).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

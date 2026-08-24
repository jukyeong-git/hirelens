import { describe, expect, it, vi } from "vitest";

import { createJobRequisitionDraftAdapter, JobRequisitionDraftAdapterError } from "./server";
import type { JobRequisitionDraftAdapterErrorCode } from "./server";

const input = {
  title: "Backend Engineer",
  department: "Platform Engineering",
  author_brief: "Build and operate reliable backend services.",
};
const draft = {
  contract: "JOB_REQUISITION_DRAFT",
  draft_only: true,
  raw_job_description:
    "Build and operate reliable backend services for the Platform Engineering team.",
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
      prompt: "job-requisition-draft-prompt-v1",
      schema: "job-requisition-draft-schema-v1",
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

  it("rejects oversized input before it reaches the model adapter", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response());
    const adapter = createAdapter(fetchImpl);

    await expect(adapter({ ...input, title: "x".repeat(161) })).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(adapter({ ...input, author_brief: "x".repeat(4_001) })).rejects.toMatchObject({
      name: "ZodError",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

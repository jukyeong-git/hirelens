import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildJobRequisitionDraftPrompt,
  JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS,
  JOB_REQUISITION_DRAFT_SCHEMA_NAME,
  JOB_REQUISITION_DRAFT_SYSTEM_PROMPT,
  jobRequisitionDraftContract,
  jobRequisitionDraftJsonSchema,
  jobRequisitionDraftPromptInputSchema,
  jobRequisitionDraftSchema,
  parseJobRequisitionDraft,
} from "./index";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/job-requisition-draft.valid.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

describe("job requisition draft contract", () => {
  it("accepts only the versioned editable draft response", () => {
    expect(parseJobRequisitionDraft(fixture)).toEqual(fixture);
  });

  it.each([
    ["a requisition approval field", "approval_status", "APPROVED"],
    ["a candidate ranking field", "candidate_ranking", []],
    ["a human decision field", "human_decision", "PROCEED"],
    ["a protected-trait field", "protected_trait", "age"],
    ["a personality field", "personality_assessment", "resilient"],
  ])("rejects %s", (_label, field, value) => {
    expect(jobRequisitionDraftSchema.safeParse({ ...fixture, [field]: value }).success).toBe(false);
  });

  it("exposes a strict Structured Outputs schema with exactly the response fields", () => {
    expect(jobRequisitionDraftJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["contract", "draft_only", "raw_job_description"],
    });
    expect(Object.keys(jobRequisitionDraftJsonSchema.properties)).toEqual([
      "contract",
      "draft_only",
      "raw_job_description",
    ]);
    expect(jobRequisitionDraftContract.responseFormat).toMatchObject({
      name: JOB_REQUISITION_DRAFT_SCHEMA_NAME,
      strict: true,
      schema: jobRequisitionDraftJsonSchema,
    });
  });

  it("keeps the prompt and schema versions attached to the matching contract", () => {
    const prompt = buildJobRequisitionDraftPrompt({
      title: "Backend Engineer",
      department: "Platform Engineering",
    });

    expect(prompt).toContain(JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.prompt);
    expect(prompt).toContain("JOB_REQUISITION_DRAFT");
    expect(prompt).toContain("<department>");
    expect(prompt).not.toContain("author_brief");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("Do not repeat the supplied title");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain('"역할 개요"');
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain('"주요 책임"');
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain('"자격 요건"');
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain('"우대 사항"');
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("Do not add any other section");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).not.toContain("복지 및 지원");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain(
      JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.prompt,
    );
    expect(jobRequisitionDraftContract.versions).toEqual(JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS);
    expect(jobRequisitionDraftContract.schemaName).toBe(JOB_REQUISITION_DRAFT_SCHEMA_NAME);
  });

  it("rejects unknown and oversized human prompt inputs", () => {
    expect(() =>
      buildJobRequisitionDraftPrompt({
        title: "Backend Engineer",
        department: "Platform Engineering",
        hiring_need: "Expand the backend team.",
        status: "APPROVED",
      } as never),
    ).toThrow();
    expect(
      jobRequisitionDraftPromptInputSchema.safeParse({
        title: "x".repeat(161),
        department: "Platform Engineering",
        author_brief: null,
      }).success,
    ).toBe(false);
    expect(
      jobRequisitionDraftPromptInputSchema.safeParse({
        title: "Backend Engineer",
        department: "x".repeat(161),
        author_brief: null,
      }).success,
    ).toBe(false);
    expect(
      jobRequisitionDraftPromptInputSchema.safeParse({
        title: "Backend Engineer",
        department: "Platform Engineering",
        author_brief: "Keep this out of the AI request.",
      }).success,
    ).toBe(false);
  });
});

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
      required: ["role_summary", "responsibilities", "requirements", "preferred_qualifications"],
    });
    expect(Object.keys(jobRequisitionDraftJsonSchema.properties)).toEqual([
      "role_summary",
      "responsibilities",
      "requirements",
      "preferred_qualifications",
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
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("role_summary");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("responsibilities");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("requirements");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("preferred_qualifications");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("Do not add extra sections");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).not.toContain("복지 및 지원");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain("internal hiring reason");
    expect(JOB_REQUISITION_DRAFT_SYSTEM_PROMPT).toContain(
      JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.prompt,
    );
    expect(jobRequisitionDraftContract.versions).toEqual(JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS);
    expect(jobRequisitionDraftContract.schemaName).toBe(JOB_REQUISITION_DRAFT_SCHEMA_NAME);
  });

  it.each(["role_summary", "responsibilities", "requirements", "preferred_qualifications"])(
    "rejects an empty %s property",
    (field) => {
      expect(jobRequisitionDraftSchema.safeParse({ ...fixture, [field]: "   " }).success).toBe(
        false,
      );
    },
  );

  it("keeps the role summary within the saveable domain limit", () => {
    expect(
      jobRequisitionDraftSchema.safeParse({
        ...fixture,
        role_summary: "x".repeat(4_000),
      }).success,
    ).toBe(true);
    expect(
      jobRequisitionDraftSchema.safeParse({
        ...fixture,
        role_summary: "x".repeat(4_001),
      }).success,
    ).toBe(false);
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

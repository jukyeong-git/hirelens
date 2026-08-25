import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildScorecardDraftPrompt,
  SCORECARD_DRAFT_CONTRACT_VERSIONS,
  SCORECARD_DRAFT_SYSTEM_PROMPT,
  scorecardDraftContract,
  scorecardDraftJsonSchema,
  scorecardDraftSchema,
  validateScorecardDraft,
} from "./index";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/scorecard-draft.valid.json", import.meta.url), "utf8"),
) as unknown;

const rawJobDescription =
  "Build reliable backend services. Experience operating production services and responding to incidents is required. Clear written communication is preferred.";

describe("scorecard draft contract", () => {
  it("accepts the versioned draft fixture and validates source phrases", () => {
    const draft = validateScorecardDraft(fixture, { raw_job_description: rawJobDescription });

    expect(draft.contract).toBe("SCORECARD_DRAFT");
    expect(draft.draft_only).toBe(true);
    expect(draft.criteria[0]?.type).toBe("REQUIRED");
    expect(draft.criteria[1]?.resume_assessable).toBe(false);
  });

  it("exposes a strict JSON Schema synchronized with the runtime contract", () => {
    expect(scorecardDraftJsonSchema.type).toBe("object");
    expect(scorecardDraftJsonSchema.additionalProperties).toBe(false);
    expect(scorecardDraftJsonSchema.required).toEqual(
      expect.arrayContaining(["contract", "draft_only", "ambiguous_phrases", "criteria"]),
    );

    const parsed = scorecardDraftSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
    expect(JSON.stringify(scorecardDraftJsonSchema)).not.toMatch(
      /fit_score|hiring_decision|protected_trait_inference/iu,
    );
  });

  it("locks Review Framework v3 prompt and schema provenance", () => {
    expect(SCORECARD_DRAFT_CONTRACT_VERSIONS).toEqual({
      pipeline: "ai-pipeline-v2",
      prompt: "scorecard-draft-prompt-v3",
      schema: "scorecard-draft-schema-v2",
    });
    expect(scorecardDraftContract.versions).toBe(SCORECARD_DRAFT_CONTRACT_VERSIONS);
    expect(SCORECARD_DRAFT_SYSTEM_PROMPT).toContain(
      `Contract version: ${SCORECARD_DRAFT_CONTRACT_VERSIONS.prompt}`,
    );
  });

  it.each([
    ["a missing value", undefined],
    ["blank guidance", "   "],
    ["guidance over 1,000 characters", "x".repeat(1_001)],
  ])("rejects partial_evidence_guidance with %s", (_case, partialEvidenceGuidance) => {
    const invalid = JSON.parse(JSON.stringify(fixture)) as {
      criteria: Array<Record<string, unknown>>;
    };

    if (partialEvidenceGuidance === undefined) {
      delete invalid.criteria[0]?.partial_evidence_guidance;
    } else if (invalid.criteria[0]) {
      invalid.criteria[0].partial_evidence_guidance = partialEvidenceGuidance;
    }

    expect(scorecardDraftSchema.safeParse(invalid).success).toBe(false);
  });

  it.each([
    ["fit_score", 0.8],
    ["candidate_ranking", 1],
    ["hiring_decision", "PROCEED"],
  ])("rejects forbidden top-level %s output", (field, value) => {
    expect(scorecardDraftSchema.safeParse({ ...(fixture as object), [field]: value }).success).toBe(
      false,
    );
  });

  it("rejects unknown decision or protected-trait criterion fields", () => {
    expect(
      scorecardDraftSchema.safeParse({
        ...(fixture as { criteria: unknown[] }),
        criteria: [
          {
            ...(fixture as { criteria: Array<Record<string, unknown>> }).criteria[0],
            protected_trait_inference: "age",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      scorecardDraftSchema.safeParse({
        ...(fixture as { criteria: unknown[] }),
        criteria: [
          {
            ...(fixture as { criteria: Array<Record<string, unknown>> }).criteria[0],
            hiring_decision: "PROCEED",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects resume-assessable interview-only criteria and fabricated source phrases", () => {
    const invalid = JSON.parse(JSON.stringify(fixture)) as {
      criteria: Array<Record<string, unknown>>;
    };
    invalid.criteria[1] = {
      ...invalid.criteria[1],
      resume_assessable: true,
      source_phrase: "not in the job description",
    };

    expect(() =>
      validateScorecardDraft(invalid, { raw_job_description: rawJobDescription }),
    ).toThrow(/resume_assessable|source_phrase/iu);
  });

  it("builds a versioned prompt from validated input", () => {
    const prompt = buildScorecardDraftPrompt({
      job_title: "Backend Engineer",
      raw_job_description: rawJobDescription,
      human_clarification: null,
    });

    expect(prompt).toContain("<job_description>");
    expect(prompt).toContain(SCORECARD_DRAFT_CONTRACT_VERSIONS.prompt);
    expect(prompt).toContain("SCORECARD_DRAFT");
  });
});

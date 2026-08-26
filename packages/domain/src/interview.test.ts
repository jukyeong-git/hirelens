import { describe, expect, it } from "vitest";

import { interviewObservationInputSchema, postInterviewReviewInputSchema } from "./interview";

const criterionId = "10000000-0000-0000-0000-000000000001";

describe("interviewObservationInputSchema", () => {
  it("accepts a WEAKER observation with a weakness type", () => {
    expect(
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "WEAKER",
        weaknessType: "LEVEL_INSUFFICIENT",
        note: "Production scope was not demonstrated.",
      }),
    ).toMatchObject({ verdict: "WEAKER", weaknessType: "LEVEL_INSUFFICIENT" });
  });

  it("rejects WEAKER without a weakness type", () => {
    expect(() =>
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "WEAKER",
        weaknessType: null,
        note: null,
      }),
    ).toThrow(/require a weakness type/u);
  });

  it("rejects a weakness type on a non-WEAKER verdict", () => {
    expect(() =>
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "MATCHED",
        weaknessType: "FALSE_CLAIM",
        note: null,
      }),
    ).toThrow(/Only WEAKER/u);
  });

  it("rejects unknown keys", () => {
    expect(() =>
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "MATCHED",
        weaknessType: null,
        note: null,
        decision: "PROCEED",
      }),
    ).toThrow();
  });
});

describe("postInterviewReviewInputSchema", () => {
  it("rejects duplicate criterion observations", () => {
    const observation = {
      criterionId,
      verdict: "MATCHED" as const,
      weaknessType: null,
      note: null,
    };
    expect(() =>
      postInterviewReviewInputSchema.parse({
        applicationId: "20000000-0000-0000-0000-000000000001",
        scorecardVersionId: "30000000-0000-0000-0000-000000000001",
        observations: [observation, observation],
        offCriteriaReason: null,
        decision: "PROCEED",
        reasonCode: "EVIDENCE_REVIEW",
        reasonDetail: "Interview evidence was reviewed.",
        confidence: "MEDIUM",
        note: null,
      }),
    ).toThrow(/must be unique/u);
  });
});

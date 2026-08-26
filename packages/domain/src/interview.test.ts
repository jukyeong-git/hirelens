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

  it("defaults an observation with no stated provenance to a hand-filled form", () => {
    expect(
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "MATCHED",
        weaknessType: null,
        note: null,
      }),
    ).toMatchObject({ source: "FORM", aiDraftAccepted: null });
  });

  it("accepts a transcript-derived observation the interviewer has not confirmed", () => {
    expect(
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "WEAKER",
        weaknessType: "LEVEL_INSUFFICIENT",
        note: null,
        source: "TRANSCRIPT",
        aiDraftAccepted: false,
      }),
    ).toMatchObject({ source: "TRANSCRIPT", aiDraftAccepted: false });
  });

  it("rejects a drafted observation that does not state acceptance", () => {
    expect(() =>
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "MATCHED",
        weaknessType: null,
        note: null,
        source: "TRANSCRIPT",
        aiDraftAccepted: null,
      }),
    ).toThrow(/must state whether the draft was accepted/u);
  });

  it("rejects a form observation that claims to accept a draft", () => {
    expect(() =>
      interviewObservationInputSchema.parse({
        criterionId,
        verdict: "MATCHED",
        weaknessType: null,
        note: null,
        source: "FORM",
        aiDraftAccepted: true,
      }),
    ).toThrow(/no draft to accept/u);
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

import { describe, expect, it } from "vitest";

import {
  createHumanReviewInputSchema,
  createReviewNoteInputSchema,
  recordInterviewProgressionInputSchema,
  requestHiringManagerReviewInputSchema,
} from "./review";

const ids = {
  applicationId: "50000000-0000-0000-0000-000000000001",
  scorecardVersionId: "20000000-0000-0000-0000-000000000001",
};

describe("review contracts", () => {
  it("requires a reason for every human decision", () => {
    expect(
      createHumanReviewInputSchema.safeParse({
        ...ids,
        decision: "PROCEED",
        confidence: "HIGH",
        reasonCode: "",
        reasonDetail: "",
      }).success,
    ).toBe(false);
  });

  it("accepts an explicit human-only decision payload", () => {
    expect(
      createHumanReviewInputSchema.safeParse({
        ...ids,
        decision: "HOLD",
        confidence: "MEDIUM",
        reasonCode: "INTERVIEW_REQUIRED",
        reasonDetail: "Confirm operational ownership during the interview.",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty recruiter note", () => {
    expect(
      createReviewNoteInputSchema.safeParse({ applicationId: ids.applicationId, body: "  " })
        .success,
    ).toBe(false);
  });

  it("keeps a review request separate from an interview outcome", () => {
    expect(
      requestHiringManagerReviewInputSchema.safeParse({
        applicationId: ids.applicationId,
        note: "Please review the source-linked evidence.",
      }).success,
    ).toBe(true);
    expect(
      recordInterviewProgressionInputSchema.safeParse({
        ...ids,
        outcome: "INTERVIEW",
        reason: "The human reviewer confirmed the evidence supports an interview.",
      }).success,
    ).toBe(true);
  });

  it("requires a reason for every interview progression outcome", () => {
    expect(
      recordInterviewProgressionInputSchema.safeParse({
        ...ids,
        outcome: "HOLD",
        reason: " ",
      }).success,
    ).toBe(false);
  });
});

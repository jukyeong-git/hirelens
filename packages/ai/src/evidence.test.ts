import { describe, expect, it } from "vitest";

import {
  evidenceExtractionSchema,
  validateEvidenceExtraction,
  EvidenceValidationError,
} from "./index";

const validEvidence = {
  results: [
    {
      criterion_id: "criterion-1",
      status: "SUPPORTED",
      evidence: [{ page_number: 2, exact_quote: "Built reliable backend services." }],
      interpretation: "The resume states backend service delivery.",
      uncertainty: null,
      suggested_interview_question: "What was your operational responsibility?",
    },
    {
      criterion_id: "criterion-2",
      status: "NOT_FOUND",
      evidence: [],
      interpretation: "No supporting evidence was found in the submitted material.",
      uncertainty: "The submitted material may not describe every capability.",
      suggested_interview_question: "What production incident did you handle?",
    },
  ],
};

describe("evidence contract boundary", () => {
  it("requires evidence for evidence-bearing statuses and none for NOT_FOUND", () => {
    expect(evidenceExtractionSchema.safeParse(validEvidence).success).toBe(true);
    expect(
      evidenceExtractionSchema.safeParse({
        results: [
          { ...validEvidence.results[1], evidence: [{ page_number: 1, exact_quote: "made up" }] },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown criteria, out-of-range pages, and fabricated quotes", () => {
    const context = {
      allowedCriterionIds: new Set(["criterion-1"]),
      pageCount: 2,
      pageTextByNumber: new Map([
        [1, "Summary"],
        [2, "Built reliable backend services."],
      ]),
    };

    expect(() => validateEvidenceExtraction(validEvidence, context)).toThrowError(
      EvidenceValidationError,
    );

    try {
      validateEvidenceExtraction(validEvidence, context);
    } catch (error) {
      expect(error).toBeInstanceOf(EvidenceValidationError);
      expect((error as EvidenceValidationError).issues.map((issue) => issue.code)).toEqual([
        "UNKNOWN_CRITERION",
      ]);
    }

    expect(() =>
      validateEvidenceExtraction(
        {
          results: [
            {
              ...validEvidence.results[0],
              evidence: [{ page_number: 3, exact_quote: "Built reliable backend services." }],
            },
          ],
        },
        context,
      ),
    ).toThrow(/page bounds/iu);

    expect(() =>
      validateEvidenceExtraction(
        {
          results: [
            {
              ...validEvidence.results[0],
              evidence: [{ page_number: 2, exact_quote: "fabricated quote" }],
            },
          ],
        },
        context,
      ),
    ).toThrow(/exact normalized substring/iu);
  });
});

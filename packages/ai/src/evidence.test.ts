import { describe, expect, it } from "vitest";

import {
  buildEvidencePrompt,
  EVIDENCE_CONTRACT_VERSIONS,
  EVIDENCE_SCHEMA_NAME,
  EVIDENCE_SYSTEM_PROMPT,
  evidenceExtractionSchema,
  validateEvidenceExtraction,
  EvidenceValidationError,
} from "./index";
import { evidencePromptInputSchema } from "./evidence";

const validEvidence = {
  results: [
    {
      criterion_id: "10000000-0000-0000-0000-000000000001",
      status: "SUPPORTED",
      evidence: [{ page_number: 2, exact_quote: "Built reliable backend services." }],
      interpretation: "The resume states backend service delivery.",
      uncertainty: null,
      suggested_interview_question: "What was your operational responsibility?",
    },
    {
      criterion_id: "10000000-0000-0000-0000-000000000002",
      status: "NOT_FOUND",
      evidence: [],
      interpretation: "No supporting evidence was found in the submitted material.",
      uncertainty: "The submitted material may not describe every capability.",
      suggested_interview_question: "What production incident did you handle?",
    },
  ],
};

const promptCriterion = {
  criterion_id: "10000000-0000-0000-0000-000000000001",
  name: "Production operations",
  type: "REQUIRED" as const,
  definition: "Operate production services with direct responsibility.",
  accepted_evidence: ["Direct production ownership"],
  alternative_evidence: ["Equivalent on-call responsibility"],
  partial_evidence_guidance: "Production development without stated operational ownership",
  evidence_fields: [{ field_name: "operational_scope", description: "Scope owned directly" }],
  resume_assessable: true,
  suggested_interview_question: "Which production responsibilities did you own?",
};

describe("evidence contract boundary", () => {
  it("locks v2 prompt/schema provenance and includes the complete approved criterion context", () => {
    const prompt = JSON.parse(
      buildEvidencePrompt({
        criteria: [promptCriterion],
        pages: [{ page_number: 1, text: "Synthetic production operations evidence." }],
      }),
    ) as {
      contract_version: string;
      approved_criteria: unknown[];
    };

    expect(EVIDENCE_CONTRACT_VERSIONS).toEqual({
      pipeline: "evidence-pipeline-v1",
      prompt: "evidence-extraction-prompt-v2",
      schema: "evidence-extraction-schema-v2",
    });
    expect(EVIDENCE_SCHEMA_NAME).toBe("hirelens_evidence_extraction_v2");
    expect(EVIDENCE_SYSTEM_PROMPT).toContain(
      `Contract version: ${EVIDENCE_CONTRACT_VERSIONS.prompt}`,
    );
    expect(EVIDENCE_SYSTEM_PROMPT).toMatch(/partial-evidence guidance/iu);
    expect(prompt.contract_version).toBe(EVIDENCE_CONTRACT_VERSIONS.prompt);
    expect(prompt.approved_criteria).toEqual([promptCriterion]);
  });

  it.each([
    ["a missing value", undefined],
    ["blank guidance", "   "],
    ["guidance over 1,000 characters", "x".repeat(1_001)],
  ])("rejects evidence prompt partial_evidence_guidance with %s", (_case, guidance) => {
    const invalidCriterion: Record<string, unknown> = { ...promptCriterion };
    if (guidance === undefined) delete invalidCriterion.partial_evidence_guidance;
    else invalidCriterion.partial_evidence_guidance = guidance;

    expect(
      evidencePromptInputSchema.safeParse({
        criteria: [invalidCriterion],
        pages: [{ page_number: 1, text: "Synthetic evidence." }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["fit_score", 0.8],
    ["candidate_ranking", 1],
    ["hiring_decision", "PROCEED"],
  ])("rejects forbidden top-level and criterion-level %s output", (field, value) => {
    expect(evidenceExtractionSchema.safeParse({ ...validEvidence, [field]: value }).success).toBe(
      false,
    );
    expect(
      evidenceExtractionSchema.safeParse({
        results: [{ ...validEvidence.results[0], [field]: value }],
      }).success,
    ).toBe(false);
  });

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
      allowedCriterionIds: new Set(["10000000-0000-0000-0000-000000000001"]),
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
    ).toThrow(/resume bounds/iu);

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

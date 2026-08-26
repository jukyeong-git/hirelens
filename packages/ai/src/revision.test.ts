import { describe, expect, it } from "vitest";

import {
  frameworkRevisionPromptInputSchema,
  validateFrameworkRevision,
  FrameworkRevisionValidationError,
} from "./revision";

const input = frameworkRevisionPromptInputSchema.parse({
  finding_lineage_id: "11111111-1111-4111-8111-111111111111",
  finding: {
    supported_observations: 5,
    level_insufficient_count: 3,
    mismatch_ratio: 0.6,
    confirmed_observation_count: 5,
    false_claim_excluded_count: 1,
    ai_misread_excluded_count: 0,
  },
  current_criterion: {
    name: "Production operations",
    type: "REQUIRED",
    definition: "Operate production services.",
    accepted_evidence: ["Production technology use"],
    alternative_evidence: [],
    excluded_evidence: [],
    partial_evidence_guidance: null,
    evidence_fields: [],
    resume_assessable: true,
    suggested_interview_question: null,
  },
  mismatch_quotes: ["Built a deployment pipeline."],
  matched_quotes: ["Owned production incidents."],
});

const validRevision = {
  finding_lineage_id: input.finding_lineage_id,
  change_type: "ADD_EXCLUSION",
  before: {
    accepted_evidence: input.current_criterion.accepted_evidence,
    excluded_evidence: input.current_criterion.excluded_evidence,
  },
  after: {
    ...input.current_criterion,
    accepted_evidence: ["Production responsibility and outcome"],
    excluded_evidence: ["Technology mention without responsibility"],
  },
  rationale: "Confirmed observations show that technology mention alone is too broad.",
};

describe("framework revision contract", () => {
  it("accepts a finding-bound, human-reviewable exclusion proposal", () => {
    expect(validateFrameworkRevision(validRevision, input).change_type).toBe("ADD_EXCLUSION");
  });

  it("rejects a proposal linked to a different finding", () => {
    expect(() =>
      validateFrameworkRevision(
        {
          ...validRevision,
          finding_lineage_id: "22222222-2222-4222-8222-222222222222",
        },
        input,
      ),
    ).toThrowError(FrameworkRevisionValidationError);
  });

  it("rejects protected-trait criterion language", () => {
    expect(() =>
      validateFrameworkRevision(
        {
          ...validRevision,
          after: { ...validRevision.after, definition: "Prefer candidates by age." },
        },
        input,
      ),
    ).toThrowError(/protected/iu);
  });
});

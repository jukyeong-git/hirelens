import { describe, expect, it } from "vitest";

import {
  scorecardAmbiguityReviewInputSchema,
  scorecardApprovalInputSchema,
  scorecardDraftSchema,
  scorecardDraftUpdateInputSchema,
  scorecardIssueConfirmationInputSchema,
  scorecardCriterionReviewSnapshotSchema,
} from "./scorecard";

const validCriterion = {
  client_id: "criterion-1",
  name: "운영 환경 백엔드 개발 경험",
  type: "REQUIRED" as const,
  definition: "운영 서비스에서 백엔드 시스템을 개발하고 운영한 경험",
  accepted_evidence: ["운영 서비스 책임 범위"],
  alternative_evidence: [],
  partial_evidence_guidance: "개발 경험은 있으나 운영 책임 범위가 확인되지 않음",
  evidence_fields: [{ field_name: "operational_scope", description: "운영 서비스 책임 범위" }],
  resume_assessable: true,
  source_phrase: "Build reliable backend services",
  ambiguity_note: null,
  ambiguity_status: "CLEAR" as const,
  suggested_interview_question: null,
  display_order: 0,
};

describe("scorecard persistence contract", () => {
  it("accepts a draft with explicit evidence fields and ambiguity metadata", () => {
    const result = scorecardDraftSchema.safeParse({
      ambiguous_phrases: [],
      criteria: [validCriterion],
    });

    expect(result.success).toBe(true);
  });

  it("accepts a manually authored draft without an AI source phrase", () => {
    const result = scorecardDraftSchema.safeParse({
      ambiguous_phrases: [],
      criteria: [{ ...validCriterion, source_phrase: null }],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["an unsupported criterion type", { type: "AUTOMATIC_DECISION" }],
    ["an unsupported ambiguity state", { ambiguity_status: "APPROVED" }],
    ["a resume-assessable criterion without accepted evidence", { accepted_evidence: [] }],
    ["an automatic hiring decision field", { decision: "PROCEED" }],
  ])("rejects a manual draft with %s", (_label, override) => {
    const result = scorecardDraftSchema.safeParse({
      ambiguous_phrases: [],
      criteria: [{ ...validCriterion, ...override }],
    });

    expect(result.success).toBe(false);
  });

  it("keeps human-only criteria out of resume assessment", () => {
    const result = scorecardDraftSchema.safeParse({
      ambiguous_phrases: [],
      criteria: [
        {
          ...validCriterion,
          client_id: "criterion-2",
          type: "INTERVIEW_ONLY",
          ambiguity_status: "HUMAN_ONLY",
          resume_assessable: true,
          accepted_evidence: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate criterion client ids", () => {
    const result = scorecardDraftSchema.safeParse({
      ambiguous_phrases: [],
      criteria: [validCriterion, { ...validCriterion, display_order: 1 }],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a human clarification with a stale-edit snapshot", () => {
    const snapshot = scorecardCriterionReviewSnapshotSchema.parse({
      type: "INTERVIEW_ONLY",
      definition: "협업 상황에서 기술적 맥락과 의사결정을 설명하는 방식",
      accepted_evidence: [],
      alternative_evidence: [],
      resume_assessable: false,
      ambiguity_status: "HUMAN_ONLY",
      suggested_interview_question: "복잡한 장애나 설계 결정을 설명해 주세요.",
    });
    const result = scorecardAmbiguityReviewInputSchema.safeParse({
      jobId: "10000000-0000-0000-0000-000000000001",
      scorecardVersionId: "20000000-0000-0000-0000-000000000001",
      criterionId: "30000000-0000-0000-0000-000000000002",
      resolution: "CLARIFY",
      criterionType: "PREFERRED",
      definition: "협업 상황에서 기술적 맥락과 의사결정을 문서와 사례로 설명한 경험",
      acceptedEvidence: ["장애나 설계 결정을 설명한 사례"],
      alternativeEvidence: ["문서화와 협업 산출물"],
      resumeAssessable: true,
      suggestedInterviewQuestion: "복잡한 장애나 설계 결정을 설명해 주세요.",
      reason: "이력서에서 확인할 수 있는 협업 산출물로 기준을 구체화함",
      expectedSnapshot: snapshot,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an interview-only resolution that remains resume-assessable", () => {
    const result = scorecardAmbiguityReviewInputSchema.safeParse({
      jobId: "10000000-0000-0000-0000-000000000001",
      scorecardVersionId: "20000000-0000-0000-0000-000000000001",
      criterionId: "30000000-0000-0000-0000-000000000002",
      resolution: "INTERVIEW_ONLY",
      criterionType: "INTERVIEW_ONLY",
      definition: "협업 방식을 면접에서 확인",
      acceptedEvidence: [],
      alternativeEvidence: [],
      resumeAssessable: true,
      suggestedInterviewQuestion: "복잡한 장애나 설계 결정을 설명해 주세요.",
      reason: "면접에서 확인",
      expectedSnapshot: {
        type: "REQUIRED",
        definition: "기존 기준",
        accepted_evidence: ["기존 근거"],
        alternative_evidence: [],
        resume_assessable: true,
        ambiguity_status: "AMBIGUOUS",
        suggested_interview_question: null,
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a hiring request with a draft concurrency token and no reason", () => {
    const result = scorecardApprovalInputSchema.safeParse({
      scorecardVersionId: "20000000-0000-0000-0000-000000000001",
      expectedVersionNumber: 1,
      expectedStatus: "DRAFT",
      expectedContentRevision: 3,
    });

    expect(result.success).toBe(true);
  });

  it("accepts an update for a saved draft without collecting a reason", () => {
    expect(
      scorecardDraftUpdateInputSchema.safeParse({
        scorecardVersionId: "20000000-0000-0000-0000-000000000001",
        expectedVersionNumber: 1,
        expectedStatus: "DRAFT",
        expectedContentRevision: 2,
      }).success,
    ).toBe(true);
  });

  it("accepts an evaluation-criterion confirmation", () => {
    expect(
      scorecardIssueConfirmationInputSchema.safeParse({
        scorecardVersionId: "20000000-0000-0000-0000-000000000001",
        expectedContentRevision: 2,
        issueScope: "EVALUATION_CRITERION",
        issueKey: "30000000-0000-0000-0000-000000000001",
      }).success,
    ).toBe(true);
  });

  it("rejects the legacy user-entered reason field for a saved draft update", () => {
    expect(
      scorecardDraftUpdateInputSchema.safeParse({
        scorecardVersionId: "20000000-0000-0000-0000-000000000001",
        expectedVersionNumber: 1,
        expectedStatus: "DRAFT",
        expectedContentRevision: 2,
        reason: "평가 기준을 수정함",
      }).success,
    ).toBe(false);
  });

  it("rejects an approval input with an invalid UUID", () => {
    const result = scorecardApprovalInputSchema.safeParse({
      scorecardVersionId: "not-a-uuid",
      expectedVersionNumber: 1,
      expectedStatus: "DRAFT",
      expectedContentRevision: 3,
    });

    expect(result.success).toBe(false);
  });
});

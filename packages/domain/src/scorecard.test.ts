import { describe, expect, it } from "vitest";

import {
  scorecardAmbiguityReviewInputSchema,
  scorecardApprovalInputSchema,
  scorecardDraftSchema,
  scorecardCriterionReviewSnapshotSchema,
  scorecardRevisionInputSchema,
} from "./scorecard";

const validCriterion = {
  client_id: "criterion-1",
  name: "운영 환경 백엔드 개발 경험",
  type: "REQUIRED" as const,
  definition: "운영 서비스에서 백엔드 시스템을 개발하고 운영한 경험",
  accepted_evidence: ["운영 서비스 책임 범위"],
  alternative_evidence: [],
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

  it("accepts an approval with a draft concurrency token and reason", () => {
    const result = scorecardApprovalInputSchema.safeParse({
      scorecardVersionId: "20000000-0000-0000-0000-000000000001",
      expectedVersionNumber: 1,
      expectedStatus: "DRAFT",
      expectedContentRevision: 3,
      reason: "모든 기준을 검토하고 승인함",
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["invalid UUID", { scorecardVersionId: "not-a-uuid" }],
    ["empty reason", { reason: "   " }],
  ])("rejects approval input with %s", (_label, override) => {
    const result = scorecardApprovalInputSchema.safeParse({
      scorecardVersionId: "20000000-0000-0000-0000-000000000001",
      expectedVersionNumber: 1,
      expectedStatus: "DRAFT",
      expectedContentRevision: 3,
      reason: "승인 사유",
      ...override,
    });

    expect(result.success).toBe(false);
  });

  it("accepts an approved source token for a reasoned revision", () => {
    const result = scorecardRevisionInputSchema.safeParse({
      sourceScorecardVersionId: "20000000-0000-0000-0000-000000000001",
      expectedVersionNumber: 1,
      expectedStatus: "APPROVED",
      reason: "새 요구사항을 별도 초안에서 검토함",
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["invalid UUID", { sourceScorecardVersionId: "revision-1" }],
    ["empty reason", { reason: "" }],
  ])("rejects revision input with %s", (_label, override) => {
    const result = scorecardRevisionInputSchema.safeParse({
      sourceScorecardVersionId: "20000000-0000-0000-0000-000000000001",
      expectedVersionNumber: 1,
      expectedStatus: "APPROVED",
      reason: "개정 사유",
      ...override,
    });

    expect(result.success).toBe(false);
  });
});

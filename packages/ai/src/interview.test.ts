import { describe, expect, it } from "vitest";

import {
  validateInterviewAssessment,
  InterviewAssessmentValidationError,
  type InterviewAssessmentPromptInput,
} from "./interview-assessment";
import {
  validateInterviewGuide,
  InterviewGuideValidationError,
  type InterviewGuidePromptInput,
} from "./interview-guide";

const criterionA = "11111111-1111-4111-8111-111111111111";
const criterionB = "22222222-2222-4222-8222-222222222222";

const transcript =
  "면접관: 쿠버네티스를 운영해 보셨나요? 지원자: 학습용으로 미니쿠베를 띄워 본 정도이고, " +
  "실제 서비스 클러스터를 운영한 적은 없습니다.";

const assessmentContext: InterviewAssessmentPromptInput = {
  role_title: "백엔드 엔지니어",
  transcript,
  criteria: [
    {
      criterion_id: criterionA,
      name: "운영 환경 Kubernetes 경험",
      type: "REQUIRED",
      definition: "운영 중인 서비스의 클러스터를 직접 다뤄 본 경험",
      accepted_evidence: ["운영 클러스터 장애 대응"],
      excluded_evidence: [],
      resume_claim: "Kubernetes 기반 서비스 운영",
    },
  ],
};

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    criteria: [
      {
        criterion_id: criterionA,
        verdict: "WEAKER",
        weakness_type: "LEVEL_INSUFFICIENT",
        rationale: "학습용 환경만 다뤄 본 것으로 확인되었습니다.",
        transcript_quote: "학습용으로 미니쿠베를 띄워 본 정도이고",
        ...overrides,
      },
    ],
  };
}

describe("interview assessment contract", () => {
  it("accepts a verdict quoting the transcript verbatim", () => {
    const result = validateInterviewAssessment(assessment(), assessmentContext);
    expect(result.criteria[0]?.verdict).toBe("WEAKER");
    expect(result.criteria[0]?.weakness_type).toBe("LEVEL_INSUFFICIENT");
  });

  it("accepts a quote that differs only in whitespace", () => {
    expect(() =>
      validateInterviewAssessment(
        assessment({ transcript_quote: "학습용으로  미니쿠베를\n띄워 본 정도이고" }),
        assessmentContext,
      ),
    ).not.toThrow();
  });

  it("rejects a quote that is not in the transcript", () => {
    expect(() =>
      validateInterviewAssessment(
        assessment({ transcript_quote: "3년간 운영 클러스터를 직접 관리했습니다" }),
        assessmentContext,
      ),
    ).toThrow(InterviewAssessmentValidationError);
  });

  it("rejects a paraphrase of what was actually said", () => {
    expect(() =>
      validateInterviewAssessment(
        assessment({ transcript_quote: "미니쿠베만 사용해 봤다고 답변함" }),
        assessmentContext,
      ),
    ).toThrow(/verbatim/u);
  });

  it("requires a weakness type on WEAKER and forbids it elsewhere", () => {
    expect(() =>
      validateInterviewAssessment(assessment({ weakness_type: null }), assessmentContext),
    ).toThrow();
    expect(() =>
      validateInterviewAssessment(
        assessment({ verdict: "MATCHED", weakness_type: "LEVEL_INSUFFICIENT" }),
        assessmentContext,
      ),
    ).toThrow();
  });

  it("requires NOT_ASKED to cite nothing", () => {
    expect(() =>
      validateInterviewAssessment(
        assessment({ verdict: "NOT_ASKED", weakness_type: null }),
        assessmentContext,
      ),
    ).toThrow();
    expect(() =>
      validateInterviewAssessment(
        assessment({ verdict: "NOT_ASKED", weakness_type: null, transcript_quote: null }),
        assessmentContext,
      ),
    ).not.toThrow();
  });

  it("rejects a verdict for a criterion that was not supplied", () => {
    expect(() =>
      validateInterviewAssessment(assessment({ criterion_id: criterionB }), assessmentContext),
    ).toThrow(/not supplied/u);
  });

  it("rejects a draft that silently drops a criterion", () => {
    const context: InterviewAssessmentPromptInput = {
      ...assessmentContext,
      criteria: [
        ...assessmentContext.criteria,
        {
          criterion_id: criterionB,
          name: "대용량 트래픽 처리",
          type: "PREFERRED",
          definition: "높은 트래픽을 감당한 경험",
          accepted_evidence: [],
          excluded_evidence: [],
          resume_claim: null,
        },
      ],
    };
    expect(() => validateInterviewAssessment(assessment(), context)).toThrow(/omitted/u);
  });
});

const guideContext: InterviewGuidePromptInput = {
  role_title: "백엔드 엔지니어",
  criteria: [
    {
      criterion_id: criterionA,
      name: "운영 환경 Kubernetes 경험",
      type: "REQUIRED",
      definition: "운영 중인 서비스의 클러스터를 직접 다뤄 본 경험",
      accepted_evidence: ["운영 클러스터 장애 대응"],
      excluded_evidence: [],
      evidence_status: "SUPPORTED",
      evidence_quotes: ["Kubernetes 기반 서비스 운영"],
    },
  ],
};

function guide(overrides: Record<string, unknown> = {}) {
  return {
    opening_note: "제출 자료가 확인해 주지 못한 항목을 중심으로 진행하세요.",
    criteria: [
      {
        criterion_id: criterionA,
        probe_priority: "HIGH",
        rationale: "표현이 넓어 실제 운영 범위를 알 수 없습니다.",
        questions: [
          {
            question: "가장 최근 장애 상황에서 무엇을 직접 조치하셨습니까?",
            listen_for: "본인이 실행한 조치와 그 결과",
          },
        ],
        ...overrides,
      },
    ],
  };
}

describe("interview guide contract", () => {
  it("accepts a guide covering every supplied criterion", () => {
    const result = validateInterviewGuide(guide(), guideContext);
    expect(result.criteria[0]?.probe_priority).toBe("HIGH");
  });

  it("rejects a guide referencing an unsupplied criterion", () => {
    expect(() => validateInterviewGuide(guide({ criterion_id: criterionB }), guideContext)).toThrow(
      InterviewGuideValidationError,
    );
  });

  it("rejects a guide that skips a criterion", () => {
    const context: InterviewGuidePromptInput = {
      ...guideContext,
      criteria: [
        ...guideContext.criteria,
        {
          criterion_id: criterionB,
          name: "커뮤니케이션",
          type: "INTERVIEW_ONLY",
          definition: "설계 의도를 설명하는 능력",
          accepted_evidence: [],
          excluded_evidence: [],
          evidence_status: "HUMAN_ONLY",
          evidence_quotes: [],
        },
      ],
    };
    expect(() => validateInterviewGuide(guide(), context)).toThrow(/omitted/u);
  });

  it("requires at least one question per criterion", () => {
    expect(() => validateInterviewGuide(guide({ questions: [] }), guideContext)).toThrow();
  });
});

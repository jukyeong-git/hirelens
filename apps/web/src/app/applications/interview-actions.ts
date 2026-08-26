"use server";

import {
  createInterviewAssessmentAdapter,
  createInterviewGuideAdapter,
  InterviewAdapterError,
  type InterviewAssessment,
  type InterviewAssessmentPromptInput,
  type InterviewGuide,
  type InterviewGuidePromptInput,
} from "@hirelens/ai";
import { parseEnvironment } from "@hirelens/domain";
import {
  getApplicationForReview,
  getJobForScorecard,
  getScorecardVersion,
  listEvidenceItemsForRuns,
  listResumeProcessingRunsForApplication,
  listReviewAssignments,
} from "@hirelens/database";

import { getAuthenticatedViewer } from "../../lib/supabase-server";

export interface InterviewGuideActionState {
  status: "idle" | "success" | "error";
  message?: string;
  guide?: InterviewGuide;
}

export interface InterviewAssessmentActionState {
  status: "idle" | "success" | "error";
  message?: string;
  assessment?: InterviewAssessment;
}

export const initialInterviewGuideActionState: InterviewGuideActionState = { status: "idle" };
export const initialInterviewAssessmentActionState: InterviewAssessmentActionState = {
  status: "idle",
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

/**
 * Server-only diagnostics. Deliberately excludes prompts, model output, resume
 * text, transcript text, and user identity.
 */
function logInterviewAi(entry: {
  event: "started" | "succeeded" | "failed";
  operation: "interview_guide" | "interview_assessment";
  model: string;
  promptVersion: string;
  schemaVersion: string;
  durationMs?: number;
  errorCode?: string;
}): void {
  console.info("[hirelens.ai_draft]", JSON.stringify(entry));
}

function adapterOptions(apiKey: string, model: string, maxOutputTokens: number) {
  const environment = parseEnvironment();
  return {
    apiKey,
    model,
    endpoint: "https://api.openai.com/v1/responses",
    timeoutMs: 60_000,
    maxInputTokens: environment.AI_MAX_INPUT_TOKENS,
    maxOutputTokens: Math.min(environment.AI_MAX_OUTPUT_TOKENS, maxOutputTokens),
    maxTotalTokens: environment.AI_MAX_TOTAL_TOKENS_PER_RUN,
    inputCostMicrousdPerMillionTokens: environment.AI_INPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    outputCostMicrousdPerMillionTokens: environment.AI_OUTPUT_COST_MICROUSD_PER_MILLION_TOKENS,
    maxCostMicrousdPerRun: environment.AI_MAX_COST_MICROUSD_PER_RUN,
  };
}

/**
 * Resolves the criteria and resume evidence both interview features run on, and
 * enforces the same access rule as recording an outcome: the assigned Hiring
 * Manager, or an Admin. Returning a discriminated result keeps the two actions
 * from each re-deriving it.
 */
async function loadInterviewContext(applicationId: string, scorecardVersionId: string) {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { ok: false as const, message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }
  if (!isUuid(applicationId) || !isUuid(scorecardVersionId)) {
    return { ok: false as const, message: "요청 정보를 다시 확인하세요." };
  }
  const { client, viewer } = authenticated;
  const application = await getApplicationForReview(client, applicationId);
  if (!application) return { ok: false as const, message: "지원서를 찾을 수 없습니다." };

  const [job, scorecard, assignments, runs] = await Promise.all([
    getJobForScorecard(client, application.job_id),
    getScorecardVersion(client, scorecardVersionId),
    listReviewAssignments(client, applicationId),
    listResumeProcessingRunsForApplication(client, applicationId),
  ]);
  if (!job || !scorecard) {
    return { ok: false as const, message: "평가 기준을 찾을 수 없습니다." };
  }
  const hasActiveAssignment = assignments.some(
    (assignment) => assignment.status === "ACTIVE" && assignment.assigned_to === viewer.id,
  );
  if (
    viewer.role !== "ADMIN" &&
    !(
      viewer.role === "HIRING_MANAGER" &&
      job.hiring_manager_id === viewer.id &&
      hasActiveAssignment
    )
  ) {
    return { ok: false as const, message: "배정된 채용 책임자 또는 관리자만 사용할 수 있습니다." };
  }

  // Read evidence from the run that produced this framework version, not the
  // newest run: after a revision and reanalysis the newest run belongs to a
  // different version and its evidence would not line up with these criteria.
  const run = runs.find((candidate) => candidate.scorecard_version_id === scorecardVersionId);
  const evidence = await listEvidenceItemsForRuns(client, run ? [run.id] : []);

  const environment = parseEnvironment();
  if (!environment.OPENAI_API_KEY || !environment.OPENAI_MODEL) {
    return {
      ok: false as const,
      message: "AI 설정이 없습니다. 기준별 결과를 직접 선택할 수 있습니다.",
    };
  }

  return {
    ok: true as const,
    roleTitle: job.title,
    criteria: scorecard.criteria,
    evidence,
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
  };
}

/** Before the interview: what this candidate's material leaves unsettled. */
export async function generateInterviewGuideAction(
  _previous: InterviewGuideActionState,
  formData: FormData,
): Promise<InterviewGuideActionState> {
  const context = await loadInterviewContext(
    String(formData.get("applicationId") ?? "").trim(),
    String(formData.get("scorecardVersionId") ?? "").trim(),
  );
  if (!context.ok) return { status: "error", message: context.message };

  const input: InterviewGuidePromptInput = {
    role_title: context.roleTitle,
    criteria: context.criteria.map((criterion) => {
      const items = context.evidence.filter((item) => item.criterion_id === criterion.id);
      return {
        criterion_id: criterion.id,
        name: criterion.name,
        type: criterion.type,
        definition: criterion.definition,
        accepted_evidence: criterion.accepted_evidence,
        excluded_evidence: criterion.excluded_evidence,
        evidence_status: (items[0]?.status ?? "PENDING") as
          | "SUPPORTED"
          | "PARTIAL"
          | "NOT_FOUND"
          | "CONTRADICTED"
          | "HUMAN_ONLY"
          | "PENDING",
        evidence_quotes: items
          .map((item) => item.exact_quote)
          .filter((quote): quote is string => Boolean(quote))
          .slice(0, 5),
      };
    }),
  };

  const adapter = createInterviewGuideAdapter(adapterOptions(context.apiKey, context.model, 4_000));
  const startedAt = Date.now();
  logInterviewAi({
    event: "started",
    operation: "interview_guide",
    model: adapter.versions.model,
    promptVersion: adapter.versions.prompt,
    schemaVersion: adapter.versions.schema,
  });
  try {
    let generated;
    try {
      generated = await adapter(input);
    } catch (error) {
      if (!(error instanceof InterviewAdapterError) || !error.retryable) throw error;
      generated = await adapter(input);
    }
    logInterviewAi({
      event: "succeeded",
      operation: "interview_guide",
      model: generated.versions.model,
      promptVersion: generated.versions.prompt,
      schemaVersion: generated.versions.schema,
      durationMs: Date.now() - startedAt,
    });
    return { status: "success", message: "면접 질문지를 만들었습니다.", guide: generated.guide };
  } catch (error) {
    logInterviewAi({
      event: "failed",
      operation: "interview_guide",
      model: adapter.versions.model,
      promptVersion: adapter.versions.prompt,
      schemaVersion: adapter.versions.schema,
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof InterviewAdapterError ? error.code : "UNEXPECTED_ERROR",
    });
    return {
      status: "error",
      message: "면접 질문지를 만들지 못했습니다. 질문 없이 진행할 수 있습니다.",
    };
  }
}

/** After the interview: a drafted verdict per criterion, quoted from the transcript. */
export async function generateInterviewAssessmentAction(
  _previous: InterviewAssessmentActionState,
  formData: FormData,
): Promise<InterviewAssessmentActionState> {
  const transcript = String(formData.get("transcript") ?? "").trim();
  if (transcript.length < 30) {
    return { status: "error", message: "받아쓴 내용이 너무 짧습니다. 조금 더 녹음하세요." };
  }
  if (transcript.length > 40_000) {
    return {
      status: "error",
      message: "받아쓴 내용이 너무 깁니다. 일부만 남기고 다시 시도하세요.",
    };
  }
  const context = await loadInterviewContext(
    String(formData.get("applicationId") ?? "").trim(),
    String(formData.get("scorecardVersionId") ?? "").trim(),
  );
  if (!context.ok) return { status: "error", message: context.message };

  const input: InterviewAssessmentPromptInput = {
    role_title: context.roleTitle,
    transcript,
    criteria: context.criteria.map((criterion) => ({
      criterion_id: criterion.id,
      name: criterion.name,
      type: criterion.type,
      definition: criterion.definition,
      accepted_evidence: criterion.accepted_evidence,
      excluded_evidence: criterion.excluded_evidence,
      resume_claim:
        context.evidence.find((item) => item.criterion_id === criterion.id)?.exact_quote ?? null,
    })),
  };

  const adapter = createInterviewAssessmentAdapter(
    adapterOptions(context.apiKey, context.model, 6_000),
  );
  const startedAt = Date.now();
  logInterviewAi({
    event: "started",
    operation: "interview_assessment",
    model: adapter.versions.model,
    promptVersion: adapter.versions.prompt,
    schemaVersion: adapter.versions.schema,
  });
  try {
    let generated;
    try {
      generated = await adapter(input);
    } catch (error) {
      if (!(error instanceof InterviewAdapterError) || !error.retryable) throw error;
      generated = await adapter(input);
    }
    logInterviewAi({
      event: "succeeded",
      operation: "interview_assessment",
      model: generated.versions.model,
      promptVersion: generated.versions.prompt,
      schemaVersion: generated.versions.schema,
      durationMs: Date.now() - startedAt,
    });
    return {
      status: "success",
      message: "기준별 초안을 만들었습니다. 하나씩 확인하세요.",
      assessment: generated.assessment,
    };
  } catch (error) {
    const code = error instanceof InterviewAdapterError ? error.code : "UNEXPECTED_ERROR";
    logInterviewAi({
      event: "failed",
      operation: "interview_assessment",
      model: adapter.versions.model,
      promptVersion: adapter.versions.prompt,
      schemaVersion: adapter.versions.schema,
      durationMs: Date.now() - startedAt,
      errorCode: code,
    });
    return {
      status: "error",
      message:
        code === "INVALID_SCHEMA"
          ? "초안이 녹취에 없는 내용을 인용해 폐기했습니다. 직접 선택하세요."
          : "초안을 만들지 못했습니다. 기준별 결과를 직접 선택할 수 있습니다.",
    };
  }
}

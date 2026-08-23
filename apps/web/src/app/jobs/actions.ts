"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";

import { createScorecardDraftAdapter, ScorecardDraftAdapterError } from "@hirelens/ai/server";
import type { ScorecardDraftPromptInput } from "@hirelens/ai";
import type { ScorecardDraftAdapter, ScorecardDraftAdapterResult } from "@hirelens/ai/server";
import {
  createJobInputSchema,
  parseEnvironment,
  scorecardAmbiguityReviewInputSchema,
  scorecardApprovalInputSchema,
  scorecardRevisionInputSchema,
  type AppRole,
} from "@hirelens/domain";
import {
  approveScorecard,
  createJob,
  createScorecardDraft,
  createScorecardRevision,
  getJobForScorecard,
  getScorecardForJob,
  reviewScorecardAmbiguity,
  SupabaseRestError,
} from "@hirelens/database";

import type {
  AmbiguityReviewActionState,
  AuthActionState,
  JobActionState,
  ScorecardActionState,
} from "./action-state";
import {
  clearPasswordSession,
  getAuthenticatedViewer,
  setPasswordSession,
  signInWithPassword,
} from "../../lib/supabase-server";

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { status: "error", message: "이메일과 비밀번호를 입력하세요." };
  }

  try {
    const session = await signInWithPassword(email, password);
    await setPasswordSession(session);
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 400) {
      return { status: "error", message: "이메일 또는 비밀번호를 확인하세요." };
    }

    return { status: "error", message: "로그인에 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  redirect("/jobs");
}

export async function signOutAction() {
  await clearPasswordSession();
  redirect("/jobs");
}

export async function createJobAction(
  _previousState: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const authenticated = await getAuthenticatedViewer();

  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (!canCreateJob(viewer.role)) {
    return { status: "error", message: "Job을 생성할 권한이 없습니다." };
  }

  const recruiterId = viewer.role === "RECRUITER" ? viewer.id : formData.get("recruiterId");
  const parsed = createJobInputSchema.safeParse({
    title: formData.get("title"),
    department: formData.get("department"),
    rawJobDescription: formData.get("rawJobDescription"),
    recruiterId,
    hiringManagerId: formData.get("hiringManagerId"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "제목, 부서, 담당 Recruiter, Hiring Manager, 직무 설명을 확인하세요.",
    };
  }

  try {
    await createJob(client, parsed.data);
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 403) {
      return { status: "error", message: "현재 사용자에게 Job 생성 권한이 없습니다." };
    }

    if (error instanceof SupabaseRestError && error.status === 409) {
      return { status: "error", message: "최신 권한 정보를 확인한 뒤 다시 시도하세요." };
    }

    return { status: "error", message: "Job 생성에 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  revalidatePath("/jobs");
  return { status: "success", message: "Job 초안을 생성했습니다." };
}

export async function requestScorecardDraftAction(
  _previousState: ScorecardActionState,
  formData: FormData,
): Promise<ScorecardActionState> {
  const authenticated = await getAuthenticatedViewer();

  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "RECRUITER") {
    return { status: "error", message: "Scorecard 초안을 요청할 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!isUuid(jobId)) {
    return { status: "error", message: "유효하지 않은 Job입니다." };
  }

  const job = await getJobForScorecard(client, jobId);
  if (!job) {
    return { status: "error", message: "Job을 찾을 수 없거나 접근할 수 없습니다." };
  }

  const existingScorecard = await getScorecardForJob(client, jobId);
  if (existingScorecard) {
    return {
      status: "error",
      message: "이미 Scorecard 초안이 있습니다. 다음 버전 작업에서 수정하세요.",
    };
  }

  const environment = parseEnvironment();
  if (!environment.OPENAI_API_KEY || !environment.OPENAI_MODEL) {
    return {
      status: "error",
      message: "Scorecard AI 설정이 없습니다. Admin에게 확인을 요청하세요.",
    };
  }

  const adapter = createScorecardDraftAdapter({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
    endpoint: "https://api.openai.com/v1/responses",
  });

  let generated;
  try {
    generated = await generateScorecardDraftWithRetry(adapter, {
      job_title: job.title,
      raw_job_description: job.raw_job_description,
      human_clarification: null,
    });
  } catch (error) {
    if (error instanceof ScorecardDraftAdapterError) {
      if (
        error.code === "REFUSAL" ||
        error.code === "INVALID_SCHEMA" ||
        error.code === "INVALID_SOURCE_PHRASE"
      ) {
        return {
          status: "error",
          message: "AI 초안을 검증할 수 없어 저장하지 않았습니다. 다시 검토하세요.",
        };
      }

      return { status: "error", message: "AI 초안 생성에 실패했습니다. 잠시 후 다시 시도하세요." };
    }

    return { status: "error", message: "AI 초안 생성에 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  try {
    await createScorecardDraft(client, {
      jobId,
      sourceJobDescriptionHash: createHash("sha256").update(job.raw_job_description).digest("hex"),
      promptVersion: generated.versions.prompt,
      schemaVersion: generated.versions.schema,
      modelId: generated.versions.model,
      ambiguousPhrases: generated.draft.ambiguous_phrases,
      criteria: generated.draft.criteria.map((criterion, displayOrder) => ({
        ...criterion,
        display_order: displayOrder,
      })),
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && (error.status === 403 || error.status === 404)) {
      return { status: "error", message: "현재 사용자에게 Scorecard 초안 저장 권한이 없습니다." };
    }

    return { status: "error", message: "Scorecard 초안 저장에 실패했습니다. 다시 시도하세요." };
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function reviewScorecardAmbiguityAction(
  _previousState: AmbiguityReviewActionState,
  formData: FormData,
): Promise<AmbiguityReviewActionState> {
  const authenticated = await getAuthenticatedViewer();

  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "모호한 표현을 검토할 권한이 없습니다." };
  }

  const snapshotText = String(formData.get("expectedSnapshot") ?? "");
  let expectedSnapshot: unknown;
  try {
    expectedSnapshot = JSON.parse(snapshotText) as unknown;
  } catch {
    return { status: "error", message: "검토 화면이 오래되었습니다. 최신 초안을 다시 여세요." };
  }

  const parsed = scorecardAmbiguityReviewInputSchema.safeParse({
    jobId: String(formData.get("jobId") ?? "").trim(),
    scorecardVersionId: String(formData.get("scorecardVersionId") ?? "").trim(),
    criterionId: String(formData.get("criterionId") ?? "").trim(),
    resolution: String(formData.get("resolution") ?? "").trim(),
    criterionType: String(formData.get("criterionType") ?? "").trim(),
    definition: String(formData.get("definition") ?? ""),
    acceptedEvidence: splitLines(formData.get("acceptedEvidence")),
    alternativeEvidence: splitLines(formData.get("alternativeEvidence")),
    resumeAssessable: String(formData.get("resumeAssessable") ?? "false") === "true",
    suggestedInterviewQuestion: nullableFormText(formData.get("suggestedInterviewQuestion")),
    reason: String(formData.get("reason") ?? ""),
    expectedSnapshot,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "검토 결과, 기준, 인정 근거, 변경 사유를 확인하세요.",
    };
  }

  try {
    await reviewScorecardAmbiguity(client, parsed.data);
  } catch (error) {
    if (error instanceof SupabaseRestError) {
      if (error.status === 401 || error.status === 403) {
        return { status: "error", message: "현재 사용자에게 검토 권한이 없습니다." };
      }

      if (error.status === 400 || error.status === 409) {
        if (/stale|changed|reload/iu.test(error.responseBody)) {
          return {
            status: "error",
            message: "다른 사용자가 먼저 변경했습니다. 최신 초안을 새로 불러와 다시 시도하세요.",
          };
        }
      }
    }

    return { status: "error", message: "모호한 표현 검토 저장에 실패했습니다. 다시 시도하세요." };
  }

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { status: "success", message: "모호한 표현 검토를 저장했습니다." };
}

export async function approveScorecardAction(
  _previousState: ScorecardActionState,
  formData: FormData,
): Promise<ScorecardActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "Scorecard를 승인할 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  const parsed = scorecardApprovalInputSchema.safeParse({
    scorecardVersionId: String(formData.get("scorecardVersionId") ?? "").trim(),
    expectedVersionNumber: Number(formData.get("expectedVersionNumber")),
    expectedStatus: String(formData.get("expectedStatus") ?? ""),
    expectedContentRevision: Number(formData.get("expectedContentRevision")),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!isUuid(jobId) || !parsed.success) {
    return { status: "error", message: "승인 대상과 승인 사유를 확인하세요." };
  }

  try {
    await approveScorecard(client, parsed.data);
  } catch (error) {
    return scorecardWorkflowError(error, "Scorecard 승인에 실패했습니다. 다시 시도하세요.");
  }

  revalidatePath(`/jobs/${jobId}`);
  return { status: "success", message: "사람의 승인과 버전 이력을 저장했습니다." };
}

export async function createScorecardRevisionAction(
  _previousState: ScorecardActionState,
  formData: FormData,
): Promise<ScorecardActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "새 Scorecard 버전을 만들 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  const parsed = scorecardRevisionInputSchema.safeParse({
    sourceScorecardVersionId: String(formData.get("sourceScorecardVersionId") ?? "").trim(),
    expectedVersionNumber: Number(formData.get("expectedVersionNumber")),
    expectedStatus: String(formData.get("expectedStatus") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  if (!isUuid(jobId) || !parsed.success) {
    return { status: "error", message: "기준 버전과 새 버전 생성 사유를 확인하세요." };
  }

  try {
    await createScorecardRevision(client, parsed.data);
  } catch (error) {
    return scorecardWorkflowError(error, "새 Scorecard 버전 생성에 실패했습니다.");
  }

  revalidatePath(`/jobs/${jobId}`);
  return { status: "success", message: "승인본을 보존하고 새 초안 버전을 만들었습니다." };
}

async function generateScorecardDraftWithRetry(
  adapter: ScorecardDraftAdapter,
  input: ScorecardDraftPromptInput,
): Promise<ScorecardDraftAdapterResult> {
  try {
    return await adapter(input);
  } catch (error) {
    if (!(error instanceof ScorecardDraftAdapterError) || !isRetryableScorecardError(error.code)) {
      throw error;
    }

    return adapter(input);
  }
}

function isRetryableScorecardError(code: ScorecardDraftAdapterError["code"]) {
  return (
    code === "NETWORK_ERROR" || code === "TIMEOUT" || code === "HTTP_ERROR" || code === "INCOMPLETE"
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function canCreateJob(role: AppRole) {
  return role === "ADMIN" || role === "RECRUITER";
}

function splitLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function nullableFormText(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function scorecardWorkflowError(error: unknown, fallback: string): ScorecardActionState {
  if (error instanceof SupabaseRestError) {
    if (error.status === 401 || error.status === 403) {
      return { status: "error", message: "현재 사용자에게 이 작업 권한이 없습니다." };
    }

    if (/stale|changed|reload/iu.test(error.responseBody)) {
      return {
        status: "error",
        message: "다른 사용자가 먼저 변경했습니다. 최신 버전을 새로 불러와 다시 시도하세요.",
      };
    }

    if (/ambiguous criteria/iu.test(error.responseBody)) {
      return { status: "error", message: "검토 필요 기준을 모두 해소한 뒤 승인하세요." };
    }

    if (/draft scorecard revision already exists/iu.test(error.responseBody)) {
      return { status: "error", message: "이미 작업 중인 새 초안 버전이 있습니다." };
    }
  }

  return { status: "error", message: fallback };
}

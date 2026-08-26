"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function optionalFormText(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

import {
  createJobRequisitionDraftAdapter,
  createScorecardDraftAdapter,
  JobRequisitionDraftAdapterError,
  ScorecardDraftAdapterError,
} from "@hirelens/ai/server";
import {
  jobRequisitionDraftPromptInputSchema,
  type JobRequisitionDraftPromptInput,
  type ScorecardDraftPromptInput,
} from "@hirelens/ai";
import type {
  JobRequisitionDraftAdapter,
  JobRequisitionDraftAdapterResult,
  ScorecardDraftAdapter,
  ScorecardDraftAdapterResult,
} from "@hirelens/ai/server";
import {
  createJobInputSchema,
  discardJobDraftInputSchema,
  jobPostingActionInputSchema,
  jobPostingContentInputSchema,
  assignRequisitionApproverInputSchema,
  createHumanReviewInputSchema,
  createReviewNoteInputSchema,
  requestHiringManagerReviewInputSchema,
  recordInterviewProgressionInputSchema,
  markNotificationReadInputSchema,
  parseEnvironment,
  scorecardAmbiguityReviewInputSchema,
  scorecardApprovalInputSchema,
  scorecardIssueConfirmationInputSchema,
  scorecardDraftSchema,
  scorecardDraftUpdateInputSchema,
  resolveRequisitionApprovalInputSchema,
  submitRequisitionInputSchema,
  setReviewNoteDeletedInputSchema,
  updateReviewNoteInputSchema,
  updateJobBasicInfoInputSchema,
} from "@hirelens/domain";
import {
  approveScorecard,
  confirmScorecardIssue,
  assignRequisitionApprover,
  closeJobPosting,
  createJob,
  discardJobDraft,
  createJobPostingDraft,
  createHumanReview,
  requestHiringManagerReview,
  recordInterviewProgression,
  createReviewNote,
  createScorecardDraft,
  getJobForScorecard,
  getJobPosting,
  getScorecardForJob,
  getScorecardWorkspaceForJob,
  markNotificationRead,
  publishJobPosting,
  updateJobPostingContent,
  reviewScorecardAmbiguity,
  resolveRequisitionApproval,
  setReviewNoteDeleted,
  submitRequisition,
  SupabaseRestError,
  updateReviewNote,
  updateScorecardDraft,
  updateJobBasicInfo,
} from "@hirelens/database";

import type {
  AmbiguityReviewActionState,
  AuthActionState,
  JobActionState,
  JobPostingActionState,
  JobRequisitionDraftActionState,
  RequisitionActionState,
  ScorecardActionState,
  ScorecardDraftGenerationActionState,
  ReviewActionState,
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
  if (viewer.role !== "HIRING_MANAGER") {
    return {
      status: "error",
      message: "채용 요청 초안은 채용 책임자만 생성할 수 있습니다.",
    };
  }

  const parsed = createJobInputSchema.safeParse({
    title: formData.get("title"),
    department: formData.get("department"),
    hiringNeed: formData.get("hiringNeed"),
    roleSummary: formData.get("roleSummary"),
    responsibilities: formData.get("responsibilities"),
    requirements: formData.get("requirements"),
    preferredQualifications: formData.get("preferredQualifications"),
    recruiterId: formData.get("recruiterId"),
    hiringManagerId: viewer.id,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "직무명, 부서, 채용 담당자, 직무 설명 항목, 요청 사유를 확인하세요.",
    };
  }

  try {
    await createJob(client, parsed.data);
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 403) {
      return { status: "error", message: "현재 사용자에게 채용 요청 생성 권한이 없습니다." };
    }

    if (error instanceof SupabaseRestError && error.status === 409) {
      return { status: "error", message: "최신 권한 정보를 확인한 뒤 다시 시도하세요." };
    }

    return { status: "error", message: "채용 요청 생성에 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  revalidatePath("/jobs");
  redirect("/jobs");
}

export async function updateJobBasicInfoAction(
  _previousState: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "기본 정보를 수정할 권한이 없습니다." };
  }

  const parsed = updateJobBasicInfoInputSchema.safeParse({
    jobId: formData.get("jobId"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
    title: formData.get("title"),
    department: formData.get("department"),
    hiringNeed: formData.get("hiringNeed"),
    roleSummary: formData.get("roleSummary"),
    responsibilities: formData.get("responsibilities"),
    requirements: formData.get("requirements"),
    preferredQualifications: formData.get("preferredQualifications"),
    recruiterId: formData.get("recruiterId"),
  });
  if (!parsed.success) {
    return { status: "error", message: "입력한 기본 정보를 확인하세요." };
  }

  try {
    await updateJobBasicInfo(client, parsed.data);
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 403) {
      return { status: "error", message: "배정된 채용 책임자 또는 관리자만 수정할 수 있습니다." };
    }
    if (error instanceof SupabaseRestError && error.status === 409) {
      return {
        status: "error",
        message: "채용 정보가 변경되었습니다. 새로고침 후 다시 시도하세요.",
      };
    }
    return { status: "error", message: "기본 정보 저장에 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  revalidatePath("/jobs");
  return { status: "success", message: "기본 정보를 저장했습니다." };
}

export async function discardJobDraftAction(
  _previousState: JobActionState,
  formData: FormData,
): Promise<JobActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }
  if (authenticated.viewer.role !== "ADMIN" && authenticated.viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "채용 요청을 삭제할 권한이 없습니다." };
  }

  const parsed = discardJobDraftInputSchema.safeParse({
    jobId: formData.get("jobId"),
    expectedUpdatedAt: formData.get("expectedUpdatedAt"),
  });
  if (!parsed.success) {
    return { status: "error", message: "삭제할 채용 요청을 확인하세요." };
  }

  try {
    await discardJobDraft(authenticated.client, parsed.data);
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 403) {
      return { status: "error", message: "배정된 채용 책임자 또는 관리자만 삭제할 수 있습니다." };
    }
    if (error instanceof SupabaseRestError && error.status === 409) {
      return {
        status: "error",
        message: "채용 요청이 변경되었습니다. 새로고침 후 다시 시도하세요.",
      };
    }
    return { status: "error", message: "채용 요청 삭제에 실패했습니다. 다시 시도하세요." };
  }

  revalidatePath("/jobs");
  redirect("/jobs");
}

/** Generates an editable form value only; createJobAction remains the sole persistence path. */
export async function generateJobRequisitionDraftAction(
  _previousState: JobRequisitionDraftActionState,
  formData: FormData,
): Promise<JobRequisitionDraftActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }
  if (authenticated.viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "AI 채용 요청 초안은 채용 책임자만 만들 수 있습니다." };
  }

  const parsed = jobRequisitionDraftPromptInputSchema.safeParse({
    title: formData.get("title"),
    department: formData.get("department"),
    role_summary: optionalFormText(formData.get("roleSummary")),
    responsibilities: optionalFormText(formData.get("responsibilities")),
    requirements: optionalFormText(formData.get("requirements")),
    preferred_qualifications: optionalFormText(formData.get("preferredQualifications")),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "직무명과 부서를 입력한 뒤 AI 초안을 요청하세요.",
    };
  }

  const environment = parseEnvironment();
  if (!environment.OPENAI_API_KEY || !environment.OPENAI_MODEL) {
    return {
      status: "error",
      message: "AI 채용 요청 초안 설정이 없습니다. 관리자에게 확인을 요청하세요.",
    };
  }

  const adapter = createJobRequisitionDraftAdapter({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
    endpoint: "https://api.openai.com/v1/responses",
  });
  const startedAt = Date.now();
  logAiDraftRequest({
    event: "started",
    operation: "job_requisition_draft",
    model: adapter.versions.model,
    promptVersion: adapter.versions.prompt,
    schemaVersion: adapter.versions.schema,
  });

  try {
    const generated = await generateJobRequisitionDraftWithRetry(adapter, {
      title: parsed.data.title,
      department: parsed.data.department,
      role_summary: parsed.data.role_summary,
      responsibilities: parsed.data.responsibilities,
      requirements: parsed.data.requirements,
      preferred_qualifications: parsed.data.preferred_qualifications,
    });
    logAiDraftRequest({
      event: "succeeded",
      operation: "job_requisition_draft",
      model: generated.versions.model,
      promptVersion: generated.versions.prompt,
      schemaVersion: generated.versions.schema,
      durationMs: Date.now() - startedAt,
    });
    return {
      status: "success",
      message: "AI 초안을 직무 설명에 채웠습니다. 내용을 검토·수정한 뒤 직접 저장하세요.",
      roleSummary: generated.draft.role_summary,
      responsibilities: generated.draft.responsibilities,
      requirements: generated.draft.requirements,
      preferredQualifications: generated.draft.preferred_qualifications,
      promptVersion: generated.versions.prompt,
    };
  } catch (error) {
    logAiDraftFailure({
      operation: "job_requisition_draft",
      model: adapter.versions.model,
      promptVersion: adapter.versions.prompt,
      schemaVersion: adapter.versions.schema,
      durationMs: Date.now() - startedAt,
      error,
    });
    if (error instanceof JobRequisitionDraftAdapterError) {
      if (error.code === "REFUSAL" || error.code === "INVALID_SCHEMA") {
        return {
          status: "error",
          message:
            "AI 초안을 검증할 수 없어 적용하지 않았습니다. 내용을 직접 작성하거나 다시 시도하세요.",
        };
      }
      if (error.code === "INCOMPLETE") {
        return {
          status: "error",
          message: "AI 초안 생성이 완료되지 않았습니다. 잠시 후 다시 시도하세요.",
        };
      }
    }
    return { status: "error", message: "AI 초안 생성에 실패했습니다. 잠시 후 다시 시도하세요." };
  }
}

/**
 * Generates a Review Framework suggestion without storing it. The browser
 * receives an editable draft and persistence happens only in
 * saveScorecardDraftAction after a human explicitly submits it.
 */
export async function generateScorecardDraftAction(
  _previousState: ScorecardDraftGenerationActionState,
  formData: FormData,
): Promise<ScorecardDraftGenerationActionState> {
  const authenticated = await getAuthenticatedViewer();

  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "평가 기준 초안을 요청할 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!isUuid(jobId)) {
    return { status: "error", message: "유효하지 않은 채용 요청입니다." };
  }

  const job = await getJobForScorecard(client, jobId);
  if (!job) {
    return { status: "error", message: "채용 요청을 찾을 수 없거나 접근할 수 없습니다." };
  }

  if (viewer.role === "HIRING_MANAGER" && job.hiring_manager_id !== viewer.id) {
    return {
      status: "error",
      message: "배정된 채용 책임자만 평가 기준 초안을 요청할 수 있습니다.",
    };
  }

  const existingScorecard = await getScorecardForJob(client, jobId);
  if (existingScorecard) {
    return {
      status: "error",
      message: "이미 평가 기준 초안이 있습니다. 기존 초안을 수정하세요.",
    };
  }

  const environment = parseEnvironment();
  if (!environment.OPENAI_API_KEY || !environment.OPENAI_MODEL) {
    return {
      status: "error",
      message: "AI 평가 기준 초안 설정이 없습니다. Admin에게 확인을 요청하세요.",
    };
  }

  const adapter = createScorecardDraftAdapter({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_MODEL,
    endpoint: "https://api.openai.com/v1/responses",
    timeoutMs: 45_000,
    maxOutputTokens: 3_500,
    reasoningEffort: "low",
    verbosity: "low",
  });
  const startedAt = Date.now();
  logAiDraftRequest({
    event: "started",
    operation: "review_framework_draft",
    model: adapter.versions.model,
    promptVersion: adapter.versions.prompt,
    schemaVersion: adapter.versions.schema,
  });

  let generated;
  try {
    generated = await generateScorecardDraftWithRetry(adapter, {
      job_title: job.title,
      raw_job_description: job.raw_job_description,
      human_clarification: null,
    });
    logAiDraftRequest({
      event: "succeeded",
      operation: "review_framework_draft",
      model: generated.versions.model,
      promptVersion: generated.versions.prompt,
      schemaVersion: generated.versions.schema,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logAiDraftFailure({
      operation: "review_framework_draft",
      model: adapter.versions.model,
      promptVersion: adapter.versions.prompt,
      schemaVersion: adapter.versions.schema,
      durationMs: Date.now() - startedAt,
      error,
    });
    if (error instanceof ScorecardDraftAdapterError) {
      if (
        error.code === "REFUSAL" ||
        error.code === "INVALID_SCHEMA" ||
        error.code === "INVALID_SOURCE_PHRASE"
      ) {
        return {
          status: "error",
          message:
            "AI 초안을 검증할 수 없어 적용하지 않았습니다. 수기로 작성하거나 다시 시도하세요.",
        };
      }

      if (error.code === "TIMEOUT") {
        return {
          status: "error",
          message: "AI 초안 생성이 지연되고 있습니다. 잠시 후 다시 시도하거나 직접 작성하세요.",
        };
      }

      return { status: "error", message: "AI 초안 생성에 실패했습니다. 잠시 후 다시 시도하세요." };
    }

    return { status: "error", message: "AI 초안 생성에 실패했습니다. 잠시 후 다시 시도하세요." };
  }

  return {
    status: "success",
    message: "AI 제안을 편집 폼에 채웠습니다. 내용을 검토한 뒤 초안을 저장하세요.",
    draft: {
      ambiguous_phrases: generated.draft.ambiguous_phrases,
      criteria: generated.draft.criteria.map((criterion, displayOrder) => ({
        ...criterion,
        display_order: displayOrder,
      })),
    },
    aiDraftToken: createScorecardDraftProvenanceToken({
      jobId,
      actorId: viewer.id,
      promptVersion: generated.versions.prompt,
      schemaVersion: generated.versions.schema,
      modelId: generated.versions.model,
      signingKey: environment.OPENAI_API_KEY,
    }),
  };
}

/** The legacy metadata fields explicitly identify a human-authored snapshot. */
const manualReviewFrameworkMetadata = {
  promptVersion: "human-authored",
  schemaVersion: "review-framework-manual-v1",
  modelId: "HUMAN_AUTHORED",
} as const;

interface ScorecardDraftProvenance {
  jobId: string;
  actorId: string;
  promptVersion: string;
  schemaVersion: string;
  modelId: string;
  expiresAt: number;
}

function createScorecardDraftProvenanceToken(
  input: Omit<ScorecardDraftProvenance, "expiresAt"> & { signingKey: string },
): string {
  const payload: ScorecardDraftProvenance = {
    jobId: input.jobId,
    actorId: input.actorId,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    modelId: input.modelId,
    expiresAt: Math.floor(Date.now() / 1000) + 15 * 60,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", input.signingKey)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function readScorecardDraftProvenanceToken(
  token: string,
  signingKey: string | undefined,
  expected: Pick<ScorecardDraftProvenance, "jobId" | "actorId">,
): Omit<ScorecardDraftProvenance, "jobId" | "actorId" | "expiresAt"> | null {
  if (!signingKey) return null;
  const [encodedPayload, receivedSignature, ...remainder] = token.split(".");
  if (!encodedPayload || !receivedSignature || remainder.length > 0) return null;

  const expectedSignature = createHmac("sha256", signingKey)
    .update(encodedPayload)
    .digest("base64url");
  const received = Buffer.from(receivedSignature);
  const calculated = Buffer.from(expectedSignature);
  if (received.length !== calculated.length || !timingSafeEqual(received, calculated)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
    if (!isScorecardDraftProvenance(payload)) return null;
    if (
      payload.jobId !== expected.jobId ||
      payload.actorId !== expected.actorId ||
      payload.expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      promptVersion: payload.promptVersion,
      schemaVersion: payload.schemaVersion,
      modelId: payload.modelId,
    };
  } catch {
    return null;
  }
}

function isScorecardDraftProvenance(value: unknown): value is ScorecardDraftProvenance {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.jobId === "string" &&
    typeof payload.actorId === "string" &&
    typeof payload.promptVersion === "string" &&
    typeof payload.schemaVersion === "string" &&
    typeof payload.modelId === "string" &&
    typeof payload.expiresAt === "number" &&
    Number.isInteger(payload.expiresAt)
  );
}

export async function saveScorecardDraftAction(
  _previousState: ScorecardActionState,
  formData: FormData,
): Promise<ScorecardActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "평가 기준 초안을 저장할 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!isUuid(jobId)) {
    return { status: "error", message: "유효하지 않은 채용 요청입니다." };
  }

  const job = await getJobForScorecard(client, jobId);
  if (!job) {
    return { status: "error", message: "채용 요청을 찾을 수 없거나 접근할 수 없습니다." };
  }
  if (viewer.role === "HIRING_MANAGER" && job.hiring_manager_id !== viewer.id) {
    return {
      status: "error",
      message: "배정된 채용 책임자만 평가 기준 초안을 저장할 수 있습니다.",
    };
  }

  const existingScorecard = await getScorecardForJob(client, jobId);
  if (existingScorecard) {
    return {
      status: "error",
      message: "이미 평가 기준 초안이 있습니다. 기존 초안을 수정하세요.",
    };
  }

  let rawDraft: unknown;
  try {
    rawDraft = JSON.parse(String(formData.get("draftJson") ?? "")) as unknown;
  } catch {
    return {
      status: "error",
      message: "평가 기준 초안 형식을 읽을 수 없습니다. 내용을 다시 확인하세요.",
    };
  }
  const parsedDraft = scorecardDraftSchema.safeParse(rawDraft);
  if (!parsedDraft.success) {
    return {
      status: "error",
      message: "기준명, 설명, 이력서 인정 근거와 평가 가능 여부를 확인하세요.",
    };
  }

  const environment = parseEnvironment();
  const rawAiDraftToken = String(formData.get("aiDraftToken") ?? "").trim();
  const aiProvenance = rawAiDraftToken
    ? readScorecardDraftProvenanceToken(rawAiDraftToken, environment.OPENAI_API_KEY, {
        jobId,
        actorId: viewer.id,
      })
    : null;
  if (rawAiDraftToken && !aiProvenance) {
    return {
      status: "error",
      message: "AI 제안 확인 시간이 만료되었습니다. 다시 제안을 요청하거나 수기로 저장하세요.",
    };
  }

  try {
    await createScorecardDraft(client, {
      jobId,
      sourceJobDescriptionHash: createHash("sha256").update(job.raw_job_description).digest("hex"),
      ...(aiProvenance ?? manualReviewFrameworkMetadata),
      ambiguousPhrases: parsedDraft.data.ambiguous_phrases,
      criteria: parsedDraft.data.criteria.map((criterion, displayOrder) => ({
        ...criterion,
        display_order: displayOrder,
      })),
    });
  } catch (error) {
    if (error instanceof SupabaseRestError && (error.status === 403 || error.status === 404)) {
      return { status: "error", message: "현재 사용자에게 평가 기준 초안 저장 권한이 없습니다." };
    }
    return { status: "error", message: "평가 기준 초안 저장에 실패했습니다. 다시 시도하세요." };
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function updateScorecardDraftAction(
  _previousState: ScorecardActionState,
  formData: FormData,
): Promise<ScorecardActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "평가 기준 초안을 수정할 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  const parsedInput = scorecardDraftUpdateInputSchema.safeParse({
    scorecardVersionId: String(formData.get("scorecardVersionId") ?? "").trim(),
    expectedVersionNumber: Number(formData.get("expectedVersionNumber")),
    expectedStatus: String(formData.get("expectedStatus") ?? ""),
    expectedContentRevision: Number(formData.get("expectedContentRevision")),
  });
  if (!isUuid(jobId) || !parsedInput.success) {
    return { status: "error", message: "수정 대상을 확인하세요." };
  }

  let rawDraft: unknown;
  try {
    rawDraft = JSON.parse(String(formData.get("draftJson") ?? "")) as unknown;
  } catch {
    return { status: "error", message: "평가 기준 초안 형식을 읽을 수 없습니다." };
  }
  const parsedDraft = scorecardDraftSchema.safeParse(rawDraft);
  if (!parsedDraft.success) {
    return { status: "error", message: "평가 기준의 필수 입력값을 확인하세요." };
  }

  try {
    await updateScorecardDraft(client, {
      ...parsedInput.data,
      draft: {
        ...parsedDraft.data,
        criteria: parsedDraft.data.criteria.map((criterion, displayOrder) => ({
          ...criterion,
          display_order: displayOrder,
        })),
      },
    });
  } catch (error) {
    return scorecardWorkflowError(error, "평가 기준 초안 수정에 실패했습니다.");
  }

  revalidatePath(`/jobs/${jobId}`);
  return { status: "success", message: "평가 기준 초안을 수정했습니다." };
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
    return { status: "error", message: "평가 기준을 승인할 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  const parsed = scorecardApprovalInputSchema.safeParse({
    scorecardVersionId: String(formData.get("scorecardVersionId") ?? "").trim(),
    expectedVersionNumber: Number(formData.get("expectedVersionNumber")),
    expectedStatus: String(formData.get("expectedStatus") ?? ""),
    expectedContentRevision: Number(formData.get("expectedContentRevision")),
  });

  if (!isUuid(jobId) || !parsed.success) {
    return { status: "error", message: "채용 요청 대상을 확인하세요." };
  }

  try {
    await approveScorecard(client, parsed.data);
  } catch (error) {
    return scorecardWorkflowError(error, "채용 요청에 실패했습니다. 다시 시도하세요.");
  }

  revalidatePath(`/jobs/${jobId}`);
  return { status: "success", message: "채용 요청을 완료하고 평가 기준을 고정했습니다." };
}

export async function confirmScorecardIssueAction(
  _previousState: ScorecardActionState,
  formData: FormData,
): Promise<ScorecardActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 없거나 만료되었습니다. 다시 로그인하세요." };
  }
  if (authenticated.viewer.role !== "ADMIN" && authenticated.viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "확인 사항을 처리할 권한이 없습니다." };
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  const parsed = scorecardIssueConfirmationInputSchema.safeParse({
    scorecardVersionId: String(formData.get("scorecardVersionId") ?? "").trim(),
    expectedContentRevision: Number(formData.get("expectedContentRevision")),
    issueScope: String(formData.get("issueScope") ?? ""),
    issueKey: String(formData.get("issueKey") ?? "").trim(),
  });
  if (!isUuid(jobId) || !parsed.success) {
    return { status: "error", message: "확인할 항목을 다시 확인하세요." };
  }

  try {
    await confirmScorecardIssue(authenticated.client, parsed.data);
  } catch (error) {
    return scorecardWorkflowError(error, "확인 사항 저장에 실패했습니다. 다시 시도하세요.");
  }

  revalidatePath(`/jobs/${jobId}`);
  return { status: "success", message: "확인했습니다." };
}

export async function saveHumanDecisionAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (authenticated.viewer.role !== "ADMIN" && authenticated.viewer.role !== "HIRING_MANAGER") {
    return {
      status: "error",
      message: "최종 결정은 채용 책임자 또는 관리자만 저장할 수 있습니다.",
    };
  }
  const parsed = createHumanReviewInputSchema.safeParse({
    applicationId: String(formData.get("applicationId") ?? "").trim(),
    scorecardVersionId: String(formData.get("scorecardVersionId") ?? "").trim(),
    decision: String(formData.get("decision") ?? "").trim(),
    reasonCode: String(formData.get("reasonCode") ?? "").trim(),
    reasonDetail: String(formData.get("reasonDetail") ?? "").trim(),
    confidence: String(formData.get("confidence") ?? "").trim(),
    note: nullableFormText(formData.get("note")),
  });
  if (!parsed.success)
    return { status: "error", message: "결정, 사유 분류, 상세 사유, 확신도를 확인하세요." };
  try {
    await createHumanReview(authenticated.client, parsed.data);
  } catch (error) {
    return reviewActionError(error, "최종 결정을 저장하지 못했습니다. 다시 시도하세요.");
  }
  revalidatePath(`/applications/${parsed.data.applicationId}`);
  return { status: "success", message: "사람의 최종 결정과 사유를 감사 이력에 저장했습니다." };
}

export async function requestHiringManagerReviewAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (authenticated.viewer.role !== "RECRUITER" && authenticated.viewer.role !== "ADMIN")
    return { status: "error", message: "채용 담당자 또는 관리자만 검토를 요청할 수 있습니다." };
  const parsed = requestHiringManagerReviewInputSchema.safeParse({
    applicationId: String(formData.get("applicationId") ?? "").trim(),
    note: nullableFormText(formData.get("note")),
  });
  if (!parsed.success) return { status: "error", message: "검토 요청 대상과 메모를 확인하세요." };
  try {
    await requestHiringManagerReview(authenticated.client, parsed.data);
  } catch (error) {
    return reviewActionError(error, "채용 책임자 검토를 요청하지 못했습니다.");
  }
  revalidatePath(`/applications/${parsed.data.applicationId}`);
  return {
    status: "success",
    message: "채용 책임자에게 검토를 요청했습니다. 인터뷰 결정은 생성되지 않았습니다.",
  };
}

export async function recordInterviewProgressionAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (authenticated.viewer.role !== "HIRING_MANAGER")
    return {
      status: "error",
      message: "배정된 채용 책임자만 인터뷰 판단을 저장할 수 있습니다.",
    };
  const parsed = recordInterviewProgressionInputSchema.safeParse({
    applicationId: String(formData.get("applicationId") ?? "").trim(),
    scorecardVersionId: String(formData.get("scorecardVersionId") ?? "").trim(),
    outcome: String(formData.get("outcome") ?? "").trim(),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { status: "error", message: "인터뷰 판단과 필수 사유를 확인하세요." };
  try {
    await recordInterviewProgression(authenticated.client, parsed.data);
  } catch (error) {
    return reviewActionError(error, "인터뷰 판단을 저장하지 못했습니다.");
  }
  revalidatePath(`/applications/${parsed.data.applicationId}`);
  return { status: "success", message: "사람의 인터뷰 판단과 사유를 이력에 저장했습니다." };
}

export async function createRecruiterNoteAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (authenticated.viewer.role !== "ADMIN" && authenticated.viewer.role !== "RECRUITER")
    return { status: "error", message: "임시 의견을 작성할 권한이 없습니다." };
  const parsed = createReviewNoteInputSchema.safeParse({
    applicationId: String(formData.get("applicationId") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return { status: "error", message: "의견 내용을 입력하세요." };
  try {
    await createReviewNote(authenticated.client, parsed.data.applicationId, parsed.data.body);
  } catch (error) {
    return reviewActionError(error, "임시 의견을 저장하지 못했습니다.");
  }
  revalidatePath(`/applications/${parsed.data.applicationId}`);
  return { status: "success", message: "채용 담당자 메모를 버전 1로 저장했습니다." };
}

export async function updateRecruiterNoteAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const parsed = updateReviewNoteInputSchema.safeParse({
    noteId: String(formData.get("noteId") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  });
  if (!isUuid(applicationId) || !parsed.success)
    return { status: "error", message: "의견 내용을 확인하세요." };
  try {
    await updateReviewNote(authenticated.client, parsed.data.noteId, parsed.data.body);
  } catch (error) {
    return reviewActionError(error, "의견 변경을 저장하지 못했습니다.");
  }
  revalidatePath(`/applications/${applicationId}`);
  return { status: "success", message: "새 의견 버전을 저장했습니다." };
}

export async function setRecruiterNoteDeletedAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  const applicationId = String(formData.get("applicationId") ?? "").trim();
  const parsed = setReviewNoteDeletedInputSchema.safeParse({
    noteId: String(formData.get("noteId") ?? "").trim(),
    reason: String(formData.get("reason") ?? ""),
  });
  const shouldDelete = String(formData.get("shouldDelete")) === "true";
  if (!isUuid(applicationId) || !parsed.success)
    return { status: "error", message: "삭제 또는 복구 사유를 입력하세요." };
  try {
    await setReviewNoteDeleted(
      authenticated.client,
      parsed.data.noteId,
      shouldDelete,
      parsed.data.reason,
    );
  } catch (error) {
    return reviewActionError(error, "의견 상태를 변경하지 못했습니다.");
  }
  revalidatePath(`/applications/${applicationId}`);
  return {
    status: "success",
    message: shouldDelete
      ? "의견을 숨기고 이력을 보존했습니다."
      : "의견을 복구하고 이력을 보존했습니다.",
  };
}

export async function markNotificationReadAction(formData: FormData) {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) return;
  const parsed = markNotificationReadInputSchema.safeParse({
    notificationId: String(formData.get("notificationId") ?? "").trim(),
  });
  if (!parsed.success) return;
  await markNotificationRead(authenticated.client, parsed.data.notificationId);
  revalidatePath("/", "layout");
}

export async function assignRequisitionApproverAction(
  _previousState: RequisitionActionState,
  formData: FormData,
): Promise<RequisitionActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (authenticated.viewer.role !== "HIRING_MANAGER") {
    return { status: "error", message: "승인자 지정은 배정된 채용 책임자만 할 수 있습니다." };
  }

  const parsed = assignRequisitionApproverInputSchema.safeParse({
    jobId: String(formData.get("jobId") ?? "").trim(),
    approverId: String(formData.get("approverId") ?? "").trim(),
  });
  if (!parsed.success) return { status: "error", message: "승인자를 선택한 뒤 다시 시도하세요." };

  try {
    const job = await getJobForScorecard(authenticated.client, parsed.data.jobId);
    if (!job || job.hiring_manager_id !== authenticated.viewer.id) {
      return { status: "error", message: "이 채용 요청의 승인자를 지정할 권한이 없습니다." };
    }
    await assignRequisitionApprover(authenticated.client, parsed.data);
  } catch (error) {
    return requisitionActionError(error, "승인자 지정에 실패했습니다. 잠시 후 다시 시도하세요.");
  }

  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { status: "success", message: "채용 요청 승인자를 지정했습니다." };
}

export async function submitRequisitionAction(
  _previousState: RequisitionActionState,
  formData: FormData,
): Promise<RequisitionActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated)
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  if (authenticated.viewer.role !== "HIRING_MANAGER") {
    return {
      status: "error",
      message: "채용 요청 제출은 배정된 채용 책임자만 할 수 있습니다.",
    };
  }

  const parsed = submitRequisitionInputSchema.safeParse({
    jobId: String(formData.get("jobId") ?? "").trim(),
  });
  if (!parsed.success)
    return {
      status: "error",
      message: "유효하지 않은 채용 요청입니다. 최신 화면을 다시 여세요.",
    };

  try {
    const [job, workspace] = await Promise.all([
      getJobForScorecard(authenticated.client, parsed.data.jobId),
      getScorecardWorkspaceForJob(authenticated.client, parsed.data.jobId),
    ]);
    if (!job || job.hiring_manager_id !== authenticated.viewer.id) {
      return { status: "error", message: "이 채용 요청을 제출할 권한이 없습니다." };
    }
    if (job.requisition_status !== "DRAFT" && job.requisition_status !== "RETURNED") {
      return {
        status: "error",
        message: "최신 상태에서는 제출할 수 없습니다. 화면을 새로 고치세요.",
      };
    }
    if (!job.requisition_approver_id || workspace.activeApprovedVersion === null) {
      return { status: "error", message: "승인자와 승인된 평가 기준을 확인한 뒤 제출하세요." };
    }
    await submitRequisition(authenticated.client, parsed.data);
  } catch (error) {
    return requisitionActionError(error, "채용 요청 제출에 실패했습니다. 잠시 후 다시 시도하세요.");
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return { status: "success", message: "채용 요청을 승인자에게 제출했습니다." };
}

export async function resolveRequisitionApprovalAction(
  _previousState: RequisitionActionState,
  formData: FormData,
): Promise<RequisitionActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  }
  if (authenticated.viewer.role !== "REQUISITION_APPROVER") {
    return {
      status: "error",
      message: "지정된 채용 요청 승인자만 승인 또는 반려할 수 있습니다.",
    };
  }

  const parsed = resolveRequisitionApprovalInputSchema.safeParse({
    jobId: String(formData.get("jobId") ?? "").trim(),
    status: String(formData.get("status") ?? "").trim(),
    reason: String(formData.get("reason") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "승인 또는 반려를 선택하고 1,000자 이내의 사유를 입력하세요.",
    };
  }

  try {
    const job = await getJobForScorecard(authenticated.client, parsed.data.jobId);
    if (!job || job.requisition_approver_id !== authenticated.viewer.id) {
      return { status: "error", message: "이 채용 요청을 처리할 권한이 없습니다." };
    }
    if (job.requisition_status !== "PENDING_APPROVAL") {
      return {
        status: "error",
        message: "이 채용 요청은 이미 처리되었습니다. 최신 결과를 확인하려면 화면을 새로 고치세요.",
      };
    }
    await resolveRequisitionApproval(authenticated.client, parsed.data);
  } catch (error) {
    return requisitionActionError(
      error,
      "승인 또는 반려 저장에 실패했습니다. 잠시 후 다시 시도하세요.",
    );
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  return {
    status: "success",
    message:
      parsed.data.status === "APPROVED"
        ? "채용 요청을 승인했습니다."
        : "채용 요청을 반려했습니다. 채용 책임자가 보완 후 다시 제출할 수 있습니다.",
  };
}

export async function createJobPostingDraftAction(
  _previousState: JobPostingActionState,
  formData: FormData,
): Promise<JobPostingActionState> {
  return runJobPostingAction(formData, "create");
}

export async function publishJobPostingAction(
  _previousState: JobPostingActionState,
  formData: FormData,
): Promise<JobPostingActionState> {
  return runJobPostingAction(formData, "publish");
}

export async function closeJobPostingAction(
  _previousState: JobPostingActionState,
  formData: FormData,
): Promise<JobPostingActionState> {
  return runJobPostingAction(formData, "close");
}

export async function updateJobPostingContentAction(
  _previousState: JobPostingActionState,
  formData: FormData,
): Promise<JobPostingActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  }

  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "RECRUITER") {
    return {
      status: "error",
      message: "채용 담당자 또는 관리자만 공개 공고를 관리할 수 있습니다.",
    };
  }

  const parsed = jobPostingContentInputSchema.safeParse({
    jobId: String(formData.get("jobId") ?? "").trim(),
    publicTitle: formData.get("publicTitle"),
    publicSummary: formData.get("publicSummary"),
    publicResponsibilities: formData.get("publicResponsibilities"),
    publicRequirements: formData.get("publicRequirements"),
    publicLocation: formData.get("publicLocation"),
    publicEmploymentType: formData.get("publicEmploymentType"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "공개 공고의 제목, 요약, 업무, 자격, 근무지, 고용 형태를 모두 입력하세요.",
    };
  }

  try {
    const job = await getJobForScorecard(client, parsed.data.jobId);
    if (!job || (viewer.role === "RECRUITER" && job.recruiter_id !== viewer.id)) {
      return { status: "error", message: "이 공개 공고를 관리할 권한이 없습니다." };
    }
    const posting = await getJobPosting(client, parsed.data.jobId);
    if (!posting) {
      return { status: "error", message: "먼저 채용 공고 초안을 만들어야 합니다." };
    }
    await updateJobPostingContent(client, parsed.data);
    revalidatePath(`/jobs/${parsed.data.jobId}`);
    revalidatePath(`/careers/${posting.public_slug}`);
  } catch (error) {
    return jobPostingActionError(
      error,
      "공고 내용을 저장하지 못했습니다. 잠시 후 다시 시도하세요.",
    );
  }

  return { status: "success", message: "후보자에게 공개할 공고 내용을 저장했습니다." };
}

async function runJobPostingAction(
  formData: FormData,
  operation: "create" | "publish" | "close",
): Promise<JobPostingActionState> {
  const authenticated = await getAuthenticatedViewer();
  if (!authenticated) {
    return { status: "error", message: "세션이 만료되었습니다. 다시 로그인하세요." };
  }
  const { client, viewer } = authenticated;
  if (viewer.role !== "ADMIN" && viewer.role !== "RECRUITER") {
    return {
      status: "error",
      message: "채용 담당자 또는 관리자만 채용 공고를 관리할 수 있습니다.",
    };
  }

  const parsed = jobPostingActionInputSchema.safeParse({
    jobId: String(formData.get("jobId") ?? "").trim(),
  });
  if (!parsed.success) {
    return { status: "error", message: "유효하지 않은 채용 공고 대상입니다." };
  }

  try {
    const job = await getJobForScorecard(client, parsed.data.jobId);
    if (!job || (viewer.role === "RECRUITER" && job.recruiter_id !== viewer.id)) {
      return { status: "error", message: "이 채용 공고를 관리할 권한이 없습니다." };
    }

    const posting = await getJobPosting(client, parsed.data.jobId);
    if (operation === "create" && posting) {
      return { status: "error", message: "이 채용 요청에는 이미 공고 초안이 있습니다." };
    }
    if (operation === "publish") {
      if (!posting || posting.status !== "DRAFT") {
        return { status: "error", message: "게시 가능한 Posting 초안을 최신 화면에서 확인하세요." };
      }
      const workspace = await getScorecardWorkspaceForJob(client, parsed.data.jobId);
      if (workspace.activeApprovedVersion === null) {
        return { status: "error", message: "승인된 Review Framework가 있어야 게시할 수 있습니다." };
      }
    }
    if (operation === "close" && (!posting || posting.status !== "PUBLISHED")) {
      return { status: "error", message: "게시 중인 Posting만 종료할 수 있습니다." };
    }

    if (operation === "create") await createJobPostingDraft(client, parsed.data);
    if (operation === "publish") await publishJobPosting(client, parsed.data);
    if (operation === "close") await closeJobPosting(client, parsed.data);
  } catch (error) {
    return jobPostingActionError(
      error,
      "채용 공고 상태를 저장하지 못했습니다. 잠시 후 다시 시도하세요.",
    );
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  const message =
    operation === "create"
      ? "채용 공고 초안을 만들었습니다."
      : operation === "publish"
        ? "채용 공고를 게시했습니다."
        : "채용 공고를 종료했습니다. 재개할 수 없습니다.";
  return { status: "success", message };
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

async function generateJobRequisitionDraftWithRetry(
  adapter: JobRequisitionDraftAdapter,
  input: JobRequisitionDraftPromptInput,
): Promise<JobRequisitionDraftAdapterResult> {
  try {
    return await adapter(input);
  } catch (error) {
    if (
      !(error instanceof JobRequisitionDraftAdapterError) ||
      !isRetryableJobRequisitionDraftError(error.code)
    ) {
      throw error;
    }
    return adapter(input);
  }
}

function isRetryableJobRequisitionDraftError(code: JobRequisitionDraftAdapterError["code"]) {
  return (
    code === "NETWORK_ERROR" || code === "TIMEOUT" || code === "HTTP_ERROR" || code === "INCOMPLETE"
  );
}

function isRetryableScorecardError(code: ScorecardDraftAdapterError["code"]) {
  return code === "NETWORK_ERROR" || code === "HTTP_ERROR" || code === "INCOMPLETE";
}

type AiDraftLogEntry = Readonly<{
  event: "started" | "succeeded" | "failed";
  operation: "job_requisition_draft" | "review_framework_draft";
  model: string;
  promptVersion: string;
  schemaVersion: string;
  durationMs?: number;
  errorCode?: string;
  httpStatus?: number;
  openAiRequestId?: string;
}>;

/**
 * Server-only diagnostics for web-triggered AI drafts. Intentionally excludes
 * form values, prompts, model output, API keys, user identity, and resume data.
 */
function logAiDraftRequest(entry: AiDraftLogEntry): void {
  console.info("[hirelens.ai_draft]", JSON.stringify(entry));
}

function logAiDraftFailure(
  input: Omit<AiDraftLogEntry, "event" | "errorCode" | "httpStatus" | "openAiRequestId"> & {
    error: unknown;
  },
): void {
  const adapterError =
    input.error instanceof JobRequisitionDraftAdapterError ||
    input.error instanceof ScorecardDraftAdapterError
      ? input.error
      : null;

  logAiDraftRequest({
    event: "failed",
    operation: input.operation,
    model: input.model,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    durationMs: input.durationMs,
    errorCode: adapterError?.code ?? "UNEXPECTED_ERROR",
    httpStatus: adapterError?.diagnostic?.httpStatus,
    openAiRequestId: adapterError?.diagnostic?.openAiRequestId,
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
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

    if (/issues must be confirmed/iu.test(error.responseBody)) {
      return { status: "error", message: "모든 확인 사항을 완료한 뒤 채용 요청을 진행하세요." };
    }

    if (/draft scorecard revision already exists/iu.test(error.responseBody)) {
      return { status: "error", message: "이미 작업 중인 새 초안 버전이 있습니다." };
    }
  }

  return { status: "error", message: fallback };
}

function requisitionActionError(error: unknown, fallback: string): RequisitionActionState {
  if (error instanceof SupabaseRestError) {
    if (error.status === 401 || error.status === 403) {
      return { status: "error", message: "현재 사용자에게 이 채용 요청 작업 권한이 없습니다." };
    }
    if (
      error.status === 409 ||
      /draft|returned|pending|stale|changed|approver|approved scorecard/iu.test(error.responseBody)
    ) {
      return {
        status: "error",
        message: "상태가 변경되었을 수 있습니다. 최신 화면을 새로 고친 뒤 다시 시도하세요.",
      };
    }
  }
  return { status: "error", message: fallback };
}

function jobPostingActionError(error: unknown, fallback: string): JobPostingActionState {
  if (error instanceof SupabaseRestError) {
    if (error.status === 401 || error.status === 403) {
      return { status: "error", message: "현재 사용자에게 이 채용 공고 작업 권한이 없습니다." };
    }
    if (
      error.status === 409 ||
      /draft|published|closed|approved requisition|approved review framework|public posting content|only one posting/iu.test(
        error.responseBody,
      )
    ) {
      return {
        status: "error",
        message: "상태가 변경되었을 수 있습니다. 최신 화면을 새로 고친 뒤 다시 시도하세요.",
      };
    }
  }
  return { status: "error", message: fallback };
}

function reviewActionError(error: unknown, fallback: string): ReviewActionState {
  if (error instanceof SupabaseRestError) {
    if (error.status === 401 || error.status === 403)
      return { status: "error", message: "현재 사용자에게 이 작업 권한이 없습니다." };
    if (/approved scorecard/iu.test(error.responseBody))
      return {
        status: "error",
        message: "승인된 지원서 평가 기준이 있어야 최종 결정을 저장할 수 있습니다.",
      };
  }
  return { status: "error", message: fallback };
}

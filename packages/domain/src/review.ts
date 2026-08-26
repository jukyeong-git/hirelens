import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, "Invalid UUID");

export const humanDecisionSchema = z.enum(["PROCEED", "HOLD", "DO_NOT_PROCEED"]);
export const reviewConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const interviewProgressionOutcomeSchema = z.enum([
  "INTERVIEW",
  "HOLD",
  "MORE_INFORMATION_REQUIRED",
]);

export const requestHiringManagerReviewInputSchema = z
  .object({
    applicationId: uuidSchema,
    note: z.string().trim().min(1).max(2_000).nullable().optional(),
  })
  .strict();

export const recordInterviewProgressionInputSchema = z
  .object({
    applicationId: uuidSchema,
    scorecardVersionId: uuidSchema,
    outcome: interviewProgressionOutcomeSchema,
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const createHumanReviewInputSchema = z
  .object({
    applicationId: uuidSchema,
    scorecardVersionId: uuidSchema,
    decision: humanDecisionSchema,
    reasonCode: z.string().trim().min(1).max(100),
    reasonDetail: z.string().trim().min(1).max(2_000),
    confidence: reviewConfidenceSchema,
    note: z.string().trim().min(1).max(2_000).nullable().optional(),
  })
  .strict();

export const createReviewNoteInputSchema = z
  .object({ applicationId: uuidSchema, body: z.string().trim().min(1).max(4_000) })
  .strict();
export const updateReviewNoteInputSchema = z
  .object({ noteId: uuidSchema, body: z.string().trim().min(1).max(4_000) })
  .strict();
export const setReviewNoteDeletedInputSchema = z
  .object({ noteId: uuidSchema, reason: z.string().trim().min(1).max(1_000) })
  .strict();

export type HumanDecision = z.infer<typeof humanDecisionSchema>;
export type ReviewConfidence = z.infer<typeof reviewConfidenceSchema>;
export type InterviewProgressionOutcome = z.infer<typeof interviewProgressionOutcomeSchema>;
export type RequestHiringManagerReviewInput = z.infer<typeof requestHiringManagerReviewInputSchema>;
export type RecordInterviewProgressionInput = z.infer<typeof recordInterviewProgressionInputSchema>;
export type CreateHumanReviewInput = z.infer<typeof createHumanReviewInputSchema>;
export type CreateReviewNoteInput = z.infer<typeof createReviewNoteInputSchema>;
export type UpdateReviewNoteInput = z.infer<typeof updateReviewNoteInputSchema>;
export type SetReviewNoteDeletedInput = z.infer<typeof setReviewNoteDeletedInputSchema>;

export interface HumanReviewRecord {
  id: string;
  application_id: string;
  scorecard_version_id: string;
  reviewer_id: string;
  decision: HumanDecision;
  reason_code: string;
  reason_detail: string;
  confidence: ReviewConfidence;
  note: string | null;
  supersedes_review_id: string | null;
  created_at: string;
}

export interface ReviewAssignmentRecord {
  id: string;
  application_id: string;
  assigned_to: string;
  assigned_by: string;
  request_note: string | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  created_at: string;
  completed_at: string | null;
}

export interface InterviewProgressionReviewRecord {
  id: string;
  application_id: string;
  scorecard_version_id: string;
  reviewer_id: string;
  outcome: InterviewProgressionOutcome;
  reason: string;
  supersedes_review_id: string | null;
  created_at: string;
}

export interface ReviewNoteRecord {
  id: string;
  application_id: string;
  author_id: string;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewNoteVersionRecord {
  id: string;
  note_id: string;
  version_number: number;
  body: string;
  created_by: string;
  created_at: string;
}

export interface ApplicationReviewRecord {
  id: string;
  candidate_id: string;
  job_id: string;
  source: string;
  submitted_at: string;
  workflow_state: string;
  created_at: string;
  candidate: { demo_label: string; full_name: string | null } | null;
}

interface CandidateTriageLabelInput {
  source: string;
  processingStatus: string | undefined;
  fullName: string | null | undefined;
  demoLabel: string | null | undefined;
}

export function candidateTriageLabel(input: CandidateTriageLabelInput): string {
  if (input.source !== "PUBLIC_POSTING") return input.demoLabel ?? "지원자";
  if (input.processingStatus !== "COMPLETED") return "공개 지원";
  return input.fullName ?? "이름 미입력";
}

export function candidateSourceLabel(source: string): string {
  return source === "PUBLIC_POSTING" ? "공개 지원" : "내부 등록";
}

import { z } from "zod";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, "Invalid UUID");

export const humanDecisionSchema = z.enum(["PROCEED", "HOLD", "DO_NOT_PROCEED"]);
export const reviewConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

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
  candidate: { demo_label: string } | null;
}

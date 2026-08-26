import { z } from "zod";

import { humanDecisionSchema, reviewConfidenceSchema } from "./review";

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, "Invalid UUID");

export const interviewCriterionVerdictSchema = z.enum([
  "MATCHED",
  "WEAKER",
  "STRONGER",
  "NOT_ASKED",
]);
export const interviewWeaknessTypeSchema = z.enum([
  "FALSE_CLAIM",
  "LEVEL_INSUFFICIENT",
  "AI_MISREAD",
]);
export const interviewObservationSourceSchema = z.enum(["FORM", "FREE_TEXT", "TRANSCRIPT"]);
export const criterionCalibrationStatusSchema = z.enum(["REVIEW_REQUIRED", "OBSERVING"]);

export const interviewObservationInputSchema = z
  .object({
    criterionId: uuidSchema,
    verdict: interviewCriterionVerdictSchema,
    weaknessType: interviewWeaknessTypeSchema.nullable(),
    note: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.verdict === "WEAKER" && observation.weaknessType === null) {
      context.addIssue({
        code: "custom",
        path: ["weaknessType"],
        message: "WEAKER observations require a weakness type",
      });
    }
    if (observation.verdict !== "WEAKER" && observation.weaknessType !== null) {
      context.addIssue({
        code: "custom",
        path: ["weaknessType"],
        message: "Only WEAKER observations may include a weakness type",
      });
    }
  });

export const postInterviewReviewInputSchema = z
  .object({
    applicationId: uuidSchema,
    scorecardVersionId: uuidSchema,
    observations: z.array(interviewObservationInputSchema).min(1).max(30),
    offCriteriaReason: z.string().trim().min(1).max(2_000).nullable(),
    decision: humanDecisionSchema,
    reasonCode: z.string().trim().min(1).max(100),
    reasonDetail: z.string().trim().min(1).max(2_000),
    confidence: reviewConfidenceSchema,
    note: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()
  .superRefine((review, context) => {
    const ids = new Set<string>();
    for (const [index, observation] of review.observations.entries()) {
      if (ids.has(observation.criterionId)) {
        context.addIssue({
          code: "custom",
          path: ["observations", index, "criterionId"],
          message: "Criterion observations must be unique",
        });
      }
      ids.add(observation.criterionId);
    }
  });

export type InterviewCriterionVerdict = z.infer<typeof interviewCriterionVerdictSchema>;
export type InterviewWeaknessType = z.infer<typeof interviewWeaknessTypeSchema>;
export type InterviewObservationSource = z.infer<typeof interviewObservationSourceSchema>;
export type CriterionCalibrationStatus = z.infer<typeof criterionCalibrationStatusSchema>;
export type InterviewObservationInput = z.infer<typeof interviewObservationInputSchema>;
export type PostInterviewReviewInput = z.infer<typeof postInterviewReviewInputSchema>;

export interface InterviewObservationSessionRecord {
  id: string;
  application_id: string;
  scorecard_version_id: string;
  reviewer_id: string;
  off_criteria_reason: string | null;
  supersedes_session_id: string | null;
  created_at: string;
}

export interface InterviewObservationRecord {
  id: string;
  interview_observation_session_id: string;
  application_id: string;
  criterion_id: string;
  criterion_lineage_id: string;
  verdict: InterviewCriterionVerdict;
  weakness_type: InterviewWeaknessType | null;
  note: string | null;
  source: InterviewObservationSource;
  ai_draft_accepted: boolean | null;
  confirmed_at: string | null;
  observer_id: string;
  created_at: string;
}

export interface CriterionCalibrationSummaryRecord {
  lineage_id: string;
  criterion_id: string;
  criterion_name: string;
  criterion_type: "REQUIRED" | "PREFERRED" | "INTERVIEW_ONLY";
  status: CriterionCalibrationStatus;
  supported_observations: number;
  level_insufficient_count: number;
  mismatch_ratio: number;
  false_claim_excluded_count: number;
  ai_misread_excluded_count: number;
  confirmed_observation_count: number;
}

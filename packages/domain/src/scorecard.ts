import { z } from "zod";

export const scorecardStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SUPERSEDED",
]);
export type ScorecardStatus = z.infer<typeof scorecardStatusSchema>;

export const criterionTypeSchema = z.enum(["REQUIRED", "PREFERRED", "INTERVIEW_ONLY"]);
export type CriterionType = z.infer<typeof criterionTypeSchema>;

export const ambiguityStatusSchema = z.enum(["CLEAR", "AMBIGUOUS", "HUMAN_ONLY"]);
export type AmbiguityStatus = z.infer<typeof ambiguityStatusSchema>;

export const ambiguityResolutionSchema = z.enum(["CLARIFY", "INTERVIEW_ONLY"]);
export type AmbiguityResolution = z.infer<typeof ambiguityResolutionSchema>;

export const ambiguousPhraseSchema = z
  .object({
    source_phrase: z.string().trim().max(500).nullable(),
    ambiguity_note: z.string().trim().max(1_000).nullable(),
    ambiguity_status: ambiguityStatusSchema,
    suggested_interview_question: z.string().trim().max(1_000).nullable(),
  })
  .strict();
export type AmbiguousPhrase = z.infer<typeof ambiguousPhraseSchema>;

export const evidenceFieldSchema = z
  .object({
    field_name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(500),
  })
  .strict();
export type EvidenceField = z.infer<typeof evidenceFieldSchema>;

export const scorecardCriterionSchema = z
  .object({
    client_id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(200),
    type: criterionTypeSchema,
    definition: z.string().trim().min(1).max(2_000),
    accepted_evidence: z.array(z.string().trim().min(1).max(500)).max(20),
    alternative_evidence: z.array(z.string().trim().min(1).max(500)).max(20),
    partial_evidence_guidance: z.string().trim().min(1).max(1_000).nullable(),
    evidence_fields: z.array(evidenceFieldSchema).max(20),
    resume_assessable: z.boolean(),
    source_phrase: z.string().trim().max(500).nullable(),
    ambiguity_note: z.string().trim().max(2_000).nullable(),
    ambiguity_status: ambiguityStatusSchema,
    suggested_interview_question: z.string().trim().max(1_000).nullable(),
    display_order: z.number().int().min(0).max(1000),
  })
  .strict()
  .superRefine((criterion, context) => {
    if (criterion.type === "INTERVIEW_ONLY" && criterion.resume_assessable) {
      context.addIssue({
        code: "custom",
        path: ["resume_assessable"],
        message: "INTERVIEW_ONLY criteria cannot be resume-assessable",
      });
    }

    if (criterion.ambiguity_status === "HUMAN_ONLY" && criterion.resume_assessable) {
      context.addIssue({
        code: "custom",
        path: ["resume_assessable"],
        message: "HUMAN_ONLY ambiguity cannot be resume-assessable",
      });
    }

    if (criterion.resume_assessable && criterion.accepted_evidence.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["accepted_evidence"],
        message: "Resume-assessable criteria require accepted evidence",
      });
    }
  });
export type ScorecardCriterion = z.infer<typeof scorecardCriterionSchema>;

export const scorecardDraftSchema = z
  .object({
    ambiguous_phrases: z.array(ambiguousPhraseSchema).max(30),
    criteria: z.array(scorecardCriterionSchema).min(1).max(30),
  })
  .strict()
  .superRefine((draft, context) => {
    const ids = new Set<string>();
    for (const [index, criterion] of draft.criteria.entries()) {
      if (ids.has(criterion.client_id)) {
        context.addIssue({
          code: "custom",
          path: ["criteria", index, "client_id"],
          message: "Criterion client_id values must be unique",
        });
      }
      ids.add(criterion.client_id);
    }
  });
export type ScorecardDraft = z.infer<typeof scorecardDraftSchema>;

const postgresUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, "Invalid UUID");

export const scorecardCriterionReviewSnapshotSchema = z
  .object({
    type: criterionTypeSchema,
    definition: z.string().trim().min(1).max(2_000),
    accepted_evidence: z.array(z.string().trim().min(1).max(500)).max(20),
    alternative_evidence: z.array(z.string().trim().min(1).max(500)).max(20),
    resume_assessable: z.boolean(),
    ambiguity_status: ambiguityStatusSchema,
    suggested_interview_question: z.string().trim().max(1_000).nullable(),
  })
  .strict();
export type ScorecardCriterionReviewSnapshot = z.infer<
  typeof scorecardCriterionReviewSnapshotSchema
>;

export const scorecardAmbiguityReviewInputSchema = z
  .object({
    jobId: postgresUuidSchema,
    scorecardVersionId: postgresUuidSchema,
    criterionId: postgresUuidSchema,
    resolution: ambiguityResolutionSchema,
    criterionType: criterionTypeSchema,
    definition: z.string().trim().min(1).max(2_000),
    acceptedEvidence: z.array(z.string().trim().min(1).max(500)).max(20),
    alternativeEvidence: z.array(z.string().trim().min(1).max(500)).max(20),
    resumeAssessable: z.boolean(),
    suggestedInterviewQuestion: z.string().trim().max(1_000).nullable(),
    reason: z.string().trim().min(3).max(1_000),
    expectedSnapshot: scorecardCriterionReviewSnapshotSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.resolution === "INTERVIEW_ONLY" && input.criterionType !== "INTERVIEW_ONLY") {
      context.addIssue({
        code: "custom",
        path: ["criterionType"],
        message: "INTERVIEW_ONLY resolution requires INTERVIEW_ONLY criterion type",
      });
    }

    if (input.resolution === "CLARIFY" && input.criterionType === "INTERVIEW_ONLY") {
      context.addIssue({
        code: "custom",
        path: ["criterionType"],
        message: "CLARIFY resolution requires REQUIRED or PREFERRED criterion type",
      });
    }

    if (input.criterionType === "INTERVIEW_ONLY" && input.resumeAssessable) {
      context.addIssue({
        code: "custom",
        path: ["resumeAssessable"],
        message: "INTERVIEW_ONLY criteria cannot be resume-assessable",
      });
    }

    if (input.resumeAssessable && input.acceptedEvidence.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["acceptedEvidence"],
        message: "Resume-assessable criteria require accepted evidence",
      });
    }
  });
export type ScorecardAmbiguityReviewInput = z.infer<typeof scorecardAmbiguityReviewInputSchema>;

export const scorecardApprovalInputSchema = z
  .object({
    scorecardVersionId: postgresUuidSchema,
    expectedVersionNumber: z.number().int().positive(),
    expectedStatus: z.literal("DRAFT"),
    expectedContentRevision: z.number().int().positive(),
  })
  .strict();
export type ScorecardApprovalInput = z.infer<typeof scorecardApprovalInputSchema>;

export const scorecardIssueConfirmationInputSchema = z
  .object({
    scorecardVersionId: postgresUuidSchema,
    expectedContentRevision: z.number().int().positive(),
    issueScope: z.enum(["JOB_DESCRIPTION", "EVALUATION_CRITERION"]),
    issueKey: z.string().trim().min(1).max(100),
  })
  .strict();
export type ScorecardIssueConfirmationInput = z.infer<
  typeof scorecardIssueConfirmationInputSchema
>;

export const scorecardDraftUpdateInputSchema = z
  .object({
    scorecardVersionId: postgresUuidSchema,
    expectedVersionNumber: z.number().int().positive(),
    expectedStatus: z.literal("DRAFT"),
    expectedContentRevision: z.number().int().positive(),
  })
  .strict();
export type ScorecardDraftUpdateInput = z.infer<typeof scorecardDraftUpdateInputSchema>;

export interface ScorecardVersionRecord {
  id: string;
  job_id: string;
  version_number: number;
  status: ScorecardStatus;
  source_job_description_hash: string;
  prompt_version: string;
  schema_version: string;
  model_id: string;
  ambiguous_phrases: AmbiguousPhrase[];
  confirmed_job_description_issue_keys: string[];
  confirmed_evaluation_criterion_ids: string[];
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  content_revision: number;
  created_at: string;
}

export interface CriterionRecord extends ScorecardCriterion {
  id: string;
  scorecard_version_id: string;
  created_at: string;
}

export interface ScorecardDetail {
  version: ScorecardVersionRecord;
  criteria: CriterionRecord[];
}

export interface ScorecardVersionHistoryRecord extends ScorecardVersionRecord {
  approver: { display_name: string } | null;
}

export interface ScorecardWorkspace {
  latestWorkingVersion: ScorecardDetail | null;
  activeApprovedVersion: ScorecardDetail | null;
  versionHistory: ScorecardVersionHistoryRecord[];
}

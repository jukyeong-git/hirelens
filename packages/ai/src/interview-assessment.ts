import { z } from "zod";

import { normalizeEvidenceText } from "./evidence";
import {
  INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS,
  INTERVIEW_ASSESSMENT_SCHEMA_NAME,
} from "./versions";

/**
 * The transcript assessment: a drafted verdict per criterion, quoted from what
 * was actually said.
 *
 * This is the "after the interview" half. It drafts; it never records. Every
 * drafted verdict reaches the database as `source = 'TRANSCRIPT'` with
 * `ai_draft_accepted = false` until the interviewer accepts it, and the
 * calibration summary counts only confirmed observations — so nothing here can
 * move a criterion into REVIEW_REQUIRED on its own.
 *
 * The quote rule is the same one the resume evidence pipeline enforces: a
 * verdict that cites the transcript must cite it verbatim, checked as a
 * normalized substring. A fabricated quote fails validation and the whole draft
 * is rejected rather than shown.
 */

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const text = (max: number) => z.string().trim().min(1).max(max);

export const interviewAssessmentCriterionSchema = z
  .object({
    criterion_id: uuidSchema,
    verdict: z.enum(["MATCHED", "WEAKER", "STRONGER", "NOT_ASKED"]),
    weakness_type: z.enum(["FALSE_CLAIM", "LEVEL_INSUFFICIENT", "AI_MISREAD"]).nullable(),
    /** Why the transcript supports this verdict. Shown next to the draft. */
    rationale: text(600),
    /** Verbatim from the transcript. Null only when nothing was said. */
    transcript_quote: text(1_000).nullable(),
  })
  .strict()
  .superRefine((criterion, context) => {
    if ((criterion.verdict === "WEAKER") !== (criterion.weakness_type !== null)) {
      context.addIssue({
        code: "custom",
        path: ["weakness_type"],
        message: "WEAKER requires a weakness type and other verdicts forbid it",
      });
    }
    if (criterion.verdict === "NOT_ASKED" && criterion.transcript_quote !== null) {
      context.addIssue({
        code: "custom",
        path: ["transcript_quote"],
        message: "NOT_ASKED cannot cite the transcript",
      });
    }
    if (criterion.verdict !== "NOT_ASKED" && criterion.transcript_quote === null) {
      context.addIssue({
        code: "custom",
        path: ["transcript_quote"],
        message: "a verdict other than NOT_ASKED must cite the transcript",
      });
    }
  });

export const interviewAssessmentSchema = z
  .object({
    criteria: z.array(interviewAssessmentCriterionSchema).min(1).max(20),
  })
  .strict();

export type InterviewAssessment = z.infer<typeof interviewAssessmentSchema>;
export type InterviewAssessmentCriterion = z.infer<typeof interviewAssessmentCriterionSchema>;

export const interviewAssessmentPromptInputSchema = z
  .object({
    role_title: text(200),
    transcript: text(40_000),
    criteria: z
      .array(
        z
          .object({
            criterion_id: uuidSchema,
            name: text(200),
            type: z.enum(["REQUIRED", "PREFERRED", "INTERVIEW_ONLY"]),
            definition: text(2_000),
            accepted_evidence: z.array(text(500)).max(20),
            excluded_evidence: z.array(text(500)).max(20),
            resume_claim: text(1_000).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export type InterviewAssessmentPromptInput = z.infer<typeof interviewAssessmentPromptInputSchema>;

export const interviewAssessmentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["criteria"],
  properties: {
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion_id", "verdict", "weakness_type", "rationale", "transcript_quote"],
        properties: {
          criterion_id: { type: "string" },
          verdict: { type: "string", enum: ["MATCHED", "WEAKER", "STRONGER", "NOT_ASKED"] },
          weakness_type: {
            type: ["string", "null"],
            enum: ["FALSE_CLAIM", "LEVEL_INSUFFICIENT", "AI_MISREAD", null],
          },
          rationale: { type: "string" },
          transcript_quote: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export const interviewAssessmentResponseFormat = {
  type: "json_schema",
  name: INTERVIEW_ASSESSMENT_SCHEMA_NAME,
  strict: true,
  schema: interviewAssessmentJsonSchema,
} as const;

export type InterviewAssessmentValidationCode =
  | "UNKNOWN_CRITERION"
  | "MISSING_CRITERION"
  | "QUOTE_NOT_FOUND";

export class InterviewAssessmentValidationError extends Error {
  constructor(
    public readonly code: InterviewAssessmentValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "InterviewAssessmentValidationError";
  }
}

export function validateInterviewAssessment(
  input: unknown,
  context: InterviewAssessmentPromptInput,
): InterviewAssessment {
  const assessment = interviewAssessmentSchema.parse(input);
  const allowed = new Set(context.criteria.map((criterion) => criterion.criterion_id));
  const returned = new Set<string>();
  const normalizedTranscript = normalizeEvidenceText(context.transcript);
  for (const criterion of assessment.criteria) {
    if (!allowed.has(criterion.criterion_id)) {
      throw new InterviewAssessmentValidationError(
        "UNKNOWN_CRITERION",
        `assessment references a criterion that was not supplied: ${criterion.criterion_id}`,
      );
    }
    returned.add(criterion.criterion_id);
    if (
      criterion.transcript_quote !== null &&
      !normalizedTranscript.includes(normalizeEvidenceText(criterion.transcript_quote))
    ) {
      throw new InterviewAssessmentValidationError(
        "QUOTE_NOT_FOUND",
        `quote for criterion ${criterion.criterion_id} is not a verbatim excerpt of the transcript`,
      );
    }
  }
  for (const criterionId of allowed) {
    if (!returned.has(criterionId)) {
      throw new InterviewAssessmentValidationError(
        "MISSING_CRITERION",
        `assessment omitted criterion ${criterionId}`,
      );
    }
  }
  return assessment;
}

export const interviewAssessmentContract = {
  ...INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS,
  schemaName: INTERVIEW_ASSESSMENT_SCHEMA_NAME,
} as const;

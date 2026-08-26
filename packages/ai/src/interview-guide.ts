import { z } from "zod";

import { INTERVIEW_GUIDE_CONTRACT_VERSIONS, INTERVIEW_GUIDE_SCHEMA_NAME } from "./versions";

/**
 * The interview guide: what to probe, given what the submitted material did and
 * did not establish.
 *
 * This is the "before the interview" half of the judgment loop. It never says
 * whether to hire; it says which criteria the resume left unsettled and what to
 * ask so the interview settles them. The high-value case is the criterion the
 * resume appears to satisfy on a loose reading — the exact case that later shows
 * up as LEVEL_INSUFFICIENT and moves the criterion into REVIEW_REQUIRED. Asking
 * about it up front is what makes the outcome data worth collecting.
 */

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu);
const text = (max: number) => z.string().trim().min(1).max(max);

export const interviewProbePrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type InterviewProbePriority = z.infer<typeof interviewProbePrioritySchema>;

export const interviewGuideQuestionSchema = z
  .object({
    question: text(400),
    /** What an adequate answer must contain, so the verdict is not a vibe. */
    listen_for: text(400),
  })
  .strict();

export const interviewGuideCriterionSchema = z
  .object({
    criterion_id: uuidSchema,
    probe_priority: interviewProbePrioritySchema,
    /** Why this criterion still needs asking, phrased against the material. */
    rationale: text(600),
    questions: z.array(interviewGuideQuestionSchema).min(1).max(3),
  })
  .strict();

export const interviewGuideSchema = z
  .object({
    criteria: z.array(interviewGuideCriterionSchema).min(1).max(20),
    opening_note: text(600),
  })
  .strict();

export type InterviewGuide = z.infer<typeof interviewGuideSchema>;
export type InterviewGuideCriterion = z.infer<typeof interviewGuideCriterionSchema>;

export const interviewGuidePromptInputSchema = z
  .object({
    role_title: text(200),
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
            /** What the pipeline found in the submitted material, verbatim. */
            evidence_status: z.enum([
              "SUPPORTED",
              "PARTIAL",
              "NOT_FOUND",
              "CONTRADICTED",
              "HUMAN_ONLY",
              "PENDING",
            ]),
            evidence_quotes: z.array(text(1_000)).max(5),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export type InterviewGuidePromptInput = z.infer<typeof interviewGuidePromptInputSchema>;

export const interviewGuideJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["criteria", "opening_note"],
  properties: {
    opening_note: { type: "string" },
    criteria: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["criterion_id", "probe_priority", "rationale", "questions"],
        properties: {
          criterion_id: { type: "string" },
          probe_priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          rationale: { type: "string" },
          questions: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["question", "listen_for"],
              properties: {
                question: { type: "string" },
                listen_for: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const interviewGuideResponseFormat = {
  type: "json_schema",
  name: INTERVIEW_GUIDE_SCHEMA_NAME,
  strict: true,
  schema: interviewGuideJsonSchema,
} as const;

export type InterviewGuideValidationCode = "UNKNOWN_CRITERION" | "MISSING_CRITERION";

export class InterviewGuideValidationError extends Error {
  constructor(
    public readonly code: InterviewGuideValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "InterviewGuideValidationError";
  }
}

/**
 * Every supplied criterion must come back exactly once. A guide that silently
 * drops a criterion would let the interview skip it, and a skipped criterion
 * produces no observation — which is how a bad criterion survives a round.
 */
export function validateInterviewGuide(
  input: unknown,
  context: InterviewGuidePromptInput,
): InterviewGuide {
  const guide = interviewGuideSchema.parse(input);
  const allowed = new Set(context.criteria.map((criterion) => criterion.criterion_id));
  const returned = new Set<string>();
  for (const criterion of guide.criteria) {
    if (!allowed.has(criterion.criterion_id)) {
      throw new InterviewGuideValidationError(
        "UNKNOWN_CRITERION",
        `guide references a criterion that was not supplied: ${criterion.criterion_id}`,
      );
    }
    returned.add(criterion.criterion_id);
  }
  for (const criterionId of allowed) {
    if (!returned.has(criterionId)) {
      throw new InterviewGuideValidationError(
        "MISSING_CRITERION",
        `guide omitted criterion ${criterionId}`,
      );
    }
  }
  return guide;
}

export const interviewGuideContract = {
  ...INTERVIEW_GUIDE_CONTRACT_VERSIONS,
  schemaName: INTERVIEW_GUIDE_SCHEMA_NAME,
} as const;

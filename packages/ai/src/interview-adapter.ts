import {
  interviewAssessmentPromptInputSchema,
  interviewAssessmentResponseFormat,
  validateInterviewAssessment,
  InterviewAssessmentValidationError,
  type InterviewAssessment,
  type InterviewAssessmentPromptInput,
} from "./interview-assessment";
import {
  interviewGuidePromptInputSchema,
  interviewGuideResponseFormat,
  validateInterviewGuide,
  InterviewGuideValidationError,
  type InterviewGuide,
  type InterviewGuidePromptInput,
} from "./interview-guide";
import {
  buildInterviewAssessmentPrompt,
  buildInterviewGuidePrompt,
  INTERVIEW_ASSESSMENT_SYSTEM_PROMPT,
  INTERVIEW_GUIDE_SYSTEM_PROMPT,
} from "./interview-prompt";
import {
  assertStructuredAdapterOptions,
  callStructured,
  StructuredAdapterError,
  type StructuredAdapterOptions,
  type StructuredAdapterUsage,
} from "./structured-adapter";
import {
  INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS,
  INTERVIEW_GUIDE_CONTRACT_VERSIONS,
  type InterviewAssessmentContractVersions,
  type InterviewGuideContractVersions,
} from "./versions";

export type InterviewAdapterOptions = StructuredAdapterOptions;
export { StructuredAdapterError as InterviewAdapterError };

export interface InterviewGuideAdapterResult {
  guide: InterviewGuide;
  versions: InterviewGuideContractVersions;
  usage: StructuredAdapterUsage;
}

export interface InterviewGuideAdapter {
  (input: InterviewGuidePromptInput): Promise<InterviewGuideAdapterResult>;
  versions: InterviewGuideContractVersions;
}

export function createInterviewGuideAdapter(
  options: InterviewAdapterOptions,
): InterviewGuideAdapter {
  assertStructuredAdapterOptions(options);
  const versions: InterviewGuideContractVersions = {
    model: options.model,
    ...INTERVIEW_GUIDE_CONTRACT_VERSIONS,
  };
  const generate = async (
    rawInput: InterviewGuidePromptInput,
  ): Promise<InterviewGuideAdapterResult> => {
    const input = interviewGuidePromptInputSchema.parse(rawInput);
    const { result, usage } = await callStructured(
      options,
      {
        systemPrompt: INTERVIEW_GUIDE_SYSTEM_PROMPT,
        userPrompt: buildInterviewGuidePrompt(input),
        responseFormat: interviewGuideResponseFormat,
        validate: (decoded) => {
          try {
            return validateInterviewGuide(decoded, input);
          } catch (error) {
            throw new StructuredAdapterError(
              "INVALID_SCHEMA",
              error instanceof InterviewGuideValidationError
                ? error.message
                : "Interview guide output failed strict runtime validation",
            );
          }
        },
      },
      "Interview guide",
    );
    return { guide: result, versions, usage };
  };
  return Object.assign(generate, { versions });
}

export interface InterviewAssessmentAdapterResult {
  assessment: InterviewAssessment;
  versions: InterviewAssessmentContractVersions;
  usage: StructuredAdapterUsage;
}

export interface InterviewAssessmentAdapter {
  (input: InterviewAssessmentPromptInput): Promise<InterviewAssessmentAdapterResult>;
  versions: InterviewAssessmentContractVersions;
}

export function createInterviewAssessmentAdapter(
  options: InterviewAdapterOptions,
): InterviewAssessmentAdapter {
  assertStructuredAdapterOptions(options);
  const versions: InterviewAssessmentContractVersions = {
    model: options.model,
    ...INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS,
  };
  const generate = async (
    rawInput: InterviewAssessmentPromptInput,
  ): Promise<InterviewAssessmentAdapterResult> => {
    const input = interviewAssessmentPromptInputSchema.parse(rawInput);
    const { result, usage } = await callStructured(
      options,
      {
        systemPrompt: INTERVIEW_ASSESSMENT_SYSTEM_PROMPT,
        userPrompt: buildInterviewAssessmentPrompt(input),
        responseFormat: interviewAssessmentResponseFormat,
        validate: (decoded) => {
          try {
            return validateInterviewAssessment(decoded, input);
          } catch (error) {
            throw new StructuredAdapterError(
              "INVALID_SCHEMA",
              error instanceof InterviewAssessmentValidationError
                ? error.message
                : "Interview assessment output failed strict runtime validation",
            );
          }
        },
      },
      "Interview assessment",
    );
    return { assessment: result, versions, usage };
  };
  return Object.assign(generate, { versions });
}

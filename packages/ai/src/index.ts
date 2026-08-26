export const AI_PACKAGE_NAME = "@hirelens/ai" as const;

export {
  ambiguityStatusSchema,
  criterionDraftClientIdSchema,
  criterionTypeSchema,
  evidenceFieldSchema,
  parseScorecardDraft,
  scorecardDraftAmbiguousPhraseSchema,
  scorecardDraftContract,
  scorecardDraftCriterionSchema,
  scorecardDraftJsonSchema,
  scorecardDraftPromptInputSchema,
  scorecardDraftResponseFormat,
  scorecardDraftSchema,
  validateScorecardDraft,
  ScorecardDraftValidationError,
} from "./scorecard-draft";
export type {
  AmbiguityStatus,
  CriterionType,
  EvidenceField,
  ScorecardDraft,
  ScorecardDraftAmbiguousPhrase,
  ScorecardDraftCriterion,
  ScorecardDraftPromptInput,
} from "./scorecard-draft";

export { buildScorecardDraftPrompt, SCORECARD_DRAFT_SYSTEM_PROMPT } from "./prompt";

export {
  jobRequisitionDraftContract,
  jobRequisitionDraftJsonSchema,
  jobRequisitionDraftPromptInputSchema,
  jobRequisitionDraftResponseFormat,
  jobRequisitionDraftSchema,
  parseJobRequisitionDraft,
} from "./job-requisition-draft";
export type { JobRequisitionDraft, JobRequisitionDraftPromptInput } from "./job-requisition-draft";

export {
  buildJobRequisitionDraftPrompt,
  JOB_REQUISITION_DRAFT_SYSTEM_PROMPT,
} from "./job-requisition-prompt";

export {
  evidenceExtractionJsonSchema,
  evidenceExtractionSchema,
  evidenceSourceSchema,
  evidenceStatusSchema,
  normalizeEvidenceText,
  validateEvidenceExtraction,
  EvidenceValidationError,
  criterionEvidenceSchema,
} from "./evidence";
export type {
  CriterionEvidence,
  EvidenceExtraction,
  EvidenceSource,
  EvidenceStatus,
  EvidenceValidationCode,
  EvidenceValidationContext,
} from "./evidence";
export { buildEvidencePrompt, EVIDENCE_SYSTEM_PROMPT } from "./evidence-prompt";

export { SCORECARD_DRAFT_CONTRACT_VERSIONS, SCORECARD_DRAFT_SCHEMA_NAME } from "./versions";
export {
  JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS,
  JOB_REQUISITION_DRAFT_SCHEMA_NAME,
} from "./versions";
export type {
  EvidenceContractVersions,
  JobRequisitionDraftContractVersions,
  ScorecardDraftContractVersions,
} from "./versions";
export { EVIDENCE_CONTRACT_VERSIONS, EVIDENCE_SCHEMA_NAME } from "./versions";
export {
  frameworkRevisionChangeTypeSchema,
  frameworkRevisionContract,
  frameworkRevisionCriterionSchema,
  frameworkRevisionJsonSchema,
  frameworkRevisionPromptInputSchema,
  frameworkRevisionResponseFormat,
  frameworkRevisionSchema,
  validateFrameworkRevision,
  FrameworkRevisionValidationError,
} from "./revision";
export type {
  FrameworkRevision,
  FrameworkRevisionChangeType,
  FrameworkRevisionPromptInput,
} from "./revision";
export { buildFrameworkRevisionPrompt, FRAMEWORK_REVISION_SYSTEM_PROMPT } from "./revision-prompt";
export { FRAMEWORK_REVISION_CONTRACT_VERSIONS, FRAMEWORK_REVISION_SCHEMA_NAME } from "./versions";
export type { FrameworkRevisionContractVersions } from "./versions";

export {
  interviewGuideContract,
  interviewGuideCriterionSchema,
  interviewGuideJsonSchema,
  interviewGuidePromptInputSchema,
  interviewGuideQuestionSchema,
  interviewGuideResponseFormat,
  interviewGuideSchema,
  interviewProbePrioritySchema,
  validateInterviewGuide,
  InterviewGuideValidationError,
} from "./interview-guide";
export type {
  InterviewGuide,
  InterviewGuideCriterion,
  InterviewGuidePromptInput,
  InterviewProbePriority,
} from "./interview-guide";

export {
  interviewAssessmentContract,
  interviewAssessmentCriterionSchema,
  interviewAssessmentJsonSchema,
  interviewAssessmentPromptInputSchema,
  interviewAssessmentResponseFormat,
  interviewAssessmentSchema,
  validateInterviewAssessment,
  InterviewAssessmentValidationError,
} from "./interview-assessment";
export type {
  InterviewAssessment,
  InterviewAssessmentCriterion,
  InterviewAssessmentPromptInput,
} from "./interview-assessment";

export {
  buildInterviewAssessmentPrompt,
  buildInterviewGuidePrompt,
  INTERVIEW_ASSESSMENT_SYSTEM_PROMPT,
  INTERVIEW_GUIDE_SYSTEM_PROMPT,
} from "./interview-prompt";

export {
  createInterviewAssessmentAdapter,
  createInterviewGuideAdapter,
  InterviewAdapterError,
} from "./interview-adapter";
export type {
  InterviewAdapterOptions,
  InterviewAssessmentAdapter,
  InterviewAssessmentAdapterResult,
  InterviewGuideAdapter,
  InterviewGuideAdapterResult,
} from "./interview-adapter";

export {
  INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS,
  INTERVIEW_ASSESSMENT_SCHEMA_NAME,
  INTERVIEW_GUIDE_CONTRACT_VERSIONS,
  INTERVIEW_GUIDE_SCHEMA_NAME,
} from "./versions";
export type {
  InterviewAssessmentContractVersions,
  InterviewGuideContractVersions,
} from "./versions";

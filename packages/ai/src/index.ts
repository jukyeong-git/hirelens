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

export { SCORECARD_DRAFT_CONTRACT_VERSIONS, SCORECARD_DRAFT_SCHEMA_NAME } from "./versions";
export type { ScorecardDraftContractVersions } from "./versions";

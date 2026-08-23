export { parseEnvironment } from "./env";
export type { RuntimeEnvironment } from "./env";
export { appRoleSchema, createJobInputSchema, jobStatusSchema } from "./job";
export type {
  AppRole,
  CreateJobInput,
  JobListItem,
  JobRecord,
  JobSummary,
  JobStatus,
  ProfileRecord,
} from "./job";
export {
  ambiguityResolutionSchema,
  ambiguityStatusSchema,
  ambiguousPhraseSchema,
  criterionTypeSchema,
  scorecardAmbiguityReviewInputSchema,
  scorecardApprovalInputSchema,
  scorecardCriterionSchema,
  scorecardCriterionReviewSnapshotSchema,
  scorecardDraftSchema,
  scorecardRevisionInputSchema,
  scorecardStatusSchema,
} from "./scorecard";
export type {
  AmbiguityResolution,
  AmbiguityStatus,
  AmbiguousPhrase,
  CriterionType,
  CriterionRecord,
  ScorecardAmbiguityReviewInput,
  ScorecardApprovalInput,
  ScorecardCriterion,
  ScorecardCriterionReviewSnapshot,
  ScorecardDetail,
  ScorecardDraft,
  ScorecardRevisionInput,
  ScorecardStatus,
  ScorecardVersionRecord,
  ScorecardVersionHistoryRecord,
  ScorecardWorkspace,
} from "./scorecard";

export const DOMAIN_PACKAGE_NAME = "@hirelens/domain" as const;

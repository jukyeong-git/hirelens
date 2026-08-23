export const DATABASE_PACKAGE_NAME = "@hirelens/database" as const;

export { createSupabaseRestClient, SupabaseRestError } from "./rest";
export type { SupabaseRestClient, SupabaseRestClientOptions } from "./rest";
export { createJob, getJobForScorecard, getProfile, listJobs, listProfiles } from "./jobs";
export {
  approveScorecard,
  createScorecardDraft,
  createScorecardRevision,
  getScorecardForJob,
  getScorecardWorkspaceForJob,
  reviewScorecardAmbiguity,
} from "./scorecards";
export type {
  ApproveScorecardRequest,
  CreateScorecardDraftRequest,
  CreateScorecardRevisionRequest,
  ReviewScorecardAmbiguityRequest,
} from "./scorecards";

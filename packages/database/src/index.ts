export const DATABASE_PACKAGE_NAME = "@hirelens/database" as const;

export { createSupabaseRestClient, SupabaseRestError } from "./rest";
export type { SupabaseRestClient, SupabaseRestClientOptions } from "./rest";
export { createJob, getJobForScorecard, getProfile, listJobs, listProfiles } from "./jobs";
export { getApplicationForReview, listApplicationsForJob } from "./applications";
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
export { createHumanReview, listHumanReviews } from "./reviews";
export {
  createReviewNote,
  listReviewNotes,
  listReviewNoteVersions,
  setReviewNoteDeleted,
  updateReviewNote,
} from "./notes";
export { listNotifications, markNotificationRead } from "./notifications";
export {
  cancelResumeUploadReservation,
  createResumeUploadReservation,
  finalizeUploadedResume,
  listResumeFilesForApplication,
  listResumeProcessingRunsForApplication,
  claimResumeExtractionRun,
  completeResumeExtraction,
  markResumeExtractionNeedsOcr,
  failResumeExtraction,
  getResumeProcessingRun,
} from "./resumes";
export type { ClaimedResumeExtractionRun, CreateResumeUploadReservationRequest } from "./resumes";

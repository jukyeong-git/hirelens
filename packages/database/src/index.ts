export const DATABASE_PACKAGE_NAME = "@hirelens/database" as const;

export { createSupabaseRestClient, SupabaseRestError } from "./rest";
export type { SupabaseRestClient, SupabaseRestClientOptions } from "./rest";
export {
  assignRequisitionApprover,
  closeJobPosting,
  createJob,
  createJobPostingDraft,
  getJobPosting,
  getPublicJobPosting,
  getJobForScorecard,
  getProfile,
  listJobs,
  listJobPostingStatusHistory,
  listPublicJobPostings,
  listProfiles,
  listRequisitionStatusHistory,
  resolveRequisitionApproval,
  publishJobPosting,
  updateJobPostingContent,
  submitRequisition,
} from "./jobs";
export { getApplicationForReview, listApplicationsForJob } from "./applications";
export {
  approveScorecard,
  createScorecardDraft,
  createScorecardRevision,
  getScorecardForJob,
  getScorecardVersion,
  getScorecardWorkspaceForJob,
  reviewScorecardAmbiguity,
} from "./scorecards";
export type {
  ApproveScorecardRequest,
  CreateScorecardDraftRequest,
  CreateScorecardRevisionRequest,
  ReviewScorecardAmbiguityRequest,
} from "./scorecards";
export {
  createHumanReview,
  listHumanReviews,
  listReviewAssignments,
  requestHiringManagerReview,
  listInterviewProgressionReviews,
  recordInterviewProgression,
  listApplicationAuditEvents,
} from "./reviews";
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
  cancelPublicResumeSubmission,
  createResumeUploadReservation,
  createPublicResumeSubmission,
  finalizeUploadedResume,
  finalizePublicResumeSubmission,
  listResumeFilesForApplication,
  listResumeProcessingRunsForApplication,
  getResumeProcessingRun,
} from "./resumes";
export {
  claimEvidenceProcessingRun,
  completeExtractionForEvidence,
  markEvidenceNeedsOcr,
  loadEvidenceAnalysisContext,
  markEvidenceValidating,
  persistValidatedEvidence,
  recordProcessingFailure,
  listEvidenceItemsForRuns,
  listResumePagesForRuns,
} from "./evidence";
export type {
  CreateResumeUploadReservationRequest,
  PublicResumeSubmissionRequest,
} from "./resumes";

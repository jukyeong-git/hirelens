export const DATABASE_PACKAGE_NAME = "@hirelens/database" as const;

export { createSupabaseRestClient, SupabaseRestError } from "./rest";
export type { SupabaseRestClient, SupabaseRestClientOptions } from "./rest";
export {
  assignRequisitionApprover,
  closeJobPosting,
  createJob,
  discardJobDraft,
  createJobPostingDraft,
  getJobPosting,
  listJobPostingsForJobs,
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
  updateJobBasicInfo,
  submitRequisition,
} from "./jobs";
export {
  getApplicationForReview,
  listApplicationsForJob,
  listApplicationsForJobs,
} from "./applications";
export {
  approveScorecard,
  confirmScorecardIssue,
  createScorecardDraft,
  getScorecardForJob,
  getScorecardVersion,
  getScorecardWorkspaceForJob,
  reviewScorecardAmbiguity,
  updateScorecardDraft,
} from "./scorecards";
export type {
  ApproveScorecardRequest,
  CreateScorecardDraftRequest,
  ReviewScorecardAmbiguityRequest,
  UpdateScorecardDraftRequest,
} from "./scorecards";
export {
  createHumanReview,
  listHumanReviews,
  listReviewAssignments,
  requestHiringManagerReview,
  listInterviewProgressionReviews,
  recordInterviewProgression,
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
  renewEvidenceProcessingLease,
  listEvidenceItemsForRuns,
  listResumePagesForRuns,
  dequeueEvidenceQueueMessage,
  quarantineMalformedEvidenceQueueMessage,
  settleEvidenceQueueMessage,
} from "./evidence";
export type { EvidenceQueueMessage } from "./evidence";
export type {
  CreateResumeUploadReservationRequest,
  PublicResumeSubmissionRequest,
} from "./resumes";

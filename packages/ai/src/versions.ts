export const SCORECARD_DRAFT_CONTRACT_VERSIONS = {
  pipeline: "ai-pipeline-v2",
  prompt: "scorecard-draft-prompt-v4",
  schema: "scorecard-draft-schema-v3",
} as const;

export type ScorecardDraftContractVersions = {
  model: string;
  pipeline: typeof SCORECARD_DRAFT_CONTRACT_VERSIONS.pipeline;
  prompt: typeof SCORECARD_DRAFT_CONTRACT_VERSIONS.prompt;
  schema: typeof SCORECARD_DRAFT_CONTRACT_VERSIONS.schema;
};

export const SCORECARD_DRAFT_SCHEMA_NAME = "hirelens_scorecard_draft" as const;

export const JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS = {
  pipeline: "ai-pipeline-v1",
  prompt: "job-requisition-draft-prompt-v5",
  schema: "job-requisition-draft-schema-v2",
} as const;

export type JobRequisitionDraftContractVersions = {
  model: string;
  pipeline: typeof JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.pipeline;
  prompt: typeof JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.prompt;
  schema: typeof JOB_REQUISITION_DRAFT_CONTRACT_VERSIONS.schema;
};

export const JOB_REQUISITION_DRAFT_SCHEMA_NAME = "hirelens_job_requisition_draft" as const;

export const EVIDENCE_CONTRACT_VERSIONS = {
  pipeline: "evidence-pipeline-v1",
  prompt: "evidence-extraction-prompt-v3",
  schema: "evidence-extraction-schema-v2",
} as const;
export const EVIDENCE_SCHEMA_NAME = "hirelens_evidence_extraction_v2" as const;
export type EvidenceContractVersions = {
  model: string;
  pipeline: typeof EVIDENCE_CONTRACT_VERSIONS.pipeline;
  prompt: typeof EVIDENCE_CONTRACT_VERSIONS.prompt;
  schema: typeof EVIDENCE_CONTRACT_VERSIONS.schema;
};

export const FRAMEWORK_REVISION_CONTRACT_VERSIONS = {
  pipeline: "framework-revision-pipeline-v1",
  prompt: "framework-revision-prompt-v1",
  schema: "framework-revision-schema-v1",
} as const;
export const FRAMEWORK_REVISION_SCHEMA_NAME = "hirelens_framework_revision_v1" as const;
export type FrameworkRevisionContractVersions = {
  model: string;
  pipeline: typeof FRAMEWORK_REVISION_CONTRACT_VERSIONS.pipeline;
  prompt: typeof FRAMEWORK_REVISION_CONTRACT_VERSIONS.prompt;
  schema: typeof FRAMEWORK_REVISION_CONTRACT_VERSIONS.schema;
};

export const INTERVIEW_GUIDE_CONTRACT_VERSIONS = {
  pipeline: "interview-guide-pipeline-v1",
  prompt: "interview-guide-prompt-v1",
  schema: "interview-guide-schema-v1",
} as const;
export const INTERVIEW_GUIDE_SCHEMA_NAME = "hirelens_interview_guide_v1" as const;
export type InterviewGuideContractVersions = {
  model: string;
  pipeline: typeof INTERVIEW_GUIDE_CONTRACT_VERSIONS.pipeline;
  prompt: typeof INTERVIEW_GUIDE_CONTRACT_VERSIONS.prompt;
  schema: typeof INTERVIEW_GUIDE_CONTRACT_VERSIONS.schema;
};

export const INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS = {
  pipeline: "interview-assessment-pipeline-v1",
  prompt: "interview-assessment-prompt-v1",
  schema: "interview-assessment-schema-v1",
} as const;
export const INTERVIEW_ASSESSMENT_SCHEMA_NAME = "hirelens_interview_assessment_v1" as const;
export type InterviewAssessmentContractVersions = {
  model: string;
  pipeline: typeof INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS.pipeline;
  prompt: typeof INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS.prompt;
  schema: typeof INTERVIEW_ASSESSMENT_CONTRACT_VERSIONS.schema;
};

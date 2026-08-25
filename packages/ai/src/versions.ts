export const SCORECARD_DRAFT_CONTRACT_VERSIONS = {
  pipeline: "ai-pipeline-v2",
  prompt: "scorecard-draft-prompt-v3",
  schema: "scorecard-draft-schema-v2",
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
  prompt: "job-requisition-draft-prompt-v3",
  schema: "job-requisition-draft-schema-v1",
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
  prompt: "evidence-extraction-prompt-v2",
  schema: "evidence-extraction-schema-v2",
} as const;
export const EVIDENCE_SCHEMA_NAME = "hirelens_evidence_extraction_v2" as const;
export type EvidenceContractVersions = {
  model: string;
  pipeline: typeof EVIDENCE_CONTRACT_VERSIONS.pipeline;
  prompt: typeof EVIDENCE_CONTRACT_VERSIONS.prompt;
  schema: typeof EVIDENCE_CONTRACT_VERSIONS.schema;
};

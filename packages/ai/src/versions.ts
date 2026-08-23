export const SCORECARD_DRAFT_CONTRACT_VERSIONS = {
  pipeline: "ai-pipeline-v1",
  prompt: "scorecard-draft-prompt-v1",
  schema: "scorecard-draft-schema-v1",
} as const;

export type ScorecardDraftContractVersions = {
  model: string;
  pipeline: typeof SCORECARD_DRAFT_CONTRACT_VERSIONS.pipeline;
  prompt: typeof SCORECARD_DRAFT_CONTRACT_VERSIONS.prompt;
  schema: typeof SCORECARD_DRAFT_CONTRACT_VERSIONS.schema;
};

export const SCORECARD_DRAFT_SCHEMA_NAME = "hirelens_scorecard_draft" as const;

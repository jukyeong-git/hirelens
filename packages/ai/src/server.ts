/** Server-only entry point. Do not import this module from browser code. */
export { createScorecardDraftAdapter, ScorecardDraftAdapterError } from "./adapter";
export type {
  ScorecardDraftAdapter,
  ScorecardDraftAdapterErrorCode,
  ScorecardDraftAdapterOptions,
  ScorecardDraftAdapterResult,
} from "./adapter";

export {
  createJobRequisitionDraftAdapter,
  JobRequisitionDraftAdapterError,
} from "./job-requisition-adapter";

export { createEvidenceAdapter, EvidenceAdapterError } from "./evidence-adapter";
export type {
  EvidenceAdapter,
  EvidenceAdapterErrorCode,
  EvidenceAdapterOptions,
  EvidenceAdapterResult,
  EvidenceAdapterUsage,
} from "./evidence-adapter";
export type {
  JobRequisitionDraftAdapter,
  JobRequisitionDraftAdapterErrorCode,
  JobRequisitionDraftAdapterOptions,
  JobRequisitionDraftAdapterResult,
} from "./job-requisition-adapter";

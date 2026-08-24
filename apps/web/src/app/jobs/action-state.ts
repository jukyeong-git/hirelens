import type { ScorecardDraft } from "@hirelens/domain";

export interface AuthActionState {
  status: "idle" | "error";
  message?: string;
}

export interface JobActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface JobRequisitionDraftActionState {
  status: "idle" | "success" | "error";
  message?: string;
  rawJobDescription?: string;
  promptVersion?: string;
}

export interface ScorecardActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

/**
 * AI generation is deliberately separate from persistence. The returned draft
 * is used only to fill the human-editable form in the browser.
 */
export interface ScorecardDraftGenerationActionState {
  status: "idle" | "success" | "error";
  message?: string;
  draft?: ScorecardDraft;
  aiDraftToken?: string;
}

export interface RequisitionActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface JobPostingActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface AmbiguityReviewActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface ReviewActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialAuthActionState: AuthActionState = { status: "idle" };
export const initialJobActionState: JobActionState = { status: "idle" };
export const initialJobRequisitionDraftActionState: JobRequisitionDraftActionState = {
  status: "idle",
};
export const initialScorecardActionState: ScorecardActionState = { status: "idle" };
export const initialScorecardDraftGenerationActionState: ScorecardDraftGenerationActionState = {
  status: "idle",
};
export const initialRequisitionActionState: RequisitionActionState = { status: "idle" };
export const initialJobPostingActionState: JobPostingActionState = { status: "idle" };
export const initialAmbiguityReviewActionState: AmbiguityReviewActionState = { status: "idle" };
export const initialReviewActionState: ReviewActionState = { status: "idle" };

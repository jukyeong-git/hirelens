export interface AuthActionState {
  status: "idle" | "error";
  message?: string;
}

export interface JobActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface ScorecardActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export interface AmbiguityReviewActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const initialAuthActionState: AuthActionState = { status: "idle" };
export const initialJobActionState: JobActionState = { status: "idle" };
export const initialScorecardActionState: ScorecardActionState = { status: "idle" };
export const initialAmbiguityReviewActionState: AmbiguityReviewActionState = { status: "idle" };

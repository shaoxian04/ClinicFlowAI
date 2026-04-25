// frontend/lib/reviewReducer.ts
// Pure state reducer for the post-visit SOAP review flow.
// All transitions produce a new state object — no mutations.
import type { MedicalReport, ChatTurn, Clarification } from "./types/report";

export interface ReviewState {
  report: MedicalReport | null;
  chat: ChatTurn[];
  approved: boolean;
  generating: boolean;
  editing: boolean;
  patching: Set<string>;
  clarification: Clarification | null;
  error: string | null;
  // Monotonic counter bumped whenever the canonical report is replaced
  // by the agent (generate/edit). Used as a React key on the form
  // fieldset so uncontrolled inputs re-mount and their defaultValues
  // reflect the newly-returned report.
  reportVersion: number;
}

export const initialReviewState: ReviewState = {
  report: null,
  chat: [],
  approved: false,
  generating: false,
  editing: false,
  patching: new Set(),
  clarification: null,
  error: null,
  reportVersion: 0,
};

export type ReviewAction =
  | { type: "GENERATE_START" }
  | { type: "GENERATE_DONE"; report: MedicalReport | null; clarification: Clarification | null; status: string }
  | { type: "EDIT_START" }
  | { type: "EDIT_DONE"; report: MedicalReport | null; clarification: Clarification | null; status: string }
  | { type: "PATCH_START"; path: string }
  | { type: "PATCH_DONE"; path: string; report: MedicalReport }
  | { type: "PATCH_FAIL"; path: string; message: string }
  | { type: "CHAT_SET"; turns: ChatTurn[] }
  | { type: "CHAT_APPEND"; turn: ChatTurn }
  | { type: "APPROVE" }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_ERROR" };

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "GENERATE_START":
      return { ...state, generating: true, error: null };
    case "GENERATE_DONE":
      return {
        ...state,
        generating: false,
        report: action.report ?? state.report,
        clarification: action.clarification,
        reportVersion: action.report ? state.reportVersion + 1 : state.reportVersion,
      };
    case "EDIT_START":
      return { ...state, editing: true, error: null };
    case "EDIT_DONE":
      return {
        ...state,
        editing: false,
        report: action.report ?? state.report,
        clarification: action.clarification,
        reportVersion: action.report ? state.reportVersion + 1 : state.reportVersion,
      };
    case "PATCH_START": {
      const next = new Set(state.patching);
      next.add(action.path);
      return { ...state, patching: next };
    }
    case "PATCH_DONE": {
      const next = new Set(state.patching);
      next.delete(action.path);
      return { ...state, patching: next, report: action.report };
    }
    case "PATCH_FAIL": {
      const next = new Set(state.patching);
      next.delete(action.path);
      return { ...state, patching: next, error: action.message };
    }
    case "CHAT_SET":
      return { ...state, chat: action.turns };
    case "CHAT_APPEND":
      return { ...state, chat: [...state.chat, action.turn] };
    case "APPROVE":
      return { ...state, approved: true };
    case "ERROR":
      return { ...state, error: action.message, generating: false, editing: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

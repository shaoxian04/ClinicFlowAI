// frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx
"use client";
import { useEffect, useReducer, useCallback } from "react";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { initialReviewState, reviewReducer } from "@/lib/reviewReducer";
import type { ChatTurn, ReportReviewResult, MedicalReport } from "@/lib/types/report";
import { GenerateBar } from "./GenerateBar";
import { ReportPanel } from "./ReportPanel";
import { ReportChatPanel } from "./ReportChatPanel";
import "./review.css";

export interface SplitReviewProps {
  visitId: string;
  initialReport: MedicalReport | null;
  initialApproved: boolean;
  locked: boolean;
  onNavigateToPreview: () => void;
}

export function SplitReview({ visitId, initialReport, initialApproved, locked, onNavigateToPreview }: SplitReviewProps) {
  const [state, dispatch] = useReducer(reviewReducer, {
    ...initialReviewState,
    report: initialReport,
    approved: initialApproved,
  });

  const refreshChat = useCallback(async () => {
    try {
      const data = await apiGet<{ turns: ChatTurn[] }>(`/visits/${visitId}/report/chat`);
      dispatch({ type: "CHAT_SET", turns: data.turns });
    } catch (e) {
      console.warn("[REVIEW] chat refresh failed", e);
    }
  }, [visitId]);

  useEffect(() => { refreshChat(); }, [refreshChat]);

  async function handleGenerate(transcript: string) {
    dispatch({ type: "GENERATE_START" });
    try {
      const resp = await apiPost<ReportReviewResult>(
        `/visits/${visitId}/report/generate-sync`,
        { transcript, specialty: null },
      );
      dispatch({ type: "GENERATE_DONE", report: resp.report, clarification: resp.clarification, status: resp.status });
      await refreshChat();
    } catch (e) {
      dispatch({ type: "ERROR", message: (e as Error).message });
    }
  }

  async function handleChatSubmit(text: string) {
    dispatch({ type: "EDIT_START" });
    try {
      const path = state.clarification ? "clarify-sync" : "edit-sync";
      const body = state.clarification ? { answer: text } : { instruction: text };
      const resp = await apiPost<ReportReviewResult>(`/visits/${visitId}/report/${path}`, body);
      dispatch({ type: "EDIT_DONE", report: resp.report, clarification: resp.clarification, status: resp.status });
      await refreshChat();
    } catch (e) {
      dispatch({ type: "ERROR", message: (e as Error).message });
    }
  }

  async function handlePatch(path: string, value: unknown) {
    dispatch({ type: "PATCH_START", path });
    try {
      const resp = await apiPatch<{ report: MedicalReport }>(
        `/visits/${visitId}/report/draft`,
        { path, value },
      );
      dispatch({ type: "PATCH_DONE", path, report: resp.report });
    } catch (e) {
      dispatch({ type: "PATCH_FAIL", path, message: (e as Error).message });
    }
  }

  async function handleApprove() {
    try {
      await apiPost(`/visits/${visitId}/report/approve`, {});
      dispatch({ type: "APPROVE" });
      onNavigateToPreview();
    } catch (e) {
      dispatch({ type: "ERROR", message: (e as Error).message });
    }
  }

  return (
    <div className="split-review">
      {state.error && (
        <div className="banner error" role="alert">
          {state.error} <button onClick={() => dispatch({ type: "CLEAR_ERROR" })}>Dismiss</button>
        </div>
      )}
      <GenerateBar
        visitId={visitId}
        onGenerate={handleGenerate}
        generating={state.generating}
        hasReport={state.report != null}
      />
      <div className="split-review-panes">
        <ReportPanel
          report={state.report}
          approved={state.approved}
          onApprove={handleApprove}
          onPatch={handlePatch}
          patching={state.patching}
          locked={locked}
        />
        <ReportChatPanel
          turns={state.chat}
          clarification={state.clarification}
          editing={state.editing}
          onSubmit={handleChatSubmit}
          locked={locked}
        />
      </div>
    </div>
  );
}

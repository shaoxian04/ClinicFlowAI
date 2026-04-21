"use client";

import { DoctorsSeal } from "@/app/components/DoctorsSeal";

export type FinalizeBarState =
  | "no-transcript"
  | "transcript-ready"
  | "draft-ready"
  | "preview-approved"
  | "ready"
  | "locked";

type FinalizeBarProps = {
  state: FinalizeBarState;
  canFinalize: boolean;
  locked: boolean;
  busy?: boolean;
  /** Reason the button is disabled, shown as a subtle caption. */
  disabledHint?: string;
  /** e.g. "14:32" — shown in the "Published to patient at …" caption when locked. */
  publishedAtLabel?: string;
  onFinalize: () => void;
};

const STATE_LABEL: Record<Exclude<FinalizeBarState, "locked">, string> = {
  "no-transcript": "Transcript pending",
  "transcript-ready": "Transcript ready",
  "draft-ready": "SOAP draft pending",
  "preview-approved": "Preview approved",
  ready: "Ready to publish",
};

/**
 * Task 6.6 — sticky bottom action bar for the visit workspace.
 *
 * Surfaces the current pre-publish state and the single "Ready to publish →"
 * CTA. The button is disabled until every gate passes (AI draft present,
 * no unacknowledged critical interactions, patient preview acknowledged,
 * visit not already locked). When the visit IS locked, the bar pivots to a
 * commemorative seal + publish-time caption — the visual signal that the
 * doctor-in-the-loop handoff is complete.
 */
export function FinalizeBar({
  state,
  canFinalize,
  locked,
  busy = false,
  disabledHint,
  publishedAtLabel,
  onFinalize,
}: FinalizeBarProps) {
  if (locked || state === "locked") {
    return (
      <div className="finalize-bar finalize-bar-locked" role="status">
        <div className="finalize-bar-seal-wrap">
          <DoctorsSeal size={96} animate />
          <p className="finalize-bar-seal-caption">
            {publishedAtLabel
              ? `Published to patient at ${publishedAtLabel}`
              : "Published to patient"}
          </p>
        </div>
      </div>
    );
  }

  const label = STATE_LABEL[state];
  const disabled = !canFinalize || busy;
  const buttonLabel = busy ? "Publishing…" : "Ready to publish →";

  return (
    <div className="finalize-bar" role="region" aria-label="Finalize visit">
      <div className="finalize-bar-inner">
        <div className="finalize-bar-state">
          <span className="finalize-bar-state-dot" aria-hidden="true" />
          <span className="finalize-bar-state-label">{label}</span>
        </div>
        <div className="finalize-bar-action">
          {disabled && disabledHint && (
            <span className="finalize-bar-hint">{disabledHint}</span>
          )}
          <button
            type="button"
            className="btn btn-accent finalize-bar-btn"
            onClick={onFinalize}
            disabled={disabled}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

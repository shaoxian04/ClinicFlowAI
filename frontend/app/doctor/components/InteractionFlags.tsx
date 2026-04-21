"use client";

import { useState } from "react";

export type InteractionFlagSeverity = "critical" | "warn" | "info";

export type InteractionFlag = {
  medication: string;
  conflictsWith: string;
  severity: InteractionFlagSeverity;
  reason: string;
};

export type InteractionFlagsProps = {
  /** Flags returned by POST /api/visits/:id/interactions. */
  flags: InteractionFlag[];
  /**
   * Set of acknowledged flag keys — key format is `${medication}::${conflictsWith}`.
   * Callers may pass a Set (preferred) or a plain string[] for convenience.
   */
  acknowledged: Set<string> | string[];
  /**
   * Invoked when the doctor confirms an override for a critical flag. Receives
   * the original flag and the typed reason (>= 8 chars, already validated
   * inside this component). Returned Promise controls the button's busy state.
   */
  onAcknowledge: (flag: InteractionFlag, reason: string) => Promise<void>;
  /** SOAP is finalized — no acknowledgement UI should appear. */
  locked: boolean;
};

/** Stable key for a flag: medication + the thing it conflicts with. */
export function keyForFlag(flag: Pick<InteractionFlag, "medication" | "conflictsWith">): string {
  return `${flag.medication}::${flag.conflictsWith}`;
}

const SEVERITY_LABEL: Record<InteractionFlagSeverity, string> = {
  critical: "Critical",
  warn: "Warning",
  info: "Info",
};

/**
 * Drug-interaction + contraindication banner list. Renders at the top of the
 * Consultation tab so doctors see conflicts before finalizing (SAD §2.4.2).
 *
 * Critical flags require an "Acknowledge & override" action with a typed
 * reason (>= 8 chars). The parent posts that reason to /api/visits/:id/overrides
 * for PDPA audit. Warn / info banners are informational only.
 */
export function InteractionFlags({
  flags,
  acknowledged,
  onAcknowledge,
  locked,
}: InteractionFlagsProps) {
  const ackSet =
    acknowledged instanceof Set ? acknowledged : new Set<string>(acknowledged);

  if (flags.length === 0) return null;

  return (
    <div className="interaction-flags" aria-label="Drug-interaction flags">
      {flags.map((flag) => (
        <FlagBanner
          key={keyForFlag(flag)}
          flag={flag}
          acknowledged={ackSet.has(keyForFlag(flag))}
          onAcknowledge={onAcknowledge}
          locked={locked}
        />
      ))}
    </div>
  );
}

type FlagBannerProps = {
  flag: InteractionFlag;
  acknowledged: boolean;
  onAcknowledge: InteractionFlagsProps["onAcknowledge"];
  locked: boolean;
};

function FlagBanner({ flag, acknowledged, onAcknowledge, locked }: FlagBannerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= 8;

  async function onConfirm() {
    if (!reasonValid) {
      setError("Please provide at least 8 characters of clinical justification.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAcknowledge(flag, trimmed);
      setFormOpen(false);
      setReason("");
    } catch (e) {
      setError((e as Error).message || "Failed to record override");
    } finally {
      setBusy(false);
    }
  }

  function onCancel() {
    if (busy) return;
    setFormOpen(false);
    setReason("");
    setError(null);
  }

  const showOverrideAction =
    flag.severity === "critical" && !acknowledged && !locked;

  return (
    <div
      className={`iflag iflag-${flag.severity}${acknowledged ? " iflag-ack" : ""}`}
      role={flag.severity === "critical" && !acknowledged ? "alert" : "status"}
    >
      <div>
        <strong>{flag.medication}</strong>
        {" · "}
        <span>{SEVERITY_LABEL[flag.severity]}</span>
        {" · conflicts with "}
        <strong>{flag.conflictsWith}</strong>
        {" — "}
        <span>{flag.reason}</span>
      </div>

      {acknowledged && (
        <div className="iflag-actions">
          <em>Override recorded</em>
        </div>
      )}

      {showOverrideAction && !formOpen && (
        <div className="iflag-actions">
          <button
            type="button"
            className="btn"
            onClick={() => setFormOpen(true)}
          >
            Acknowledge &amp; override
          </button>
        </div>
      )}

      {showOverrideAction && formOpen && (
        <div className="iflag-actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">
              Clinical justification (required, ≥ 8 characters)
            </span>
            <textarea
              className="iflag-reason"
              required
              minLength={8}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Patient tolerated this combination previously with monitoring; benefit outweighs risk."
              disabled={busy}
            />
          </label>
          {error && <span className="finalize-gate-note">{error}</span>}
          <div className="iflag-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onConfirm}
              disabled={busy || !reasonValid}
            >
              {busy ? "Recording…" : "Confirm override"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

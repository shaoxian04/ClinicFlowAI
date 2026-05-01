"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { Finding } from "./types";

const MAX_REASON = 500;

const CATEGORY_LABEL: Record<string, string> = {
  DRUG_ALLERGY: "Allergy",
  DDI: "Drug interaction",
  PREGNANCY: "Pregnancy",
  DOSE: "Dose",
  HALLUCINATION: "Hallucination",
  COMPLETENESS: "Completeness",
};

export function ApproveOverrideDialog({
  open,
  onOpenChange,
  unackedCritical,
  onAcknowledge,
  onProceed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unackedCritical: Finding[];
  onAcknowledge: (id: string, reason?: string) => Promise<void>;
  onProceed: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const overLimit = reason.length > MAX_REASON;
  const canSubmit = trimmed.length >= 10 && !overLimit && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // Acknowledge every unacked critical finding with the same override
      // reason — a per-finding audit row is the contract evaluator agent
      // expects, so the approve gate sees zero unacked criticals.
      for (const f of unackedCritical) {
        await onAcknowledge(f.id, trimmed);
      }
      await onProceed();
      setReason("");
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message ?? "Failed to override.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Approve with override</DialogTitle>
        <DialogDescription>
          {unackedCritical.length === 1
            ? "1 critical safety finding has not been acknowledged."
            : `${unackedCritical.length} critical safety findings have not been acknowledged.`}
          {" "}Approving now will record an override reason against each finding in the audit log.
        </DialogDescription>

        <div className="mt-4 space-y-2 max-h-48 overflow-y-auto rounded-xs border border-crimson/30 bg-crimson/5 p-3">
          {unackedCritical.map((f) => (
            <div key={f.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden className="font-mono text-crimson mt-0.5">●</span>
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-widest text-crimson/80">
                  {CATEGORY_LABEL[f.category] ?? f.category}
                </div>
                <div className="text-fog leading-snug">{f.message}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-xs text-fog-dim font-mono uppercase tracking-widest">
            Override reason <span className="text-crimson">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Patient counselled on bleeding signs; INR will be re-checked at 1-week follow-up; benefit of NSAID outweighs risk for this short course."
            rows={4}
            aria-invalid={overLimit || (trimmed.length > 0 && trimmed.length < 10)}
          />
          <div className="flex items-center justify-between text-xs">
            <span className={trimmed.length > 0 && trimmed.length < 10 ? "text-amber" : "text-fog-dim"}>
              Minimum 10 characters
            </span>
            <span className={overLimit ? "text-crimson" : "text-fog-dim"}>
              {reason.length}/{MAX_REASON}
            </span>
          </div>
        </div>

        {error && (
          <div
            className="mt-3 px-3 py-2 bg-crimson/10 border border-crimson/30 rounded-xs text-xs text-crimson"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={!canSubmit} variant="primary">
            {busy ? "Approving…" : "Approve with override"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

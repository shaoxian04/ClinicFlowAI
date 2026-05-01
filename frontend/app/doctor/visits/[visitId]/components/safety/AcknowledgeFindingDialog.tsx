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

const MAX_REASON = 255;

export function AcknowledgeFindingDialog({
  open,
  onOpenChange,
  finding,
  onAcknowledge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding: Finding;
  onAcknowledge: (id: string, reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const overLimit = reason.length > MAX_REASON;

  async function submit() {
    if (overLimit) return;
    setBusy(true);
    try {
      await onAcknowledge(finding.id, reason.trim() || undefined);
      setReason("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Acknowledge safety finding</DialogTitle>
        <DialogDescription>
          {finding.severity} · {finding.category} — {finding.message}
        </DialogDescription>
        <div className="mt-4 space-y-2">
          <label className="text-xs text-fog-dim">Reason (optional)</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this safe to proceed despite the finding?"
            rows={3}
            aria-invalid={overLimit}
          />
          <div className={overLimit ? "text-xs text-crimson" : "text-xs text-fog-dim"}>
            {reason.length}/{MAX_REASON}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={submit} disabled={busy || overLimit}>
            {busy ? "Saving…" : "Acknowledge"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

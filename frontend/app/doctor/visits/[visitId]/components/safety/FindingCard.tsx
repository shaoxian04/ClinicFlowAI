"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AcknowledgeFindingDialog } from "./AcknowledgeFindingDialog";
import type { Finding, Severity } from "./types";

const SEV_LABEL: Record<Severity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

function variantFor(sev: Severity) {
  if (sev === "CRITICAL") return "danger" as const;
  if (sev === "HIGH") return "warn" as const;
  if (sev === "MEDIUM") return "primary" as const;
  return "neutral" as const;
}

export function FindingCard({
  finding,
  onAcknowledge,
}: {
  finding: Finding;
  onAcknowledge: (id: string, reason?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const acked = !!finding.acknowledgedAt;

  return (
    <div className="bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass rounded-sm p-3 flex items-start gap-3">
      <Badge variant={variantFor(finding.severity)}>{SEV_LABEL[finding.severity]}</Badge>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-fog-dim">{finding.message}</div>
        {finding.fieldPath && (
          <div className="text-xs text-fog-dim mt-0.5 font-mono">{finding.fieldPath}</div>
        )}
        {acked && finding.acknowledgementReason && (
          <div className="text-xs text-lime mt-1">
            Acknowledged · {finding.acknowledgementReason}
          </div>
        )}
        {acked && !finding.acknowledgementReason && (
          <div className="text-xs text-lime mt-1">Acknowledged</div>
        )}
      </div>
      {!acked && (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Acknowledge
        </Button>
      )}
      <AcknowledgeFindingDialog
        open={open}
        onOpenChange={setOpen}
        finding={finding}
        onAcknowledge={onAcknowledge}
      />
    </div>
  );
}

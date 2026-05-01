"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FindingCard } from "./FindingCard";
import { SafetyStatusRow } from "./SafetyStatusRow";
import { SafetyUnavailableBanner } from "./SafetyUnavailableBanner";
import { EvaluatorProgressBar } from "./EvaluatorProgressBar";
import type { Availability, Category, Finding } from "./types";

const ALL_CATEGORIES: Category[] = [
  "DRUG_ALLERGY",
  "DDI",
  "PREGNANCY",
  "DOSE",
  "HALLUCINATION",
  "COMPLETENESS",
];

export function AISafetyReviewPanel({
  findings,
  availability,
  loading,
  error,
  onAcknowledge,
  onReEvaluate,
}: {
  findings: Finding[];
  availability: Availability;
  loading: boolean;
  error?: string;
  onAcknowledge: (id: string, reason?: string) => Promise<void>;
  onReEvaluate: () => Promise<Finding[] | null> | Promise<void>;
}) {
  const unackedCriticalCount = useMemo(
    () => findings.filter((f) => f.severity === "CRITICAL" && !f.acknowledgedAt).length,
    [findings],
  );
  const hasFindings = findings.length > 0;
  const [expanded, setExpanded] = useState(hasFindings || unackedCriticalCount > 0);

  if (availability !== "AVAILABLE") {
    return (
      <section
        className="bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass rounded-sm p-4 space-y-3"
        aria-label="AI safety review"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-fog-dim">AI Safety Review</h3>
          <Button variant="ghost" size="sm" onClick={onReEvaluate} disabled={loading}>
            {loading ? "Re-running…" : "Re-run safety checks"}
          </Button>
        </div>
        <SafetyUnavailableBanner reason={error} />
      </section>
    );
  }

  return (
    <section
      className="bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass rounded-sm p-4 space-y-3"
      aria-label="AI safety review"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-fog-dim">AI Safety Review</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onReEvaluate} disabled={loading}>
            {loading ? "Re-running…" : "Re-run safety checks"}
          </Button>
        </div>
      </div>
      <EvaluatorProgressBar active={loading} />
      <SafetyStatusRow findings={findings} validatorsRun={ALL_CATEGORIES} />
      {expanded && hasFindings && (
        <div className="space-y-2">
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} onAcknowledge={onAcknowledge} />
          ))}
        </div>
      )}
      {expanded && !hasFindings && (
        <div className="text-xs text-fog-dim">No findings. All safety checks passed.</div>
      )}
    </section>
  );
}

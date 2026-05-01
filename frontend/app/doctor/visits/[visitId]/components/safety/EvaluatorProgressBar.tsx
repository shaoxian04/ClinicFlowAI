"use client";

import { useEffect, useState } from "react";

const PHASES = [
  "Loading draft & patient context",
  "Allergy validator",
  "Drug-drug interaction validator",
  "Pregnancy contraindication validator",
  "Dose-range validator",
  "Hallucination validator",
  "Completeness validator",
  "Aggregating findings",
] as const;

const PHASE_INTERVAL_MS = 700;

export function EvaluatorProgressBar({ active }: { active: boolean }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhaseIndex(0);
      return;
    }
    const id = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % PHASES.length);
      setTick((t) => t + 1);
    }, PHASE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  // Indeterminate fill — visual proxy that loops while the agent runs.
  // Width animates 8% → 92% on each tick so the bar feels alive without
  // pretending to know real progress (we don't get per-validator events
  // from the agent today).
  const fillPct = 8 + ((tick % 12) / 12) * 84;

  return (
    <div
      className="space-y-2 px-3 py-2.5 bg-cyan/5 border border-cyan/30 rounded-xs"
      role="status"
      aria-live="polite"
      aria-label="Evaluator agent in progress"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="font-mono text-xs text-cyan animate-pulse flex-shrink-0">●</span>
          <span className="font-mono text-[11px] text-cyan uppercase tracking-widest flex-shrink-0">
            Evaluator
          </span>
          <span className="font-sans text-xs text-fog/80 truncate">
            {PHASES[phaseIndex]}…
          </span>
        </div>
        <span className="font-mono text-[10px] text-fog-dim/60 tabular-nums flex-shrink-0">
          {phaseIndex + 1}/{PHASES.length}
        </span>
      </div>
      <div className="h-1 w-full bg-ink-rim rounded-xs overflow-hidden" aria-hidden>
        <div
          className="h-full bg-gradient-to-r from-cyan/40 via-cyan to-cyan/40 transition-all duration-700 ease-out"
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}

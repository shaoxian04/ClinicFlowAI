// frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx
"use client";
import { useEffect, useState } from "react";

/**
 * Timer-driven phased progress text. Shown during the 15-30s wait on
 * /report/generate-sync so the doctor has signal without exposing raw SSE.
 * Pure presentation — no server coupling.
 */
const PHASES = [
  { at: 0, label: "Reading transcript" },
  { at: 4000, label: "Drafting report" },
  { at: 10000, label: "Checking interactions" },
  { at: 18000, label: "Almost there" },
];

export function PhasedSpinner() {
  const [phase, setPhase] = useState(PHASES[0].label);
  useEffect(() => {
    const timers = PHASES.map((p) => setTimeout(() => setPhase(p.label), p.at));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div role="status" aria-live="polite" className="phased-spinner">
      <span className="spinner-dot" aria-hidden /> {phase}…
    </div>
  );
}

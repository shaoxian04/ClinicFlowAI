// frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx
"use client";
import { useEffect, useState } from "react";

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
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2"
    >
      <svg
        className="animate-spin h-3.5 w-3.5 text-oxblood flex-shrink-0"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="font-mono text-xs text-ink-soft">{phase}…</span>
    </div>
  );
}

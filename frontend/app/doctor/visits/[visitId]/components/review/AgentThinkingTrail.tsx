// Scripted fallback: the sync-generate endpoint does not expose an SSE stream.
// When a streaming endpoint is available, replace the timer-based steps with real agentSse events.
// See `lib/agentSse.ts` for the existing helper used by the reasoning panel.
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/design/cn";
import { fadeUp } from "@/design/motion";

const STEPS = [
  { label: "get_patient_context", delayMs: 800 },
  { label: "clinical_dictionary_extract", delayMs: 1200 },
  { label: "drafting_soap_note", delayMs: 2000 },
  { label: "drug_interaction_check", delayMs: 1000 },
  { label: "finalizing", delayMs: 600 },
] as const;

export interface AgentThinkingTrailProps {
  active: boolean;
  onComplete?: () => void;
}

export function AgentThinkingTrail({ active, onComplete }: AgentThinkingTrailProps) {
  const [currentStep, setCurrentStep] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    if (!active) {
      clearTimer();
      setCurrentStep(-1);
      return;
    }

    setCurrentStep(0);

    let step = 0;
    function advance() {
      step += 1;
      if (step < STEPS.length) {
        setCurrentStep(step);
        timerRef.current = setTimeout(advance, STEPS[step].delayMs);
      } else {
        onComplete?.();
      }
    }

    timerRef.current = setTimeout(advance, STEPS[0].delayMs);

    return () => clearTimer();
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="thinking-trail"
          variants={fadeUp}
          initial="initial"
          animate="animate"
          exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
          className="flex gap-2 overflow-x-auto py-2 px-1"
          aria-label="Agent thinking steps"
          aria-live="polite"
        >
          {STEPS.map((step, i) => {
            const isPast = currentStep > i;
            const isCurrent = currentStep === i;
            const isFuture = currentStep < i;

            return (
              <div
                key={step.label}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest whitespace-nowrap transition-all duration-300",
                  isCurrent && "border-cyan/60 text-cyan shimmer-pill shadow-[0_0_8px_rgba(34,225,215,0.2)]",
                  isPast && "border-ink-rim text-fog-dim/60",
                  isFuture && "border-ink-rim text-fog-dim/30 opacity-40"
                )}
              >
                {isCurrent && (
                  <span
                    className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-coral"
                    style={{
                      animation: "pulse 1.4s ease-in-out infinite",
                    }}
                    aria-hidden="true"
                  />
                )}
                {step.label}
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

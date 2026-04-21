"use client";

import { useCallback, useEffect, useState } from "react";

export type ProgressStep = {
  id: string;
  label: string;
  targetId: string;
};

type ProgressRailProps = {
  steps: ProgressStep[];
  /**
   * Optional controlled-active override. When set, the rail shows this step as
   * active regardless of scroll position. Useful for tab-driven pages where
   * the natural "top visible section" heuristic doesn't apply.
   */
  activeId?: string;
  /**
   * Opaque "which container is currently mounted" token. When this value
   * changes, the rail rebuilds its IntersectionObserver so it re-observes
   * whatever sections just came into the DOM (e.g. after a tab switch that
   * unmounts/mounts tab-scoped content). ProgressRail doesn't need to know
   * what the token means — only that a change implies "DOM may have
   * swapped, re-observe now".
   */
  scopeKey?: string;
  /**
   * Optional click handler. When provided, the rail calls this INSTEAD of
   * performing its own `scrollIntoView` — useful when the target section
   * lives inside a tab that may be unmounted, so the parent can switch
   * tabs first and then handle scrolling itself.
   */
  onStepClick?: (step: ProgressStep) => void;
};

/**
 * Task 6.6 — sticky left navigation rail for the doctor visit workspace.
 *
 * Four anchored steps (Intake · Capture · Draft · Publish). The active step
 * is the section most in view, tracked via IntersectionObserver. Clicking a
 * step scrolls the target into view. Browsers without IO fall back to the
 * first step being active and pure anchor-jump behaviour (still keyboard
 * accessible).
 */
export function ProgressRail({ steps, activeId, scopeKey, onStepClick }: ProgressRailProps) {
  const [internalActive, setInternalActive] = useState<string>(steps[0]?.id ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) {
      // Fallback: keep the first step active. Clicks still anchor-scroll below.
      setInternalActive(steps[0]?.id ?? "");
      return;
    }

    // Rebuild on next frame so we observe sections that React just mounted
    // (e.g. after a tab switch). Without this, a synchronous re-run during
    // the same commit would see stale DOM from the previous tab.
    let io: IntersectionObserver | null = null;
    const raf = requestAnimationFrame(() => {
      // Map target element id -> step id so the observer callback can translate.
      const targetToStep = new Map<string, string>();
      const observedEls: Element[] = [];
      for (const step of steps) {
        const el = document.getElementById(step.targetId);
        if (!el) continue;
        targetToStep.set(step.targetId, step.id);
        observedEls.push(el);
      }
      if (observedEls.length === 0) return;

      // Track the most-visible intersecting section. If none intersect, keep
      // the last-known active step so the rail never flickers blank on fast
      // scrolls.
      const visibility = new Map<string, number>();

      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            visibility.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
          }
          let bestId: string | null = null;
          let bestRatio = 0;
          for (const [elId, ratio] of visibility.entries()) {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestId = elId;
            }
          }
          if (bestId) {
            const stepId = targetToStep.get(bestId);
            if (stepId) setInternalActive(stepId);
          }
        },
        {
          // Bias toward sections centred in the viewport, not just poking in.
          rootMargin: "-30% 0px -50% 0px",
          threshold: [0, 0.25, 0.5, 0.75, 1],
        },
      );

      observedEls.forEach((el) => io!.observe(el));
    });

    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [steps, scopeKey]);

  const active = activeId ?? internalActive;

  const handleClick = useCallback(
    (step: ProgressStep) => {
      if (onStepClick) {
        onStepClick(step);
        return;
      }
      if (typeof window === "undefined") return;
      const el = document.getElementById(step.targetId);
      if (!el) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [onStepClick],
  );

  return (
    <nav className="progress-rail" aria-label="Visit progress">
      <ol className="progress-rail-list" role="list">
        {steps.map((step, idx) => {
          const isActive = step.id === active;
          return (
            <li key={step.id} className="progress-rail-item">
              <button
                type="button"
                className={`progress-rail-step${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "step" : undefined}
                onClick={() => handleClick(step)}
              >
                <span className="progress-rail-dot" aria-hidden="true">
                  <span className="progress-rail-dot-inner" />
                </span>
                <span className="progress-rail-label">
                  <span className="progress-rail-index">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="progress-rail-text">{step.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

"use client";

import { KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/design/cn";

export type PhaseKey = "pre" | "visit" | "preview";

type PhaseTabsProps = {
  children: { pre: ReactNode; visit: ReactNode; preview: ReactNode };
  consultationNeedsReview?: boolean;
  reportPreviewNeedsReview?: boolean;
  onActiveChange?: (key: PhaseKey) => void;
  panelFocusable?: { pre?: boolean; visit?: boolean; preview?: boolean };
};

type TabDef = {
  key: PhaseKey;
  label: string;
  hash: string;
};

const TABS: TabDef[] = [
  { key: "pre", label: "Pre-Visit Report", hash: "#pre" },
  { key: "visit", label: "Consultation", hash: "#visit" },
  { key: "preview", label: "Report Preview", hash: "#preview" },
];

const HASH_TO_KEY: Record<string, PhaseKey> = {
  "#pre": "pre",
  "#visit": "visit",
  "#preview": "preview",
};

function readHashKey(): PhaseKey {
  if (typeof window === "undefined") return "pre";
  const h = window.location.hash;
  return HASH_TO_KEY[h] ?? "pre";
}

export function PhaseTabs({
  children,
  consultationNeedsReview = false,
  reportPreviewNeedsReview = false,
  onActiveChange,
  panelFocusable,
}: PhaseTabsProps) {
  const [active, setActive] = useState<PhaseKey>("pre");
  const tabRefs = useRef<Record<PhaseKey, HTMLButtonElement | null>>({
    pre: null,
    visit: null,
    preview: null,
  });
  const onActiveChangeRef = useRef(onActiveChange);

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);

  useEffect(() => {
    const initial = readHashKey();
    setActive(initial);
    onActiveChangeRef.current?.(initial);

    const onHashChange = () => {
      const next = readHashKey();
      setActive(next);
      onActiveChangeRef.current?.(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const selectTab = useCallback(
    (key: PhaseKey, focus: boolean) => {
      setActive(key);
      onActiveChangeRef.current?.(key);
      const hash = TABS.find((t) => t.key === key)?.hash ?? "#pre";
      if (typeof window !== "undefined") {
        const url = `${window.location.pathname}${window.location.search}${hash}`;
        window.history.replaceState(null, "", url);
      }
      if (focus) {
        tabRefs.current[key]?.focus();
      }
    },
    [],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
      switch (e.key) {
        case "ArrowRight": {
          e.preventDefault();
          const next = TABS[(idx + 1) % TABS.length];
          selectTab(next.key, true);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const prev = TABS[(idx - 1 + TABS.length) % TABS.length];
          selectTab(prev.key, true);
          break;
        }
        case "Home": {
          e.preventDefault();
          selectTab(TABS[0].key, true);
          break;
        }
        case "End": {
          e.preventDefault();
          selectTab(TABS[TABS.length - 1].key, true);
          break;
        }
        default:
          break;
      }
    },
    [selectTab],
  );

  const needsDot: Record<PhaseKey, boolean> = {
    pre: false,
    visit: consultationNeedsReview,
    preview: reportPreviewNeedsReview,
  };

  return (
    <div>
      {/* Tab list */}
      <div
        role="tablist"
        aria-label="Visit phases"
        className="flex gap-0 border-b border-ink-rim"
      >
        {TABS.map((t, idx) => {
          const isActive = t.key === active;
          const panelId = `phase-panel-${t.key}`;
          const tabId = `phase-tab-${t.key}`;
          const showDot = needsDot[t.key];
          return (
            <button
              key={t.key}
              id={tabId}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                "px-4 py-2.5 text-sm font-sans transition-colors duration-150 border-b-2 -mb-px focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan/40 flex items-center gap-1.5",
                isActive
                  ? "text-cyan border-cyan"
                  : "text-fog-dim border-transparent hover:text-fog"
              )}
              onClick={() => selectTab(t.key, false)}
              onKeyDown={(e) => onKeyDown(e, idx)}
            >
              <span>{t.label}</span>
              {showDot ? (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-crimson flex-shrink-0"
                  aria-hidden="true"
                >
                  <span className="sr-only"> needs review</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {TABS.map((t) => {
        const isActive = t.key === active;
        const panelId = `phase-panel-${t.key}`;
        const tabId = `phase-tab-${t.key}`;
        const focusable = panelFocusable?.[t.key] ?? false;
        return (
          <div
            key={t.key}
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId}
            hidden={!isActive}
            className="pt-4"
            {...(focusable ? { tabIndex: 0 } : {})}
          >
            {isActive ? children[t.key] : null}
          </div>
        );
      })}
    </div>
  );
}

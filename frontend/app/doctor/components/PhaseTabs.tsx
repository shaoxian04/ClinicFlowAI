"use client";

import { KeyboardEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";

export type PhaseKey = "pre" | "visit" | "preview";

type PhaseTabsProps = {
  children: { pre: ReactNode; visit: ReactNode; preview: ReactNode };
  /** Show a red "needs your review" dot on the consultation tab. */
  consultationNeedsReview?: boolean;
  /** Show a red "needs your review" dot on the report preview tab. */
  reportPreviewNeedsReview?: boolean;
  /** Called after the active tab changes (user click, hash change, or initial hash read). */
  onActiveChange?: (key: PhaseKey) => void;
  /**
   * Per-panel opt-in for `tabIndex={0}` on the tabpanel wrapper.
   *
   * WAI-ARIA says a tabpanel should only be in the tab order when it has NO
   * focusable descendants (so keyboard users can still reach its content).
   * Defaults to `false` for every panel — opt in only for panels whose
   * contents are purely static (plain text, no inputs/buttons/links).
   */
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

/**
 * 3-phase tab UI for the doctor visit detail page.
 *
 * Pre-Visit Report / Consultation / Post-Visit Preview.
 *
 * - Active tab is persisted to the URL hash (#pre / #visit / #post) via
 *   history.replaceState so reload restores position without polluting
 *   the back/forward stack.
 * - Listens to the `hashchange` event so browser navigation updates the
 *   active tab.
 * - Keyboard: ArrowLeft/ArrowRight move focus between tabs and activate
 *   them. Home/End jump to first/last. Space/Enter also activate.
 * - Red dots (role="status", aria-labeled) indicate tabs that need
 *   clinician attention.
 */
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

  // Initial read + hashchange listener.
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
    <div className="phase-tabs">
      <div role="tablist" aria-label="Visit phases" className="phase-tablist">
        {TABS.map((t, idx) => {
          const isActive = t.key === active;
          const panelId = `phase-panel-${t.key}`;
          const tabId = `phase-tab-${t.key}`;
          const showDot = needsDot[t.key];
          return (
            <button
              key={t.key}
              id={tabId}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={panelId}
              tabIndex={isActive ? 0 : -1}
              className={`phase-tab${isActive ? " is-active" : ""}`}
              onClick={() => selectTab(t.key, false)}
              onKeyDown={(e) => onKeyDown(e, idx)}
            >
              <span className="phase-tab-label">{t.label}</span>
              {showDot ? (
                <span className="phase-tab-dot" aria-hidden="true">
                  <span className="visually-hidden"> needs review</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

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
            className="phase-panel"
            {...(focusable ? { tabIndex: 0 } : {})}
          >
            {isActive ? children[t.key] : null}
          </div>
        );
      })}
    </div>
  );
}

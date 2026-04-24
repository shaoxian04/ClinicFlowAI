"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { apiGet, apiPostVoid } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { cn } from "@/design/cn";
import { Skeleton } from "@/components/ui/Skeleton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Separator } from "@/components/ui/Separator";
import { Button } from "@/components/ui/Button";

type RecentVisit = { visitId: string; date: string; diagnosis: string };

export type PatientContext = {
  allergies: { id: string; label: string }[];
  chronicConditions: { id: string; label: string }[];
  activeMedications: { id: string; name: string; dose: string }[];
  recentVisits: RecentVisit[];
};

type PatientContextPanelProps = {
  patientId: string;
};

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; data: PatientContext }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export function PatientContextPanel({ patientId }: PatientContextPanelProps) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    apiGet<PatientContext>(`/patients/${patientId}/context`)
      .then((data) => {
        if (cancelled) return;
        setState({ kind: "ready", data });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("HTTP 404") || msg.startsWith("HTTP 502") || msg.startsWith("HTTP 504")) {
          setState({ kind: "unavailable" });
          return;
        }
        setState({ kind: "error", message: msg });
      });
    return () => { cancelled = true; };
  }, [patientId]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);

  const body = <PanelBody state={state} />;

  return (
    <>
      {/* Inline sticky rail (>=1200px) */}
      <aside
        className="hidden xl:block w-64 flex-shrink-0"
        aria-label="Patient context"
      >
        <div className="bg-slate rounded-sm border border-slate/80 p-4 sticky top-20">
          <SectionHeader
            number="01"
            title="Patient context"
            className="text-paper/70 [&>span:first-child]:text-paper/30 [&>span:nth-child(2)]:text-paper/20 [&>span:last-child]:text-paper/60 mb-4"
          />
          {body}
        </div>
      </aside>

      {/* Mobile/tablet toggle (<1200px) */}
      <div className="xl:hidden">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={toggleDrawer}
        >
          Patient context
        </Button>
      </div>

      {/* Overlay drawer */}
      <div
        className={cn(
          "xl:hidden fixed inset-0 z-50 transition-opacity duration-200",
          drawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
          onClick={closeDrawer}
          aria-hidden="true"
        />
        <aside
          id={drawerId}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-72 bg-slate p-5 overflow-y-auto transition-transform duration-200",
            drawerOpen ? "translate-x-0" : "translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Patient context"
        >
          <div className="flex items-center justify-between mb-4">
            <SectionHeader
              number="01"
              title="Patient context"
              className="text-paper/70 [&>span:first-child]:text-paper/30 [&>span:nth-child(2)]:text-paper/20 [&>span:last-child]:text-paper/60"
            />
            <button
              type="button"
              className="text-paper/50 hover:text-paper transition-colors duration-150 font-sans text-sm"
              onClick={closeDrawer}
              aria-label="Close patient context"
            >
              Close
            </button>
          </div>
          <div>{body}</div>
        </aside>
      </div>
    </>
  );
}

function PanelBody({ state }: { state: FetchState }) {
  if (state.kind === "loading") {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading patient context">
        <Skeleton className="h-3 bg-paper/10" style={{ width: "80%" }} />
        <Skeleton className="h-3 bg-paper/10" style={{ width: "65%" }} />
        <Skeleton className="h-3 bg-paper/10" style={{ width: "72%" }} />
        <Skeleton className="h-3 bg-paper/10" style={{ width: "58%" }} />
      </div>
    );
  }

  if (state.kind === "unavailable" || state.kind === "error") {
    return (
      <p className="font-sans text-xs text-paper/40 leading-relaxed">
        {state.kind === "unavailable"
          ? "Context unavailable — patient record not yet integrated with graph-KB."
          : `Context unavailable — ${state.message}.`}
      </p>
    );
  }

  const { recentVisits } = state.data;
  const recent = recentVisits.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] text-paper/40 uppercase tracking-widest">
            Recent visits
          </span>
          <span className="font-mono text-[10px] text-paper/30">{recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <p className="font-sans text-xs text-paper/40">No prior visits.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((v) => (
              <li key={v.visitId} className="flex flex-col gap-0.5">
                <span className="font-sans text-xs text-paper/70 leading-snug">{v.diagnosis}</span>
                <span className="font-mono text-[10px] text-paper/40">{formatDate(v.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SeedDemoButton allEmpty={recentVisits.length === 0} />
    </div>
  );
}

function SeedDemoButton({ allEmpty }: { allEmpty: boolean }) {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setUser(getUser()); }, []);

  if (!allEmpty || !user?.devSeedAllowed) return null;

  async function click() {
    setBusy(true);
    setErr(null);
    try {
      await apiPostVoid("/patients/context/seed-demo-all", {});
      window.location.reload();
      return;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="font-sans text-xs text-paper/50 hover:text-paper/80 transition-colors duration-150 text-left"
        onClick={click}
        disabled={busy}
      >
        {busy ? "Seeding…" : "Seed demo graph (all patients)"}
      </button>
      {err && <p className="font-mono text-[10px] text-crimson/70">{err}</p>}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

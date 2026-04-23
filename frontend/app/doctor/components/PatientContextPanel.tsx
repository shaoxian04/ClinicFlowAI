"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { apiGet, apiPostVoid } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { SkeletonLine } from "@/app/components/Skeleton";

type Allergy = { id: string; label: string };
type ChronicCondition = { id: string; label: string };
type ActiveMedication = { id: string; name: string; dose: string };
type RecentVisit = { visitId: string; date: string; diagnosis: string };
type PastRecord = {
  visitId: string;
  date: string;
  diagnosis: string;
  medications: string[];
  doctor: string;
};

export type PatientContext = {
  allergies: Allergy[];
  chronicConditions: ChronicCondition[];
  activeMedications: ActiveMedication[];
  recentVisits: RecentVisit[];
  pastMedicalRecords?: PastRecord[];
};

type PatientContextPanelProps = {
  patientId: string;
};

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; data: PatientContext }
  | { kind: "unavailable" } // HTTP 404 — known precondition
  | { kind: "error"; message: string };

/**
 * Patient context sidebar surfacing multi-hop graph-KB results per SAD §2.4.1.
 *
 * Read-only clinical-context hints (allergies, chronic conditions, active
 * medications, recent visits). Fetched from the backend graph-KB endpoint;
 * each block has its own empty-state so the panel never bleeds. A 404 is
 * expected while the endpoint is unimplemented — we show a ghost banner
 * inside the panel and keep the rest of the page functional.
 *
 * At >=1200px the panel renders inline as a sticky right rail. Below 1200px
 * the inline form stays hidden and an overlay drawer opens via a floating
 * "Patient context" toggle button in the normal page flow.
 */
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
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // Close drawer on Escape.
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
      {/* Inline sticky rail (>=1200px). Hidden below that via CSS. */}
      <aside
        className="pcx-rail"
        aria-label="Patient context"
      >
        <div className="pcx-panel">
          <header className="pcx-panel-head">
            <span className="eyebrow">Graph-KB</span>
            <h2 className="pcx-panel-title">Patient context</h2>
          </header>
          {body}
        </div>
      </aside>

      {/* Mobile/tablet toggle button (<1200px). Hidden above that via CSS. */}
      <div className="pcx-mobile-trigger">
        <button
          type="button"
          className="btn btn-ghost pcx-trigger-btn"
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={toggleDrawer}
        >
          Patient context
        </button>
      </div>

      {/* Overlay drawer (<1200px only). */}
      <div
        className={`pcx-drawer-root${drawerOpen ? " is-open" : ""}`}
        aria-hidden={!drawerOpen}
      >
        <div
          className="pcx-drawer-backdrop"
          onClick={closeDrawer}
          aria-hidden="true"
        />
        <aside
          id={drawerId}
          className="pcx-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Patient context"
        >
          <header className="pcx-drawer-head">
            <div>
              <span className="eyebrow">Graph-KB</span>
              <h2 className="pcx-panel-title">Patient context</h2>
            </div>
            <button
              type="button"
              className="btn btn-ghost pcx-drawer-close"
              onClick={closeDrawer}
              aria-label="Close patient context"
            >
              Close
            </button>
          </header>
          <div className="pcx-drawer-body">{body}</div>
        </aside>
      </div>
    </>
  );
}

function PanelBody({ state }: { state: FetchState }) {
  if (state.kind === "loading") {
    return (
      <div className="pcx-loading" role="status" aria-label="Loading patient context">
        <SkeletonLine width="80%" />
        <SkeletonLine width="65%" />
        <SkeletonLine width="72%" />
        <SkeletonLine width="58%" />
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="banner banner-ghost">
        Context unavailable — patient record not yet integrated with graph-KB.
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="banner banner-ghost">
        Context unavailable — {state.message}.
      </div>
    );
  }

  const { allergies, chronicConditions, activeMedications, recentVisits, pastMedicalRecords } = state.data;
  const recent = recentVisits.slice(0, 3);
  const records = (pastMedicalRecords ?? []).slice(0, 5);

  return (
    <div className="pcx-blocks">
      <details className="pcx-block" open>
        <summary className="pcx-block-head">
          <span className="pcx-block-title">Allergies</span>
          <span className="pcx-block-count">{allergies.length}</span>
        </summary>
        <div className="pcx-block-body">
          {allergies.length === 0 ? (
            <p className="pcx-empty">No known allergies on file.</p>
          ) : (
            <ul className="pcx-list pcx-list-allergies">
              {allergies.map((a) => (
                <li key={a.id} className="pcx-item">
                  <span className="pcx-dot" aria-hidden="true" />
                  <span className="pcx-item-label">{a.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="pcx-block" open>
        <summary className="pcx-block-head">
          <span className="pcx-block-title">Chronic conditions</span>
          <span className="pcx-block-count">{chronicConditions.length}</span>
        </summary>
        <div className="pcx-block-body">
          {chronicConditions.length === 0 ? (
            <p className="pcx-empty">No chronic conditions recorded.</p>
          ) : (
            <ul className="pcx-list">
              {chronicConditions.map((c) => (
                <li key={c.id} className="pcx-item">
                  <span className="pcx-item-label">{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="pcx-block" open>
        <summary className="pcx-block-head">
          <span className="pcx-block-title">Active medications</span>
          <span className="pcx-block-count">{activeMedications.length}</span>
        </summary>
        <div className="pcx-block-body">
          {activeMedications.length === 0 ? (
            <p className="pcx-empty">No active medications.</p>
          ) : (
            <ul className="pcx-list">
              {activeMedications.map((m) => (
                <li key={m.id} className="pcx-item pcx-item-med">
                  <span className="pcx-item-label">{m.name}</span>
                  <span className="pcx-item-meta">{m.dose}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="pcx-block" open>
        <summary className="pcx-block-head">
          <span className="pcx-block-title">Recent visits</span>
          <span className="pcx-block-count">{recent.length}</span>
        </summary>
        <div className="pcx-block-body">
          {recent.length === 0 ? (
            <p className="pcx-empty">No prior visits.</p>
          ) : (
            <ul className="pcx-list">
              {recent.map((v) => (
                <li key={v.visitId} className="pcx-item pcx-item-visit">
                  <span className="pcx-item-label">{v.diagnosis}</span>
                  <span className="pcx-item-meta">{formatDate(v.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {pastMedicalRecords !== undefined && (
        <details className="pcx-block" open>
          <summary className="pcx-block-head">
            <span className="pcx-block-title">Past medical records</span>
            <span className="pcx-block-count">{records.length}</span>
          </summary>
          <div className="pcx-block-body">
            {records.length === 0 ? (
              <p className="pcx-empty">No finalized records on file.</p>
            ) : (
              <ul className="pcx-list">
                {records.map((r) => (
                  <li key={r.visitId} className="pcx-item pcx-item-record">
                    <div className="pcx-record-top">
                      <span className="pcx-item-label">{r.diagnosis}</span>
                      <span className="pcx-item-meta">{formatDate(r.date)}</span>
                    </div>
                    {r.medications.length > 0 && (
                      <div className="pcx-record-meds">
                        {r.medications.join(" · ")}
                      </div>
                    )}
                    <div className="pcx-record-doctor">{r.doctor}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}

      <SeedDemoButton
        allEmpty={
          allergies.length === 0 &&
          chronicConditions.length === 0 &&
          activeMedications.length === 0 &&
          recentVisits.length === 0
        }
      />
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
      return; // prevent finally from updating state after reload
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pcx-seed-bar">
      <button type="button" className="btn btn-ghost" onClick={click} disabled={busy}>
        {busy ? "Seeding…" : "Seed demo graph (all patients)"}
      </button>
      {err && <p className="pcx-seed-error">{err}</p>}
    </div>
  );
}

function formatDate(iso: string): string {
  // Defensive: ISO 8601 or date-only, fall back to raw string if unparseable.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

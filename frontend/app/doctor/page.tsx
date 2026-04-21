"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

type VisitSummary = {
  visitId: string;
  patientId: string;
  patientName: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINALIZED" | "CANCELLED";
  preVisitDone: boolean;
  soapFinalized: boolean;
  createdAt: string;
};

type Priority = "draft" | "final" | "awaiting";

function priorityFor(v: VisitSummary): Priority {
  if (v.soapFinalized) return "final";
  if (v.preVisitDone) return "draft";
  return "awaiting";
}

const PRIORITY_ORDER: Record<Priority, number> = { draft: 0, awaiting: 1, final: 2 };

export default function DoctorDashboard() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "DOCTOR") { router.replace("/"); return; }
    apiGet<VisitSummary[]>("/visits")
      .then(setVisits)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  const sorted = useMemo(
    () =>
      [...visits].sort((a, b) => {
        const pa = PRIORITY_ORDER[priorityFor(a)];
        const pb = PRIORITY_ORDER[priorityFor(b)];
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [visits]
  );

  return (
    <main className="shell">
      <span className="eyebrow">Clinician workspace</span>
      <h1 className="page-title">
        Today&apos;s <em>visits</em>
      </h1>
      <p className="page-sub">
        AI drafts sit at the top — review, edit, and sign. Finalized visits show a doctor&apos;s seal and drop to
        the bottom.
      </p>

      {loading && <p className="empty">Loading your visits…</p>}

      {!loading && !error && sorted.length === 0 && (
        <div className="doc-empty">
          <h2 className="doc-empty-title">No visits yet</h2>
          <p className="doc-empty-body">
            Once a patient completes a pre-visit intake, it will appear here ready for you to review and sign.
          </p>
        </div>
      )}

      <div className="doc-grid">
        {sorted.map((v, idx) => {
          const priority = priorityFor(v);
          const delay = Math.min(idx + 1, 5);
          return (
            <Link
              key={v.visitId}
              href={`/doctor/visits/${v.visitId}`}
              className="doc-tile"
              data-priority={priority}
              data-delay={String(delay)}
            >
              <div className="doc-tile-main">
                <span className="doc-tile-name">{v.patientName}</span>
                <div className="doc-tile-meta">
                  <span className="pill pill-ghost">
                    <code>{v.visitId.slice(0, 8)}</code>
                  </span>
                  <span className={`pill ${v.preVisitDone ? "pill-primary" : ""}`}>
                    {v.preVisitDone ? "Pre-visit ✓" : "Pre-visit pending"}
                  </span>
                  {priority === "draft" && <span className="pill pill-warn">AI draft waiting</span>}
                  {priority === "final" && <span className="pill pill-good">Signed</span>}
                  {priority === "awaiting" && <span className="pill">Scheduled</span>}
                  <span>{new Date(v.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <span className="doc-tile-action">
                {priority === "final" ? "Open record" : "Review →"}
              </span>
            </Link>
          );
        })}
      </div>

      {error && <div className="banner banner-error">{error}</div>}
    </main>
  );
}

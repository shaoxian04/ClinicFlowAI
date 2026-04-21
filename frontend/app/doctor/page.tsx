"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { SkeletonGrid } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Stethoscope } from "../components/Illustration";
import { PageHeader } from "../components/PageHeader";

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
      <PageHeader
        eyebrow="Clinician workspace"
        title={<>Today&apos;s <em>visits</em></>}
        sub="AI drafts sit at the top — review, edit, and sign. Finalized visits show a doctor's seal and drop to the bottom."
      />

      {loading && <SkeletonGrid count={4} />}

      {!loading && !error && sorted.length === 0 && (
        <EmptyState
          glyph={<Stethoscope />}
          title="No visits yet"
          body="Once a patient completes a pre-visit intake, it will appear here ready for you to review and sign."
        />
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

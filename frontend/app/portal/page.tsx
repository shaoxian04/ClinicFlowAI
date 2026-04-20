"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

type VisitSummary = {
  visitId: string;
  finalizedAt: string | null;
  summaryEnPreview: string;
  medicationCount: number;
};

export default function PortalHome() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "PATIENT") { router.replace("/login"); return; }
    apiGet<VisitSummary[]>(`/patient/visits`)
      .then((v) => { setVisits(v); setLoaded(true); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  }, [router]);

  return (
    <main className="shell shell-narrow">
      <span className="eyebrow">Patient portal</span>
      <h1 className="page-title">
        Your <em>visits</em> &amp; summaries
      </h1>
      <p className="page-sub">
        Every finalized consultation lives here — a plain-language summary in English and Bahasa Melayu, plus any
        medications your doctor prescribed. <Link href="/previsit/new" style={{ color: "var(--primary)", textDecoration: "underline", textDecorationThickness: 1, textUnderlineOffset: 3 }}>Start a new pre-visit chat →</Link>
      </p>

      {!loaded && <p className="empty">Loading your visits…</p>}

      {loaded && visits.length === 0 && !error && (
        <div className="card" data-delay="1">
          <div className="card-head">
            <h2>Nothing finalized yet</h2>
            <span className="card-idx">—</span>
          </div>
          <p>
            When your doctor finishes and publishes a visit, it will appear on this page with a patient-friendly summary
            you can re-read any time.
          </p>
        </div>
      )}

      {visits.map((v, idx) => (
        <Link
          key={v.visitId}
          href={`/portal/visits/${v.visitId}`}
          className="visit-tile"
          data-delay={String(Math.min(idx + 1, 5))}
        >
          <div className="visit-tile-head">
            <span className="visit-tile-title">
              Visit <em>{v.visitId.slice(0, 8)}</em>
            </span>
            <span className="visit-tile-date">
              {v.finalizedAt ? new Date(v.finalizedAt).toLocaleString() : "—"}
            </span>
          </div>
          <p className="visit-tile-preview">{v.summaryEnPreview || "(summary being prepared…)"}</p>
          <div className="visit-tile-meta">
            <span className="pill pill-primary">
              {v.medicationCount} {v.medicationCount === 1 ? "medication" : "medications"}
            </span>
            <span>Tap to read full summary →</span>
          </div>
        </Link>
      ))}

      {error && <div className="banner banner-error">{error}</div>}
    </main>
  );
}

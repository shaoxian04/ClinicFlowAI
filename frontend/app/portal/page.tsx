"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PortalNav } from "../components/PortalNav";
import { SkeletonGrid } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Envelope } from "../components/Illustration";
import { PageHeader } from "../components/PageHeader";
import { VisitCard } from "./components/VisitCard";

type VisitSummary = {
  visitId: string;
  finalizedAt: string | null;
  summaryEnPreview: string;
  medicationCount: number;
  doctorName?: string | null;
};

export default function PortalHome() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [firstName, setFirstName] = useState<string>("there");

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "PATIENT") { router.replace("/login"); return; }
    const name = (user.email ?? "there").split("@")[0];
    setFirstName(name.charAt(0).toUpperCase() + name.slice(1));
    apiGet<VisitSummary[]>(`/patient/visits`)
      .then((v) => { setVisits(v); setLoaded(true); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  }, [router]);

  const totalMeds = visits.reduce((acc, v) => acc + (v.medicationCount || 0), 0);
  const latestDate = visits
    .map((v) => v.finalizedAt)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()[0];

  return (
    <>
      <PortalNav active="home" />
      <main className="shell shell-narrow portal-shell">
        <PageHeader
          eyebrow="Patient portal"
          title={<>Welcome back, <em>{firstName}</em>.</>}
          sub="Start a new pre-visit chat before your appointment, or re-read any of your past consultation summaries below."
        />

        {/* === Primary action === */}
        <section className="portal-cta-card" data-delay="1">
          <div className="portal-cta-text">
            <span className="eyebrow" style={{ marginBottom: 8, display: "inline-flex" }}>
              Next visit coming up?
            </span>
            <h2 className="portal-cta-title">
              Tell us how you&apos;re <em>feeling</em> — your doctor reads it first.
            </h2>
            <p className="portal-cta-body">
              A short, friendly chat. Five minutes. Your doctor walks in already understanding what brought
              you in, so the visit is for care, not questionnaires.
            </p>
          </div>
          <Link href="/previsit/new" className="btn btn-accent portal-cta-btn">
            Start a new pre-visit chat →
          </Link>
        </section>

        {/* === Stats strip === */}
        {loaded && !error && (
          <div className="portal-stats" data-delay="2">
            <div className="portal-stat">
              <span className="portal-stat-num">{visits.length}</span>
              <span className="portal-stat-label">
                {visits.length === 1 ? "Past consultation" : "Past consultations"}
              </span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat-num">{totalMeds}</span>
              <span className="portal-stat-label">
                {totalMeds === 1 ? "Medicine prescribed" : "Medicines prescribed"}
              </span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat-num">
                {latestDate ? new Date(latestDate).toLocaleDateString() : "—"}
              </span>
              <span className="portal-stat-label">Most recent visit</span>
            </div>
          </div>
        )}

        {/* === Past consultations === */}
        <section className="portal-history" data-delay="3">
          <div className="portal-history-head">
            <h2 className="portal-history-title">Previous consultations</h2>
            <span className="portal-history-count">
              {loaded ? `${visits.length} total` : "Loading…"}
            </span>
          </div>

          {!loaded && <SkeletonGrid count={3} />}

          {loaded && visits.length === 0 && !error && (
            <EmptyState
              glyph={<Envelope />}
              title="Nothing finalized yet"
              body="When your doctor finishes and publishes a visit, it will appear here with a patient-friendly summary you can re-read any time."
            />
          )}

          <div className="portal-history-list">
            {visits.map((v, idx) => (
              <div key={v.visitId} data-delay={String(Math.min(idx + 1, 5))}>
                <VisitCard
                  visitId={v.visitId}
                  date={v.finalizedAt ?? ""}
                  summaryPreview={v.summaryEnPreview}
                  doctorName={v.doctorName}
                  status="finalized"
                />
              </div>
            ))}
          </div>
        </section>

        {error && <div className="banner banner-error">{error}</div>}
      </main>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { SkeletonGrid } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Stethoscope } from "../components/Illustration";
import { PageHeader } from "../components/PageHeader";
import DoctorNav from "./components/DoctorNav";
import VisitRow from "./components/VisitRow";

type VisitSummary = {
  visitId: string;
  patientId: string;
  patientName: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINALIZED" | "CANCELLED";
  preVisitDone: boolean;
  soapFinalized: boolean;
  createdAt: string;
};

function isThisWeek(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  return date >= startOfWeek && date < startOfToday;
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

type VisitGroup = {
  heading: string;
  visits: VisitSummary[];
  collapsible?: boolean;
};

function groupVisits(visits: VisitSummary[]): VisitGroup[] {
  const awaitingReview: VisitSummary[] = [];
  const scheduledToday: VisitSummary[] = [];
  const earlierThisWeek: VisitSummary[] = [];
  const signedAndFiled: VisitSummary[] = [];

  for (const v of visits) {
    if (v.soapFinalized) {
      signedAndFiled.push(v);
    } else if (v.preVisitDone) {
      awaitingReview.push(v);
    } else if (isToday(v.createdAt)) {
      scheduledToday.push(v);
    } else if (isThisWeek(v.createdAt)) {
      earlierThisWeek.push(v);
    } else {
      scheduledToday.push(v);
    }
  }

  const groups: VisitGroup[] = [];

  if (awaitingReview.length > 0) {
    groups.push({ heading: "Awaiting your review", visits: awaitingReview });
  }
  if (scheduledToday.length > 0) {
    groups.push({ heading: "Scheduled today", visits: scheduledToday });
  }
  if (earlierThisWeek.length > 0) {
    groups.push({ heading: "Earlier this week", visits: earlierThisWeek });
  }
  if (signedAndFiled.length > 0) {
    groups.push({ heading: "Signed & filed", visits: signedAndFiled, collapsible: true });
  }

  return groups;
}

export default function DoctorDashboard() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "DOCTOR") { router.replace("/"); return; }
    apiGet<VisitSummary[]>("/visits")
      .then(setVisits)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  const groups = useMemo(() => groupVisits(visits), [visits]);

  const effectiveGroup = useMemo(() => {
    if (groups.length === 0) return null;
    const found = activeGroup ? groups.find((g) => g.heading === activeGroup) : null;
    return found ?? groups[0];
  }, [groups, activeGroup]);

  const selectGroup = useCallback((heading: string) => setActiveGroup(heading), []);

  return (
    <>
      <DoctorNav active="today" />
      <main className="shell">
        <PageHeader
          eyebrow="Clinician workspace"
          title={<>Today&apos;s <em>visits</em></>}
          sub="Select a group below to review. AI drafts appear first — edit and sign before finalizing."
        />

        {loading && <SkeletonGrid count={4} />}

        {!loading && !error && visits.length === 0 && (
          <EmptyState
            glyph={<Stethoscope />}
            title="No visits yet"
            body="Once a patient completes a pre-visit intake, it will appear here ready for you to review and sign."
          />
        )}

        {!loading && groups.length > 0 && (
          <>
            <div className="visit-filter-tabs" role="tablist">
              {groups.map((g) => (
                <button
                  key={g.heading}
                  role="tab"
                  aria-selected={effectiveGroup?.heading === g.heading}
                  className={`visit-filter-tab${effectiveGroup?.heading === g.heading ? " active" : ""}`}
                  onClick={() => selectGroup(g.heading)}
                >
                  {g.heading}
                  <span className="visit-filter-count">{g.visits.length}</span>
                </button>
              ))}
            </div>

            {effectiveGroup && (
              <div className="visit-group-rows">
                {effectiveGroup.visits.map((v) => (
                  <VisitRow
                    key={v.visitId}
                    visitId={v.visitId}
                    patientName={v.patientName}
                    date={v.createdAt}
                    preVisitDone={v.preVisitDone}
                    visitDone={v.status === "IN_PROGRESS" || v.status === "FINALIZED"}
                    postVisitDone={v.soapFinalized}
                    awaitingReview={v.preVisitDone && !v.soapFinalized}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {error && <div className="banner banner-error">{error}</div>}
      </main>
    </>
  );
}

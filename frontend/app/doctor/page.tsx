"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Separator } from "@/components/ui/Separator";
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
  if (awaitingReview.length > 0)
    groups.push({ heading: "Awaiting your review", visits: awaitingReview });
  if (scheduledToday.length > 0)
    groups.push({ heading: "Scheduled today", visits: scheduledToday });
  if (earlierThisWeek.length > 0)
    groups.push({ heading: "Earlier this week", visits: earlierThisWeek });
  if (signedAndFiled.length > 0)
    groups.push({ heading: "Signed & filed", visits: signedAndFiled, collapsible: true });

  return groups;
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="bone" className="flex flex-col gap-1 p-4">
      <span className="font-display text-2xl text-ink">{value}</span>
      <span className="font-mono text-[10px] text-ink-soft uppercase tracking-widest">{label}</span>
    </Card>
  );
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

  const awaitingCount = useMemo(
    () => visits.filter((v) => v.preVisitDone && !v.soapFinalized).length,
    [visits]
  );
  const todayCount = useMemo(
    () => visits.filter((v) => isToday(v.createdAt)).length,
    [visits]
  );
  const finalizedCount = useMemo(
    () => visits.filter((v) => v.soapFinalized).length,
    [visits]
  );

  return (
    <>
      <DoctorNav active="today" />
      <main className="max-w-screen-xl mx-auto px-6 py-8">
        <motion.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="flex flex-col"
        >
          {/* Page header */}
          <motion.div variants={fadeUp} className="mb-6">
            <p className="font-mono text-xs text-ink-soft/60 uppercase tracking-widest mb-2">
              Clinician workspace
            </p>
            <h1 className="font-display text-3xl text-ink leading-tight">
              Today&apos;s{" "}
              <em className="not-italic text-oxblood">visits</em>
            </h1>
            <p className="font-sans text-sm text-ink-soft mt-2">
              AI drafts appear first — edit and sign before finalizing.
            </p>
          </motion.div>

          {/* KPI strip */}
          {!loading && (
            <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3 mb-8 max-w-sm">
              <KpiCard label="Awaiting review" value={awaitingCount} />
              <KpiCard label="Today" value={todayCount} />
              <KpiCard label="Finalized" value={finalizedCount} />
            </motion.div>
          )}

          {loading && (
            <motion.div variants={fadeUp} className="flex flex-col gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </motion.div>
          )}

          {!loading && !error && visits.length === 0 && (
            <motion.div variants={fadeUp}>
              <EmptyState
                title="No visits yet"
                description="Once a patient completes a pre-visit intake, it will appear here ready for you to review and sign."
              />
            </motion.div>
          )}

          {!loading && groups.length > 0 && (
            <motion.div variants={fadeUp}>
              {/* Group tabs */}
              <div className="flex gap-0 border-b border-hairline mb-4" role="tablist">
                {groups.map((g) => (
                  <button
                    key={g.heading}
                    role="tab"
                    aria-selected={effectiveGroup?.heading === g.heading}
                    className={cn(
                      "px-4 py-2 text-sm font-sans transition-colors duration-150 border-b-2 -mb-px",
                      effectiveGroup?.heading === g.heading
                        ? "text-oxblood border-oxblood"
                        : "text-ink-soft border-transparent hover:text-ink"
                    )}
                    onClick={() => selectGroup(g.heading)}
                  >
                    {g.heading}
                    <span className={cn(
                      "ml-2 font-mono text-xs",
                      effectiveGroup?.heading === g.heading ? "text-oxblood/60" : "text-ink-soft/50"
                    )}>
                      {g.visits.length}
                    </span>
                  </button>
                ))}
              </div>

              {/* Visit rows */}
              {effectiveGroup && (
                <Card variant="paper" className="p-0 overflow-hidden">
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
                </Card>
              )}
            </motion.div>
          )}

          {error && (
            <motion.div variants={fadeUp}>
              <div className="flex items-start gap-2 px-4 py-3 bg-crimson/10 border border-crimson/30 rounded-xs text-sm text-crimson font-sans" role="alert">
                {error}
              </div>
            </motion.div>
          )}
        </motion.div>
      </main>
    </>
  );
}

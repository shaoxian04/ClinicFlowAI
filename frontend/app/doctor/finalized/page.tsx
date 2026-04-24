"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { fadeUp, staggerChildren } from "@/design/motion";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import DoctorNav from "../components/DoctorNav";
import VisitRow from "../components/VisitRow";

type VisitSummary = {
  visitId: string;
  patientName: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINALIZED" | "CANCELLED";
  preVisitDone: boolean;
  soapFinalized: boolean;
  createdAt: string;
};

export default function DoctorFinalizedPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); return; }
    apiGet<VisitSummary[]>("/visits")
      .then((all) => setVisits(all.filter((v) => v.soapFinalized)))
      .catch((e: Error) => {
        const msg = e.message;
        if (msg === "HTTP 401" || msg === "HTTP 403") { router.replace("/login"); return; }
        setError(msg);
        setVisits([]);
      });
  }, [router]);

  return (
    <>
      <DoctorNav active="finalized" />
      <main className="max-w-screen-xl mx-auto px-6 py-8">
        <motion.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="flex flex-col"
        >
          <motion.div variants={fadeUp} className="mb-8">
            <p className="font-mono text-xs text-ink-soft/60 uppercase tracking-widest mb-2">
              Clinician workspace
            </p>
            <h1 className="font-display text-3xl text-ink leading-tight">
              Finalized <em className="not-italic text-oxblood">visits</em>
            </h1>
          </motion.div>

          {error && (
            <motion.div variants={fadeUp}>
              <div className="flex items-start gap-2 px-4 py-3 bg-crimson/10 border border-crimson/30 rounded-xs text-sm text-crimson font-sans" role="alert">
                {error}
              </div>
            </motion.div>
          )}

          {visits === null && (
            <motion.div variants={fadeUp} className="flex flex-col gap-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </motion.div>
          )}

          {visits !== null && visits.length === 0 && (
            <motion.div variants={fadeUp}>
              <EmptyState
                title="No finalized visits yet"
                description="Visits you finalize will appear here for your reference."
              />
            </motion.div>
          )}

          {visits !== null && visits.length > 0 && (
            <motion.div variants={fadeUp}>
              <Card variant="paper" className="p-0 overflow-hidden">
                {visits.map((v) => (
                  <VisitRow
                    key={v.visitId}
                    visitId={v.visitId}
                    patientName={v.patientName}
                    date={v.createdAt}
                    preVisitDone={v.preVisitDone}
                    visitDone={true}
                    postVisitDone={v.soapFinalized}
                    awaitingReview={false}
                  />
                ))}
              </Card>
            </motion.div>
          )}
        </motion.div>
      </main>
    </>
  );
}

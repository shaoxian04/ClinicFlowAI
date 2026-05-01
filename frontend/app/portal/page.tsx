"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileTextIcon as FileText } from "@/components/icons";

import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { WhatsAppOptInModal } from "@/app/components/schedule/WhatsAppOptInModal";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Separator } from "@/components/ui/Separator";
import { EmptyState } from "@/components/ui/EmptyState";
import { VisitCard } from "./components/VisitCard";
import { NoPortalVisitsIllustration } from "@/components/illustrations/empty/NoPortalVisitsIllustration";

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
  const [showOptIn, setShowOptIn] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "PATIENT") {
      router.replace("/login");
      return;
    }
    const name = (user.email ?? "there").split("@")[0];
    setFirstName(name.charAt(0).toUpperCase() + name.slice(1));
    try {
      const dismissed = localStorage.getItem(`wa-optin-dismissed-${user.userId ?? user.email}`);
      if (!dismissed) setShowOptIn(true);
    } catch { /* private mode */ }
    apiGet<VisitSummary[]>(`/patient/visits`)
      .then((v) => {
        setVisits(v);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  }, [router]);

  const totalMeds = visits.reduce((acc, v) => acc + (v.medicationCount || 0), 0);
  const latestDate = visits
    .map((v) => v.finalizedAt)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()[0];

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <motion.div
        variants={staggerChildren}
        initial="initial"
        animate="animate"
        className="flex flex-col"
      >
        {/* Page header */}
        <motion.div variants={fadeUp} className="mb-10">
          <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
            Patient portal
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-fog leading-tight">
            Welcome back,{" "}
            <em className="not-italic text-cyan">{firstName}</em>.
          </h1>
          <p className="font-sans text-sm text-fog-dim leading-relaxed mt-3">
            Start a new pre-visit chat before your appointment, or re-read any
            of your past consultation summaries below.
          </p>
        </motion.div>

        {/* Primary CTA */}
        <motion.div variants={fadeUp}>
          <Card variant="bone" className="mb-8">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
              Next visit coming up?
            </p>
            <h2 className="font-display text-xl text-fog leading-snug mb-2">
              Tell us how you&apos;re{" "}
              <em className="not-italic text-cyan">feeling</em> — your doctor
              reads it first.
            </h2>
            <p className="font-sans text-sm text-fog-dim leading-relaxed mb-5">
              A short, friendly chat. Five minutes. Your doctor walks in already
              understanding what brought you in.
            </p>
            <Button asChild variant="primary" size="md">
              <Link href="/previsit/new">Start a new pre-visit chat →</Link>
            </Button>
          </Card>
        </motion.div>

        {/* Stats strip */}
        {loaded && !error && (
          <motion.div
            variants={fadeUp}
            className="grid grid-cols-3 gap-4 mb-10"
          >
            {[
              {
                value: visits.length,
                label:
                  visits.length === 1
                    ? "Past consultation"
                    : "Past consultations",
              },
              {
                value: totalMeds,
                label:
                  totalMeds === 1 ? "Medicine prescribed" : "Medicines prescribed",
              },
              {
                value: latestDate
                  ? new Date(latestDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })
                  : "—",
                label: "Most recent visit",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col gap-1 p-4 bg-ink-well border border-ink-rim rounded-sm shadow-card"
              >
                <span className="font-display text-2xl text-fog leading-none">
                  {stat.value}
                </span>
                <span className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest leading-tight">
                  {stat.label}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Previous consultations */}
        <motion.div variants={fadeUp}>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="font-sans text-sm font-medium uppercase tracking-wider text-fog">
              Previous consultations
            </h2>
            <span className="font-mono text-xs text-fog-dim/60">
              {loaded ? `${visits.length} total` : "Loading…"}
            </span>
          </div>

          <Separator className="mb-5" />

          {/* Skeletons */}
          {!loaded && (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {loaded && visits.length === 0 && !error && (
            <EmptyState
              illustration={<NoPortalVisitsIllustration />}
              icon={<FileText />}
              title="Nothing finalized yet"
              description="When your doctor finishes and publishes a visit, it will appear here with a patient-friendly summary you can re-read any time."
            />
          )}

          {/* Visit list */}
          {loaded && visits.length > 0 && (
            <motion.div
              variants={staggerChildren}
              initial="initial"
              animate="animate"
              className="flex flex-col gap-4"
            >
              {visits.map((v) => (
                <motion.div key={v.visitId} variants={fadeUp}>
                  <VisitCard
                    visitId={v.visitId}
                    date={v.finalizedAt ?? ""}
                    summaryPreview={v.summaryEnPreview}
                    doctorName={v.doctorName}
                    status="finalized"
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>

        {/* Error */}
        {error && (
          <div className="mt-4 px-4 py-3 border border-crimson/30 bg-crimson/5 rounded-sm">
            <p className="font-sans text-sm text-crimson">{error}</p>
          </div>
        )}
      </motion.div>
      {showOptIn && (
        <WhatsAppOptInModal
          userId={(getUser()?.userId ?? getUser()?.email) ?? ""}
          onClose={() => setShowOptIn(false)}
        />
      )}
    </main>
  );
}

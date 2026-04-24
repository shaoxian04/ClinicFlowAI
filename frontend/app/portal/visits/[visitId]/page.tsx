"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";
import { PullQuote } from "@/components/ui/PullQuote";
import { Skeleton } from "@/components/ui/Skeleton";
import { MedicationCard } from "@/app/portal/components/MedicationCard";
import { RedFlagsCard } from "@/app/portal/components/RedFlagsCard";
import { FollowUpCard } from "@/app/portal/components/FollowUpCard";

type Detail = {
  visitId: string;
  finalizedAt: string | null;
  summaryEn: string;
  summaryMs: string;
  medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration?: string;
    instructions?: string;
  }[];
  redFlags?: string[];
  followUp?: { when: string; instruction: string } | null;
  doctorName?: string | null;
};

const ATTRIBUTION_COPY: Record<
  "en" | "ms",
  { signedBy: string; signedOnly: string; separator: string }
> = {
  en: { signedBy: "Signed by", signedOnly: "Signed", separator: " · " },
  ms: {
    signedBy: "Ditandatangani oleh",
    signedOnly: "Ditandatangani",
    separator: " · ",
  },
};

const MEDICATIONS_COPY: Record<
  "en" | "ms",
  { heading: string; item: string; items: string; empty: string }
> = {
  en: {
    heading: "Medications",
    item: "item",
    items: "items",
    empty: "No medications prescribed for this visit.",
  },
  ms: {
    heading: "Ubat-ubat",
    item: "perkara",
    items: "perkara",
    empty: "Tiada ubat ditetapkan untuk lawatan ini.",
  },
};

function formatSignedDate(
  iso: string | null | undefined,
  lang: "en" | "ms"
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "ms-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PortalVisitDetail() {
  const router = useRouter();
  const params = useParams<{ visitId: string }>();
  const visitId = params.visitId;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function switchLang(next: "en" | "ms") {
    if (next === lang) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setLang(next);
      return;
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setTransitioning(true);
    timerRef.current = setTimeout(() => {
      setLang(next);
      setTransitioning(false);
      timerRef.current = null;
    }, 90);
  }

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "PATIENT") {
      router.replace("/login");
      return;
    }
    apiGet<Detail>(`/patient/visits/${visitId}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [visitId, router]);

  /* ── Loading state ─────────────────────────────────────────────────────── */
  if (!error && !detail) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-10 space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </main>
    );
  }

  /* ── Error state ───────────────────────────────────────────────────────── */
  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="px-4 py-3 border border-crimson/30 bg-crimson/5 rounded-sm">
          <p className="font-sans text-sm text-crimson">{error}</p>
        </div>
      </main>
    );
  }

  if (!detail) return null;

  const body = lang === "en" ? detail.summaryEn : detail.summaryMs;
  const redFlagsList = detail.redFlags ?? [];
  const followUpData = detail.followUp ?? null;
  const signedDate = formatSignedDate(detail.finalizedAt, lang);
  const attribCopy = ATTRIBUTION_COPY[lang];
  const doctorName = detail.doctorName?.trim() || "";
  let attributionLine: string | null = null;
  if (doctorName && signedDate) {
    attributionLine = `${attribCopy.signedBy} ${doctorName}${attribCopy.separator}${signedDate}`;
  } else if (doctorName) {
    attributionLine = `${attribCopy.signedBy} ${doctorName}`;
  } else if (signedDate) {
    attributionLine = `${attribCopy.signedOnly}${attribCopy.separator}${signedDate}`;
  }

  const medsCopy = MEDICATIONS_COPY[lang];
  const medCount = detail.medications.length;

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <motion.div
        variants={staggerChildren}
        initial="initial"
        animate="animate"
        className="flex flex-col"
      >
        {/* Back link */}
        <motion.div variants={fadeUp} className="mb-8">
          <Link
            href="/portal"
            className="inline-flex items-center gap-1.5 font-sans text-sm text-fog-dim hover:text-cyan transition-colors duration-150 group"
          >
            <span className="font-mono" aria-hidden="true">←</span>
            <span className="border-b border-transparent group-hover:border-cyan transition-colors duration-150">
              All visits
            </span>
          </Link>
        </motion.div>

        {/* Page header */}
        <motion.div variants={fadeUp} className="mb-6">
          <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
            Your visit summary
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-fog leading-tight">
            {lang === "en" ? (
              <>
                What we{" "}
                <em className="not-italic text-cyan">discussed</em>
              </>
            ) : (
              <>
                Apa yang{" "}
                <em className="not-italic text-cyan">kita bincang</em>
              </>
            )}
          </h1>
          <p className="font-sans text-sm text-fog-dim mt-2">
            {lang === "en" ? "Finalized on " : "Dimuktamadkan pada "}
            {detail.finalizedAt
              ? new Date(detail.finalizedAt).toLocaleString(
                  lang === "en" ? "en-MY" : "ms-MY"
                )
              : "—"}
            .
          </p>
        </motion.div>

        {/* Language tabs — Radix-based via the Tabs primitive's parts directly */}
        <motion.div variants={fadeUp} className="mb-8">
          <div
            role="tablist"
            aria-label="Language"
            className="flex gap-0 border-b border-ink-rim mb-6"
          >
            {(["en", "ms"] as const).map((l) => (
              <button
                key={l}
                role="tab"
                aria-selected={lang === l}
                onClick={() => switchLang(l)}
                className={cn(
                  "px-4 py-2 text-sm font-sans transition-colors duration-150 border-b-2 -mb-px focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan/40",
                  lang === l
                    ? "text-cyan border-cyan"
                    : "text-fog-dim border-transparent hover:text-fog"
                )}
              >
                {l === "en" ? "English" : "Bahasa Melayu"}
              </button>
            ))}
          </div>

          {/* Language-toggled content */}
          <div
            className={cn(
              "flex flex-col gap-6 transition-opacity duration-[90ms]",
              transitioning ? "opacity-0" : "opacity-100"
            )}
          >
            {/* Pull-quote summary */}
            <section>
              <PullQuote>
                {body ||
                  (lang === "en"
                    ? "Summary is still being prepared…"
                    : "Ringkasan sedang disediakan…")}
              </PullQuote>

              {attributionLine && (
                <p className="font-mono text-xs text-fog-dim/60 mt-3 pl-6">
                  {attributionLine}
                </p>
              )}
            </section>

            {/* Medications */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-sans text-sm font-medium uppercase tracking-wider text-fog">
                  {medsCopy.heading}
                </h2>
                <span className="font-mono text-xs text-fog-dim/60">
                  {medCount}{" "}
                  {medCount === 1 ? medsCopy.item : medsCopy.items}
                </span>
              </div>

              {medCount === 0 ? (
                <p className="font-sans text-sm text-fog-dim italic">
                  {medsCopy.empty}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {detail.medications.map((m, i) => (
                    <MedicationCard
                      key={i}
                      name={m.name}
                      dosage={m.dosage}
                      frequency={m.frequency}
                      duration={m.duration}
                      instructions={m.instructions}
                      lang={lang}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Red flags + Follow-up */}
            <RedFlagsCard items={redFlagsList} lang={lang} />
            <FollowUpCard data={followUpData} lang={lang} />
          </div>
        </motion.div>
      </motion.div>
    </main>
  );
}

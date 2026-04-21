"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { MedicationCard } from "@/app/portal/components/MedicationCard";
import { RedFlagsCard } from "@/app/portal/components/RedFlagsCard";
import { FollowUpCard } from "@/app/portal/components/FollowUpCard";

type Detail = {
  visitId: string;
  finalizedAt: string | null;
  summaryEn: string;
  summaryMs: string;
  medications: { name: string; dosage: string; frequency: string; duration?: string; instructions?: string }[];
  // Task 8.1: optional safety-net payload. Backend may omit either field until
  // the Post-Visit agent populates them; we fall back to empty/null and the
  // card components render nothing in that case.
  redFlags?: string[];
  followUp?: { when: string; instruction: string } | null;
  // Task 8.2: signing-doctor attribution. Nullable so the backend can stub
  // when it can't resolve the doctor; in that case we hide the attribution
  // line entirely (graceful fallback).
  doctorName?: string | null;
};

// Task 8.2: bilingual strings for the signing-doctor attribution line.
// EN/MS prefix + a shared middle-dot separator. Kept as a local const rather
// than mixing into an inline ternary so the i18n surface stays visible and
// easy to audit.
const ATTRIBUTION_COPY: Record<"en" | "ms", { signedBy: string; signedOnly: string; separator: string }> = {
  en: { signedBy: "Signed by", signedOnly: "Signed", separator: " · " },
  ms: { signedBy: "Ditandatangani oleh", signedOnly: "Ditandatangani", separator: " · " },
};

// Task 9.2: bilingual strings for the medications section.
const MEDICATIONS_COPY: Record<"en" | "ms", { heading: string; item: string; items: string; empty: string }> = {
  en: { heading: "Medications", item: "item", items: "items", empty: "No medications prescribed for this visit." },
  ms: { heading: "Ubat-ubat", item: "item", items: "item", empty: "Tiada ubat ditetapkan untuk lawatan ini." },
};

/**
 * Format a date string as "4 Apr 2026" in the active locale. Malay uses the
 * ms-MY locale which renders short-months as Jan/Feb/Mac/Apr/Mei/Jun/Jul/Ogos/
 * Sep/Okt/Nov/Dis. Returns null for missing input so the caller can hide the
 * attribution line entirely.
 */
function formatSignedDate(iso: string | null | undefined, lang: "en" | "ms"): string | null {
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

  // Task 9.2: fade transition on language switch. Skipped entirely when the
  // user prefers reduced motion — matchMedia is called at interaction time so
  // SSR / missing window is never a concern.
  function switchLang(next: "en" | "ms") {
    if (next === lang) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    if (!user || user.role !== "PATIENT") { router.replace("/login"); return; }
    apiGet<Detail>(`/patient/visits/${visitId}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [visitId, router]);

  if (error) {
    return (
      <main className="shell shell-narrow">
        <div className="banner banner-error">{error}</div>
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="shell shell-narrow">
        <p className="empty">Loading your summary…</p>
      </main>
    );
  }

  const body = lang === "en" ? detail.summaryEn : detail.summaryMs;
  const redFlagsList = detail.redFlags ?? [];
  const followUpData = detail.followUp ?? null;

  // Task 8.2: compute the signing-doctor attribution line. We prefer finalizedAt
  // as the "signed at" timestamp — the patient portal only ever sees finalized
  // visits, so that's the semantically-correct moment of signature. When the
  // doctor name isn't resolvable AND we have no date, we hide the line.
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

  return (
    <main className="shell shell-narrow">
      <Link href="/portal" className="back-link">← All visits</Link>

      <div style={{ marginTop: 18 }}>
        <PageHeader
          eyebrow="Your visit summary"
          title={
            lang === "en" ? (
              <>What we <em>discussed</em></>
            ) : (
              <>Apa yang <em>kita bincang</em></>
            )
          }
          sub={`${lang === "en" ? "Finalized on " : "Dimuktamadkan pada "}${
            detail.finalizedAt ? new Date(detail.finalizedAt).toLocaleString(lang === "en" ? "en-MY" : "ms-MY") : "—"
          }.`}
        />
      </div>

      <div role="tablist" className="lang-toggle" aria-label="Language">
        <button
          role="tab"
          aria-selected={lang === "en"}
          onClick={() => switchLang("en")}
        >
          English
        </button>
        <button
          role="tab"
          aria-selected={lang === "ms"}
          onClick={() => switchLang("ms")}
        >
          Bahasa Melayu
        </button>
      </div>

      {/* Task 9.2: lang-content wrapper drives the 180ms fade on language
          switch. The is-transitioning class sets opacity:0 (90ms), then lang
          state updates and the class is removed so it fades back to 1 (90ms).
          Reduced-motion users bypass setTransitioning entirely (see switchLang). */}
      <div className={`lang-content${transitioning ? " is-transitioning" : ""}`}>
        <section className="summary-card" data-delay="1">
          <span className="summary-quote" aria-hidden="true">&ldquo;</span>
          <div className="summary-card-body">
            {body || (lang === "en" ? "Summary is still being prepared…" : "Ringkasan sedang disediakan…")}
          </div>
        </section>

        {/* Task 8.2: signing-doctor attribution. Rendered directly under the
            summary card so patients see who confirmed their record. Hidden
            entirely when neither name nor date is available. */}
        {attributionLine && (
          <p className="doctor-attribution">{attributionLine}</p>
        )}

        <section className="card" data-delay="2" style={{ marginTop: 24 }}>
          <div className="card-head">
            <h2>{MEDICATIONS_COPY[lang].heading}</h2>
            <span className="card-idx">
              {detail.medications.length}{" "}
              {detail.medications.length === 1
                ? MEDICATIONS_COPY[lang].item
                : MEDICATIONS_COPY[lang].items}
            </span>
          </div>
          {detail.medications.length === 0 ? (
            <p className="empty">{MEDICATIONS_COPY[lang].empty}</p>
          ) : (
            <div className="med-grid">
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

        {/* Task 8.1: safety-net cards. Red flags first (higher priority), then
            follow-up. Both no-op on empty input so they disappear when the
            backend has nothing to report. */}
        <RedFlagsCard items={redFlagsList} lang={lang} />
        <FollowUpCard data={followUpData} lang={lang} />
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";

type Detail = {
  visitId: string;
  finalizedAt: string | null;
  summaryEn: string;
  summaryMs: string;
  medications: { name: string; dosage: string; frequency: string }[];
};

export default function PortalVisitDetail() {
  const router = useRouter();
  const params = useParams<{ visitId: string }>();
  const visitId = params.visitId;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [error, setError] = useState<string | null>(null);

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
          onClick={() => setLang("en")}
        >
          English
        </button>
        <button
          role="tab"
          aria-selected={lang === "ms"}
          onClick={() => setLang("ms")}
        >
          Bahasa Melayu
        </button>
      </div>

      <section className="summary-card" data-delay="1">
        <span className="summary-quote" aria-hidden="true">&ldquo;</span>
        <div className="summary-card-body">
          {body || (lang === "en" ? "Summary is still being prepared…" : "Ringkasan sedang disediakan…")}
        </div>
      </section>

      <section className="card" data-delay="2" style={{ marginTop: 24 }}>
        <div className="card-head">
          <h2>{lang === "en" ? "Medications" : "Ubat-ubat"}</h2>
          <span className="card-idx">
            {detail.medications.length} {detail.medications.length === 1 ? "item" : "items"}
          </span>
        </div>
        {detail.medications.length === 0 ? (
          <p className="empty">
            {lang === "en" ? "No medications prescribed for this visit." : "Tiada ubat ditetapkan untuk lawatan ini."}
          </p>
        ) : (
          <ul className="meds-list">
            {detail.medications.map((m, i) => (
              <li key={i}>
                <span className="med-name">{m.name}</span>
                <span className="med-meta">
                  <span className="med-meta-label">{lang === "en" ? "Dose" : "Dos"}</span>
                  {m.dosage}
                </span>
                <span className="med-meta">
                  <span className="med-meta-label">{lang === "en" ? "How often" : "Kekerapan"}</span>
                  {m.frequency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

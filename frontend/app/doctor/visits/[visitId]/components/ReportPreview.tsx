"use client";
import { useState } from "react";
import { apiPost } from "@/lib/api";

export interface ReportPreviewProps {
  visitId: string;
  summaryEn: string | null | undefined;
  summaryMs: string | null | undefined;
  finalized: boolean;
  approved: boolean;
  finalizedAt: string | null | undefined;
  onPublished: () => void;
}

export function ReportPreview({ visitId, summaryEn, summaryMs, finalized, approved, finalizedAt, onPublished }: ReportPreviewProps) {
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasSummary = !!(summaryEn || summaryMs);
  const text = lang === "en" ? (summaryEn ?? "") : (summaryMs ?? "");

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost(`/visits/${visitId}/report/finalize`, {});
      onPublished();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="report-preview">
      <header className="report-preview-head">
        <h2>Patient preview</h2>
        <div className="lang-toggle" role="tablist">
          <button type="button" role="tab" aria-selected={lang === "en"}
            className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>English</button>
          <button type="button" role="tab" aria-selected={lang === "ms"}
            className={lang === "ms" ? "active" : ""} onClick={() => setLang("ms")}>Bahasa Melayu</button>
        </div>
      </header>

      {!hasSummary && !finalized && !approved && (
        <p className="muted">Approve the report in the Consultation tab to generate the bilingual summary.</p>
      )}

      {!hasSummary && approved && !finalized && (
        <div className="preview-empty">
          <p className="muted">The bilingual summary will be generated when you publish.</p>
        </div>
      )}

      {hasSummary && (
        <article className={`summary-card lang-${lang}`} lang={lang === "ms" ? "ms" : "en"}>
          <blockquote>{text || (lang === "en" ? "(English summary not available)" : "(Malay summary not available)")}</blockquote>
        </article>
      )}

      {finalized && finalizedAt && (
        <div className="published-seal">
          <span className="seal-dot" /> Published on {new Date(finalizedAt).toLocaleString()}
        </div>
      )}

      {!finalized && approved && (
        <div className="publish-bar">
          <button type="button" className="btn-primary" onClick={publish} disabled={busy}>
            {busy ? "Publishing…" : "Publish to patient →"}
          </button>
          {err && <span className="publish-error">{err}</span>}
        </div>
      )}
    </section>
  );
}

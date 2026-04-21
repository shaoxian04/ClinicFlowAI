"use client";

import { useState } from "react";
import { RedFlagsCard } from "@/app/portal/components/RedFlagsCard";
import { FollowUpCard } from "@/app/portal/components/FollowUpCard";

/**
 * Payload returned by POST /api/post-visit/:visitId/draft. Mirrors the patient
 * portal's shape (summaryEn, summaryMs, medications) and adds optional
 * clinical signals (redFlags, followUp) that the doctor may want to confirm
 * before publishing.
 */
export type PostVisitPreviewData = {
  summaryEn: string;
  summaryMs: string;
  medications: { name: string; dosage: string; frequency: string }[];
  redFlags?: string[];
  followUp?: { when: string; instruction: string } | null;
};

export type PostVisitPreviewProps = {
  /** Preview payload, or null when none has been generated yet. */
  data: PostVisitPreviewData | null;
  /** Doctor has acknowledged the preview ("Looks right"). Gates finalize. */
  acknowledged: boolean;
  /** Record the acknowledgement (no-op if already acknowledged). */
  onAcknowledge: () => void;
  /** Request a fresh preview — typically re-calls the /draft endpoint. */
  onRegenerate: () => void | Promise<void>;
  /** True while the draft endpoint is in flight. */
  busy: boolean;
  /** SOAP is finalized — no preview edits should be possible. */
  locked: boolean;
  /**
   * Backend /draft endpoint returned 404 (not wired yet). UI shows a ghost
   * banner and exposes an "Acknowledge anyway" escape hatch so finalize isn't
   * permanently blocked by a missing endpoint. Plan line 474.
   */
  unavailable: boolean;
};

type Lang = "en" | "ms";

const COPY: Record<Lang, {
  noMeds: string;
  medsHeading: string;
  itemsSuffix: (n: number) => string;
}> = {
  en: {
    noMeds: "No medications prescribed.",
    medsHeading: "Medications",
    itemsSuffix: (n) => `${n} ${n === 1 ? "item" : "items"}`,
  },
  ms: {
    noMeds: "Tiada ubat ditetapkan.",
    medsHeading: "Ubat-ubat",
    itemsSuffix: (n) => `${n} ${n === 1 ? "item" : "item"}`,
  },
};

export function PostVisitPreview(props: PostVisitPreviewProps): JSX.Element {
  const { data, acknowledged, onAcknowledge, onRegenerate, busy, locked, unavailable } = props;
  const [lang, setLang] = useState<Lang>("en");
  const copy = COPY[lang];

  const toggleDisabled = !data;

  return (
    <div className="post-visit-preview">
      <div className="post-visit-preview-head">
        <h3 style={{ margin: 0 }}>Patient preview</h3>
        <div role="tablist" className="lang-toggle" aria-label="Language" style={{ margin: 0 }}>
          <button
            role="tab"
            type="button"
            aria-selected={lang === "en"}
            onClick={() => setLang("en")}
            disabled={toggleDisabled}
          >
            English
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={lang === "ms"}
            onClick={() => setLang("ms")}
            disabled={toggleDisabled}
          >
            Bahasa Melayu
          </button>
        </div>
      </div>

      {/* Unavailable state: backend /draft endpoint returned 404. */}
      {unavailable && !data && (
        <>
          <div className="banner post-visit-preview-ghost" role="status">
            Preview unavailable — backend pending. You may proceed to finalize without preview.
          </div>
          {!acknowledged && !locked && (
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-accent"
                onClick={onAcknowledge}
              >
                Acknowledge anyway
              </button>
            </div>
          )}
          {acknowledged && (
            <div className="banner banner-done" style={{ marginTop: 14 }}>
              Preview approved — finalize unlocked.
            </div>
          )}
        </>
      )}

      {/* Empty state: nothing generated yet and no unavailable signal. */}
      {!unavailable && !data && (
        <p className="empty" style={{ textAlign: "center", marginTop: 18 }}>
          No preview generated yet. Click <strong>Generate patient preview</strong> in the Consultation tab.
        </p>
      )}

      {/* Present the preview when data is available. */}
      {data && (
        <>
          <section className="summary-card" data-delay="1" style={{ marginTop: 18 }}>
            <span className="summary-quote" aria-hidden="true">&ldquo;</span>
            <div className="summary-card-body">
              {(lang === "en" ? data.summaryEn : data.summaryMs) ||
                (lang === "en" ? "Summary is still being prepared…" : "Ringkasan sedang disediakan…")}
            </div>
          </section>

          <section className="card" data-delay="2" style={{ marginTop: 18 }}>
            <div className="card-head">
              <h2>{copy.medsHeading}</h2>
              <span className="card-idx">{copy.itemsSuffix(data.medications.length)}</span>
            </div>
            {data.medications.length === 0 ? (
              <p className="empty">{copy.noMeds}</p>
            ) : (
              <ul className="meds-list">
                {data.medications.map((m, i) => (
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

          {/* Task 8.1: reuse the shared portal cards so the doctor preview
              is visually identical to the patient view. */}
          <RedFlagsCard items={data.redFlags ?? []} lang={lang} />
          <FollowUpCard data={data.followUp ?? null} lang={lang} />

          <div className="btn-row" style={{ marginTop: 18 }}>
            <button
              type="button"
              className="btn"
              onClick={() => onRegenerate()}
              disabled={busy || locked}
            >
              {busy ? "Regenerating…" : "Regenerate preview"}
            </button>
            {!acknowledged ? (
              <button
                type="button"
                className="btn btn-accent"
                onClick={onAcknowledge}
                disabled={!data || acknowledged || locked}
              >
                Looks right — ready to publish
              </button>
            ) : (
              <span className="banner banner-done post-visit-preview-ack" role="status">
                Preview approved — finalize unlocked.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { RedFlagsCard } from "@/app/portal/components/RedFlagsCard";
import { FollowUpCard } from "@/app/portal/components/FollowUpCard";
import { cn } from "@/design/cn";

/**
 * Payload returned by POST /api/post-visit/:visitId/draft. Mirrors the patient
 * portal's shape (summaryEn, summaryMs, medications) and adds optional
 * clinical signals (redFlags, followUp) that the doctor may want to confirm
 * before publishing.
 */
export type ReportPreviewData = {
  summaryEn: string;
  summaryMs: string;
  medications: { name: string; dosage: string; frequency: string }[];
  redFlags?: string[];
  followUp?: { when: string; instruction: string } | null;
};

export type ReportPreviewProps = {
  /** Preview payload, or null when none has been generated yet. */
  data: ReportPreviewData | null;
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

export function ReportPreview(props: ReportPreviewProps): JSX.Element {
  const { data, acknowledged, onAcknowledge, onRegenerate, busy, locked, unavailable } = props;
  const [lang, setLang] = useState<Lang>("en");
  const copy = COPY[lang];

  const toggleDisabled = !data;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row: title + lang toggle */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-sans text-sm font-semibold text-ink uppercase tracking-wider m-0">
          Patient preview
        </h3>
        <div
          role="tablist"
          className="inline-flex border border-hairline rounded-xs overflow-hidden"
          aria-label="Language"
        >
          {(["en", "ms"] as const).map((l) => (
            <button
              key={l}
              role="tab"
              type="button"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
              disabled={toggleDisabled}
              className={cn(
                "px-3 py-1 text-xs font-sans transition-colors duration-150 border-r border-hairline last:border-r-0",
                lang === l
                  ? "bg-oxblood text-paper font-medium"
                  : "bg-paper text-ink-soft hover:bg-bone disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {l === "en" ? "English" : "Bahasa Melayu"}
            </button>
          ))}
        </div>
      </div>

      {/* Unavailable state: backend /draft endpoint returned 404. */}
      {unavailable && !data && (
        <>
          <div
            className="px-4 py-3 bg-bone border border-hairline rounded-xs text-sm text-ink-soft font-sans"
            role="status"
          >
            Preview unavailable — backend pending. You may proceed to finalize without preview.
          </div>
          {!acknowledged && !locked && (
            <div className="flex gap-3 mt-2">
              <button
                type="button"
                className="inline-flex items-center h-9 px-4 text-sm font-sans font-medium bg-oxblood text-paper rounded-xs hover:bg-oxblood/90 transition-colors duration-150 disabled:opacity-50"
                onClick={onAcknowledge}
              >
                Acknowledge anyway
              </button>
            </div>
          )}
          {acknowledged && (
            <div
              className="px-4 py-3 bg-sage/10 border border-sage/30 rounded-xs text-sm text-sage font-sans"
              role="status"
            >
              Preview approved — finalize unlocked.
            </div>
          )}
        </>
      )}

      {/* Empty state: nothing generated yet and no unavailable signal. */}
      {!unavailable && !data && (
        <p className="text-center text-sm text-ink-soft font-sans mt-4">
          No preview generated yet. Click <strong className="text-ink">Generate patient preview</strong> in the Consultation tab.
        </p>
      )}

      {/* Present the preview when data is available. */}
      {data && (
        <>
          {/* Summary pull-quote */}
          <blockquote className="font-display text-lg leading-relaxed text-ink border-l-2 border-oxblood pl-5 my-2">
            {(lang === "en" ? data.summaryEn : data.summaryMs) ||
              (lang === "en" ? "Summary is still being prepared…" : "Ringkasan sedang disediakan…")}
          </blockquote>

          {/* Medications */}
          <div className="bg-bone border border-hairline rounded-xs p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-sans text-xs font-semibold text-ink-soft uppercase tracking-wider m-0">
                {copy.medsHeading}
              </h2>
              <span className="font-mono text-xs text-ink-soft/60">
                {copy.itemsSuffix(data.medications.length)}
              </span>
            </div>
            {data.medications.length === 0 ? (
              <p className="text-sm text-ink-soft font-sans">{copy.noMeds}</p>
            ) : (
              <ul className="flex flex-col gap-2 list-none m-0 p-0">
                {data.medications.map((m, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    <span className="font-sans text-sm font-medium text-ink">{m.name}</span>
                    <span className="font-mono text-xs text-ink-soft">
                      {m.dosage} · {m.frequency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <RedFlagsCard items={data.redFlags ?? []} lang={lang} />
          <FollowUpCard data={data.followUp ?? null} lang={lang} />

          {/* Action row */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <button
              type="button"
              className="inline-flex items-center h-9 px-4 text-sm font-sans border border-hairline bg-paper text-ink rounded-xs hover:bg-bone transition-colors duration-150 disabled:opacity-50"
              onClick={() => onRegenerate()}
              disabled={busy || locked}
            >
              {busy ? "Regenerating…" : "Regenerate preview"}
            </button>
            {!acknowledged ? (
              <button
                type="button"
                className="inline-flex items-center h-9 px-4 text-sm font-sans font-medium bg-oxblood text-paper rounded-xs hover:bg-oxblood/90 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onAcknowledge}
                disabled={!data || acknowledged || locked}
              >
                Looks right — ready to publish
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-2 px-3 py-2 bg-sage/10 border border-sage/30 rounded-xs text-sm text-sage font-sans"
                role="status"
              >
                Preview approved — finalize unlocked.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

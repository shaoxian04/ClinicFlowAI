"use client";

import React from "react";

// Frequency code → human-readable expansion (EN + MS).
const FREQ_EXPAND: Record<string, { en: string; ms: string }> = {
  TDS: { en: "three times a day", ms: "tiga kali sehari" },
  TID: { en: "three times a day", ms: "tiga kali sehari" },
  BD:  { en: "twice a day",       ms: "dua kali sehari" },
  BID: { en: "twice a day",       ms: "dua kali sehari" },
  OD:  { en: "once a day",        ms: "sekali sehari" },
  QD:  { en: "once a day",        ms: "sekali sehari" },
  PRN: { en: "as needed",         ms: "bila perlu" },
  QID: { en: "four times a day",  ms: "empat kali sehari" },
};

const COPY: Record<"en" | "ms", {
  dose: string;
  howOften: string;
  duration: string;
  instructions: string;
}> = {
  en: {
    dose: "Dose",
    howOften: "How often",
    duration: "Duration",
    instructions: "Instructions",
  },
  ms: {
    dose: "Dos",
    howOften: "Kekerapan",
    duration: "Tempoh",
    instructions: "Arahan",
  },
};

type Props = {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  instructions?: string;
  lang: "en" | "ms";
};

/**
 * Patient-facing medication card. Shows name, dose, frequency (with expansion
 * for known codes), and optional duration + instructions.
 *
 * Uses `.med-grid` CSS for 2-col layout on desktop (≥640 px), single column
 * on mobile. Introduced in Task 9.1.
 */
export function MedicationCard({
  name,
  dosage,
  frequency,
  duration,
  instructions,
  lang,
}: Props): JSX.Element {
  const copy = COPY[lang];

  // Expand known frequency codes; fall back to raw value.
  const freqUpper = frequency.trim().toUpperCase();
  const expansion = FREQ_EXPAND[freqUpper];
  const freqDisplay = expansion
    ? `${frequency} (${expansion[lang]})`
    : frequency;

  return (
    <div className="med-card">
      <span className="med-name">{name}</span>

      <span className="med-meta">
        <span className="med-meta-label">{copy.dose}</span>
        {dosage}
      </span>

      <span className="med-meta">
        <span className="med-meta-label">{copy.howOften}</span>
        {freqDisplay}
      </span>

      {duration && duration.trim() !== "" && (
        <p className="med-card-duration">
          <strong>{copy.duration}:</strong> {duration}
        </p>
      )}

      {instructions && instructions.trim() !== "" && (
        <p className="med-card-instructions">
          <strong>{copy.instructions}:</strong> {instructions}
        </p>
      )}
    </div>
  );
}

"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { DataRow } from "@/components/ui/DataRow";
import { Separator } from "@/components/ui/Separator";

const FREQ_EXPAND: Record<string, { en: string; ms: string }> = {
  TDS: { en: "three times a day", ms: "tiga kali sehari" },
  TID: { en: "three times a day", ms: "tiga kali sehari" },
  BD: { en: "twice a day", ms: "dua kali sehari" },
  BID: { en: "twice a day", ms: "dua kali sehari" },
  OD: { en: "once a day", ms: "sekali sehari" },
  QD: { en: "once a day", ms: "sekali sehari" },
  PRN: { en: "as needed", ms: "bila perlu" },
  QID: { en: "four times a day", ms: "empat kali sehari" },
};

const COPY: Record<
  "en" | "ms",
  { dose: string; howOften: string; duration: string; instructions: string }
> = {
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

export function MedicationCard({
  name,
  dosage,
  frequency,
  duration,
  instructions,
  lang,
}: Props): JSX.Element {
  const copy = COPY[lang];
  const freqUpper = frequency.trim().toUpperCase();
  const expansion = FREQ_EXPAND[freqUpper];
  const freqDisplay = expansion
    ? `${frequency} (${expansion[lang]})`
    : frequency;

  return (
    <Card variant="bone" className="space-y-3">
      {/* Drug name */}
      <p className="font-sans font-medium text-sm text-fog">{name}</p>

      <Separator className="my-0" />

      <div className="space-y-2">
        <DataRow label={copy.dose} value={dosage} mono />
        <DataRow label={copy.howOften} value={freqDisplay} mono />

        {duration && duration.trim() !== "" && (
          <DataRow label={copy.duration} value={duration} mono />
        )}
      </div>

      {instructions && instructions.trim() !== "" && (
        <div className="pt-1 border-t border-ink-rim">
          <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-1">
            {copy.instructions}
          </p>
          <p className="font-sans text-xs text-fog-dim leading-relaxed">
            {instructions}
          </p>
        </div>
      )}
    </Card>
  );
}

"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { DataRow } from "@/components/ui/DataRow";
import { SectionHeader } from "@/components/ui/SectionHeader";

export type FollowUpData = {
  when: string;
  instruction: string;
};

type Props = {
  data: FollowUpData | null | undefined;
  lang: "en" | "ms";
};

const COPY: Record<"en" | "ms", { title: string; when: string; what: string }> =
  {
    en: { title: "Next step", when: "When", what: "What" },
    ms: { title: "Langkah seterusnya", when: "Bila", what: "Apa" },
  };

export function FollowUpCard({ data, lang }: Props): JSX.Element | null {
  if (!data) return null;
  const when = (data.when ?? "").trim();
  const instruction = (data.instruction ?? "").trim();
  if (!when && !instruction) return null;

  const copy = COPY[lang];

  return (
    <section role="region" aria-label={copy.title}>
      <Card variant="bone" className="space-y-4">
        <SectionHeader title={copy.title} />
        <div className="space-y-2">
          <DataRow label={copy.when} value={when || "—"} mono />
          <DataRow label={copy.what} value={instruction || "—"} />
        </div>
      </Card>
    </section>
  );
}

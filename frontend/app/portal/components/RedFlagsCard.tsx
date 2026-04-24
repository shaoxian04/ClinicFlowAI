"use client";

import React from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/design/cn";

type Props = {
  items: string[];
  lang: "en" | "ms";
};

const TITLE: Record<"en" | "ms", string> = {
  en: "Come back sooner if:",
  ms: "Datang balik lebih awal jika:",
};

export function RedFlagsCard({ items, lang }: Props): JSX.Element | null {
  if (!items || items.length === 0) return null;
  const title = TITLE[lang];

  return (
    <section role="region" aria-label={title}>
      <Card
        variant="paper"
        className={cn("border-l-2 border-l-crimson")}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="text-crimson flex-shrink-0"
          >
            <path
              d="M8 2L14.5 13H1.5L8 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8 6v3M8 11v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <h2 className="font-sans text-sm font-medium uppercase tracking-wider text-crimson">
            {title}
          </h2>
        </div>

        {/* Flag list */}
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="font-mono text-xs text-crimson/60 mt-0.5 flex-shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-sans text-sm text-fog-dim">{item}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

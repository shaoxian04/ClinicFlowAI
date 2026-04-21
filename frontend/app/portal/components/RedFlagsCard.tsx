"use client";

import React from "react";
import { AlertGlyph } from "@/app/components/AlertGlyph";

type Props = {
  /** Red-flag strings, already localised by the caller. */
  items: string[];
  /** Drives card title language. */
  lang: "en" | "ms";
};

const TITLE: Record<"en" | "ms", string> = {
  en: "Come back sooner if:",
  ms: "Datang balik lebih awal jika:",
};

/**
 * Safety card shown at the end of a post-visit summary listing symptoms that
 * should prompt an earlier return. Red-bordered `.card` surface with an
 * {@link AlertGlyph} at top-left. Renders nothing when `items` is empty — we
 * never want patients to see an empty red-flag placeholder.
 */
export function RedFlagsCard({ items, lang }: Props): JSX.Element | null {
  if (!items || items.length === 0) return null;
  const title = TITLE[lang];

  return (
    <section
      className="card redflags-card"
      data-delay="3"
      role="region"
      aria-label={title}
    >
      <div className="card-head redflags-card-head">
        <AlertGlyph size={18} className="redflags-card-glyph" />
        <h2>{title}</h2>
      </div>
      <ul className="redflags-card-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

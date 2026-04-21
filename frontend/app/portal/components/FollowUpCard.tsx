"use client";

import React from "react";

export type FollowUpData = {
  when: string;
  instruction: string;
};

type Props = {
  /** Follow-up payload, or null/undefined when none was generated. */
  data: FollowUpData | null | undefined;
  /** Drives card title and label language. */
  lang: "en" | "ms";
};

const COPY: Record<
  "en" | "ms",
  { title: string; when: string; what: string }
> = {
  en: { title: "Next step", when: "When", what: "What" },
  ms: { title: "Langkah seterusnya", when: "Bila", what: "Apa" },
};

/**
 * Green-bordered card showing the patient's next step: when to return or act,
 * and what to do. Uses a definition list (`<dl>`) for the label/value rows to
 * match the doctor-preview / portal conventions. Renders nothing when the
 * payload is missing or both fields are blank.
 */
export function FollowUpCard({ data, lang }: Props): JSX.Element | null {
  if (!data) return null;
  const when = (data.when ?? "").trim();
  const instruction = (data.instruction ?? "").trim();
  if (!when && !instruction) return null;

  const copy = COPY[lang];

  return (
    <section
      className="card followup-card"
      data-delay="4"
      role="region"
      aria-label={copy.title}
    >
      <div className="card-head">
        <h2>{copy.title}</h2>
      </div>
      <dl className="followup-card-list">
        <div>
          <dt>{copy.when}</dt>
          <dd>{when || "—"}</dd>
        </div>
        <div>
          <dt>{copy.what}</dt>
          <dd>{instruction || "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

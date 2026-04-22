// frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx
"use client";
import { useState } from "react";
import { PhasedSpinner } from "./PhasedSpinner";

export interface GenerateBarProps {
  onGenerate: (transcript: string) => Promise<void>;
  generating: boolean;
  hasReport: boolean;
  initialTranscript?: string;
}

/**
 * Transcript capture + "Generate report" action. Collapses to a summary row
 * once a report exists. See spec §6.1.
 */
export function GenerateBar({ onGenerate, generating, hasReport, initialTranscript }: GenerateBarProps) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [expanded, setExpanded] = useState(!hasReport);

  async function handleGenerate() {
    if (!transcript.trim()) return;
    console.info("[REVIEW] generate click len=", transcript.length);
    await onGenerate(transcript);
    setExpanded(false);
  }

  if (hasReport && !expanded) {
    return (
      <section className="generate-bar collapsed">
        <span>Transcript: {transcript.trim().split(/\s+/).length} words</span>
        <button type="button" onClick={() => setExpanded(true)}>Edit transcript</button>
        <button type="button" onClick={handleGenerate} disabled={generating}>Regenerate</button>
      </section>
    );
  }

  return (
    <section className="generate-bar">
      <label htmlFor="transcript-ta">Consultation transcript</label>
      <textarea
        id="transcript-ta"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={6}
        placeholder="Paste or type the consultation transcript…"
      />
      <div className="generate-bar-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleGenerate}
          disabled={generating || !transcript.trim()}
          aria-busy={generating}
        >
          {generating ? "Generating…" : "Generate report"}
        </button>
        {generating && <PhasedSpinner />}
      </div>
    </section>
  );
}

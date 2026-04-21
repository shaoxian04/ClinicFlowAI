"use client";

export type TranscriptReviewProps = {
  /** The raw transcript text as produced by capture. Rendered verbatim. */
  transcript: string;
  /** Switch the capture UI back to Type mode with the current transcript preloaded. */
  onEdit: () => void;
  /** Kick off SOAP draft generation from the current transcript. */
  onGenerate: () => void;
  /** True while the parent is running the SOAP generation request. */
  busy?: boolean;
  /** Disable both actions (e.g. SOAP finalized, or transcript empty). */
  disabled?: boolean;
};

/**
 * Read-only preview of the consultation transcript before SOAP generation.
 * SAD §2.4.2 — "raw transcript viewable before report generation".
 *
 * Renders the transcript in a <pre> so whitespace / line breaks survive. The
 * doctor can either edit the text (returns to Type mode with the current
 * transcript preloaded) or generate the SOAP draft.
 */
export function TranscriptReview({
  transcript,
  onEdit,
  onGenerate,
  busy = false,
  disabled = false,
}: TranscriptReviewProps) {
  const hasTranscript = transcript.trim().length > 0;

  return (
    <section className="transcript-review" aria-label="Transcript review">
      <div className="transcript-review-head">
        <h3 className="transcript-review-title">Transcript preview</h3>
        <span className="pill pill-warn">Raw — review before generating</span>
      </div>
      {hasTranscript ? (
        <pre className="transcript-review-body">{transcript}</pre>
      ) : (
        <p className="empty">No transcript yet — record, upload, or type above.</p>
      )}
      <div className="btn-row transcript-review-actions">
        <button
          type="button"
          className="btn"
          onClick={onEdit}
          disabled={disabled || !hasTranscript}
        >
          Edit transcript
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={disabled || busy || !hasTranscript}
        >
          {busy ? "Generating…" : "Generate SOAP draft"}
        </button>
      </div>
    </section>
  );
}

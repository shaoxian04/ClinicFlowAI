"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "../../lib/api";
import { markConsentGiven } from "../../lib/auth";

type ConsentPayload = { timestamp: string };

export default function ConsentPage() {
  const router = useRouter();

  const [dataUse, setDataUse] = useState(false);
  const [graphKb, setGraphKb] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stubNote, setStubNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allChecked = dataUse && graphKb && aiProcessing;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allChecked) return;
    setBusy(true);
    setStubNote(null);
    setError(null);

    try {
      await apiPost<unknown>("/api/patient/consent", {
        timestamp: new Date().toISOString(),
      } satisfies ConsentPayload);
      markConsentGiven();
      setBusy(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only treat "endpoint not found yet" or network failures as a graceful stub
      if (!msg.includes("HTTP 404") && !msg.includes("fetch")) {
        // Authoritative server rejection (e.g. 401, 403) — do NOT mark consent
        setError("Consent could not be recorded. Please try again.");
        setBusy(false);
        return;
      }
      // 404 = stub not yet wired; proceed optimistically
      console.warn("[ConsentPage] /api/patient/consent stub or network error — proceeding:", err);
      const note = "Stub — backend pending";
      setStubNote(note);
      markConsentGiven();
      setBusy(false);
      if (note) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1200));
      }
    }

    router.replace("/portal");
  }

  return (
    <main className="auth-shell" style={{ maxWidth: 520 }}>
      <Link href="/" className="back-to-home">← Back home</Link>

      <span className="eyebrow">PDPA compliance · CliniFlow AI</span>
      <h1 className="auth-title" style={{ fontSize: 28, marginBottom: 6 }}>
        Your privacy matters
      </h1>
      <p className="auth-sub">
        Before accessing your patient portal, please read and agree to the
        following so CliniFlow AI can provide safe, personalised care.{" "}
        <Link href="/privacy" style={{ color: "var(--primary)" }}>
          Read our privacy policy →
        </Link>
      </p>

      <section className="auth-card" data-delay="1">
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "16px" }}>
          <label className="field" style={{ cursor: "pointer", gap: 10, display: "flex", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={dataUse}
              onChange={(e) => setDataUse(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0 }}
              required
            />
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>
              I agree to CliniFlow using my data for clinical documentation.
            </span>
          </label>

          <label className="field" style={{ cursor: "pointer", gap: 10, display: "flex", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={graphKb}
              onChange={(e) => setGraphKb(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0 }}
              required
            />
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>
              I agree to my health history being stored in the knowledge base for
              continuity of care.
            </span>
          </label>

          <label className="field" style={{ cursor: "pointer", gap: 10, display: "flex", alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={aiProcessing}
              onChange={(e) => setAiProcessing(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0 }}
              required
            />
            <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)" }}>
              I agree to AI processing of consultation transcripts to generate
              clinical notes, reviewed by my doctor.
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!allChecked || busy}
            style={{ marginTop: 4 }}
          >
            {busy ? "Saving…" : "I agree →"}
          </button>

          {error && <div className="banner banner-error">{error}</div>}
          {stubNote && (
            <p style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", margin: 0 }}>
              {stubNote}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}

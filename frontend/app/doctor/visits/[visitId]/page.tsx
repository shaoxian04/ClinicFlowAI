"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { getUser } from "@/lib/auth";

type Soap = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  finalized: boolean;
  aiDraftHash: string | null;
};

type VisitDetail = {
  visitId: string;
  patientId: string;
  patientName: string;
  status: string;
  preVisitStructured: Record<string, unknown>;
  soap: Soap;
  createdAt: string;
  finalizedAt: string | null;
};

export default function VisitDetailPage() {
  const router = useRouter();
  const params = useParams<{ visitId: string }>();
  const visitId = params.visitId;
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [transcript, setTranscript] = useState("");
  const [soap, setSoap] = useState<Soap>({
    subjective: "", objective: "", assessment: "", plan: "",
    finalized: false, aiDraftHash: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAiDraft, setHasAiDraft] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); return; }
    apiGet<VisitDetail>(`/visits/${visitId}`)
      .then((d) => {
        setDetail(d);
        setSoap(d.soap);
        setHasAiDraft(!!d.soap.aiDraftHash);
      })
      .catch((e) => setError(e.message));
  }, [visitId, router]);

  async function onGenerate() {
    if (!transcript.trim()) { setError("Transcript is required"); return; }
    setBusy(true); setError(null);
    try {
      const s = await apiPost<Soap>(`/visits/${visitId}/soap/generate`, { transcript });
      setSoap(s); setHasAiDraft(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onSaveDraft() {
    setBusy(true); setError(null);
    try {
      const s = await apiPut<Soap>(`/visits/${visitId}/soap`, soap);
      setSoap(s);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onFinalize() {
    if (!soap.subjective.trim() || !soap.objective.trim() || !soap.assessment.trim() || !soap.plan.trim()) {
      setError("All 4 SOAP sections must be non-empty to finalize");
      return;
    }
    if (!confirm("Finalize this SOAP note? This locks the record.")) return;
    setBusy(true); setError(null);
    try {
      const s = await apiPost<Soap>(`/visits/${visitId}/soap/finalize`, soap);
      setSoap(s);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (!detail) return <div style={{ padding: 24 }}>Loading…</div>;

  const fields = (detail.preVisitStructured?.fields ?? {}) as Record<string, unknown>;
  const locked = soap.finalized;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Visit — {detail.patientName}</h1>
      <p>Status: <strong>{detail.status}</strong> · Visit ID: <code>{detail.visitId}</code></p>

      <section style={{ background: "#f4f4f8", padding: 12, borderRadius: 6, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Pre-visit intake</h3>
        {Object.keys(fields).length === 0 ? (
          <p style={{ color: "#666" }}>No pre-visit data captured.</p>
        ) : (
          <ul>
            {Object.entries(fields).map(([k, v]) => (
              <li key={k}><strong>{k}:</strong> {String(v)}</li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Consultation transcript</h3>
        <textarea
          rows={6}
          style={{ width: "100%", fontFamily: "inherit", padding: 8 }}
          placeholder="Paste the consultation transcript here…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={locked}
        />
        <button onClick={onGenerate} disabled={busy || locked} style={{ marginTop: 8 }}>
          {busy ? "Generating…" : "Generate SOAP"}
        </button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>
          SOAP note {hasAiDraft && !locked && <span style={{ color: "#b36b00", fontSize: 14 }}>(AI draft — review before finalizing)</span>}
          {locked && <span style={{ color: "green", fontSize: 14 }}> ✓ Finalized</span>}
        </h3>
        {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: "bold", textTransform: "capitalize" }}>{k}</label>
            <textarea
              rows={3}
              style={{ width: "100%", padding: 8, fontFamily: "inherit", background: locked ? "#f7f7f7" : "white" }}
              value={soap[k]}
              onChange={(e) => setSoap({ ...soap, [k]: e.target.value })}
              disabled={locked}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSaveDraft} disabled={busy || locked || !hasAiDraft}>Save draft</button>
          <button onClick={onFinalize} disabled={busy || locked || !hasAiDraft} style={{ background: "#0070f3", color: "white" }}>
            Finalize
          </button>
        </div>
      </section>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>Error: {error}</p>}
    </div>
  );
}

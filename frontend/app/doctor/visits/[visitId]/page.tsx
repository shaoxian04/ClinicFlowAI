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

type MedRow = { name: string; dosage: string; frequency: string };

type PostVisitResponse = {
  visitId: string;
  summaryEn: string;
  summaryMs: string;
  medications: { id: string; name: string; dosage: string; frequency: string }[];
};

const EMPTY_MED: MedRow = { name: "", dosage: "", frequency: "" };

const SOAP_LABELS: Record<keyof Pick<Soap, "subjective" | "objective" | "assessment" | "plan">, string> = {
  subjective: "Subjective — what the patient reports",
  objective: "Objective — exam & measurements",
  assessment: "Assessment — clinical judgment",
  plan: "Plan — treatment & follow-up",
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
  const [meds, setMeds] = useState<MedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAiDraft, setHasAiDraft] = useState(false);
  const [notified, setNotified] = useState(false);

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

  function addMed() {
    if (meds.length >= 3) return;
    setMeds([...meds, { ...EMPTY_MED }]);
  }

  function updateMed(idx: number, patch: Partial<MedRow>) {
    setMeds(meds.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function removeMed(idx: number) {
    setMeds(meds.filter((_, i) => i !== idx));
  }

  async function onFinalizeAndNotify() {
    if (!soap.subjective.trim() || !soap.objective.trim() || !soap.assessment.trim() || !soap.plan.trim()) {
      setError("All 4 SOAP sections must be non-empty to finalize");
      return;
    }
    for (const m of meds) {
      if (!m.name.trim() || !m.dosage.trim() || !m.frequency.trim()) {
        setError("Each medication needs name, dosage, and frequency (or remove the row)");
        return;
      }
    }
    if (!confirm("Finalize this SOAP and notify the patient? The record will be locked.")) return;
    setBusy(true); setError(null); setNotified(false);
    try {
      const s = await apiPost<Soap>(`/visits/${visitId}/soap/finalize`, soap);
      setSoap(s);
      const postVisit = await apiPost<PostVisitResponse>(`/postvisit/${visitId}/generate`, { medications: meds });
      setNotified(postVisit.summaryEn.length > 0 || postVisit.summaryMs.length > 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <main className="shell">
        <p className="empty">Loading visit…</p>
      </main>
    );
  }

  const fields = (detail.preVisitStructured?.fields ?? {}) as Record<string, unknown>;
  const locked = soap.finalized;

  return (
    <main className="shell">
      <span className="eyebrow">Clinician review</span>
      <h1 className="page-title">
        Visit with <em>{detail.patientName}</em>
      </h1>
      <p className="page-sub">
        Review the pre-visit intake, capture your SOAP note, prescribe up to three medications, and publish a bilingual
        summary to the patient in one action.
      </p>

      <div className="status-row">
        <span className={`pill ${locked ? "pill-good" : "pill-primary"}`}>{detail.status}</span>
        {hasAiDraft && !locked && <span className="pill pill-warn">AI draft pending review</span>}
        {locked && <span className="pill pill-good">Finalized</span>}
        <span className="pill pill-ghost"><code>{detail.visitId.slice(0, 8)}…</code></span>
      </div>

      <section className="card" data-delay="1">
        <div className="card-head">
          <h2>Pre-visit intake</h2>
          <span className="card-idx">01 / INTAKE</span>
        </div>
        {Object.keys(fields).length === 0 ? (
          <p className="empty">No pre-visit data captured.</p>
        ) : (
          <ul>
            {Object.entries(fields).map(([k, v]) => (
              <li key={k}><strong>{k}:</strong> {String(v)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" data-delay="2">
        <div className="card-head">
          <h2>Consultation transcript</h2>
          <span className="card-idx">02 / CAPTURE</span>
        </div>
        <p>Paste or type the consultation transcript. The AI will draft a SOAP note you review below.</p>
        <label className="field">
          <textarea
            className="textarea"
            rows={6}
            placeholder="Patient reports 3 days of productive cough with low-grade fever. Vitals…"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            disabled={locked}
          />
        </label>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onGenerate} disabled={busy || locked}>
            {busy ? "Generating…" : "Generate SOAP draft"}
          </button>
        </div>
      </section>

      <section className="card" data-delay="3">
        <div className="card-head">
          <h2>SOAP note</h2>
          <span className="card-idx">03 / DRAFT</span>
        </div>
        {hasAiDraft && !locked && (
          <div className="banner banner-ai">
            AI-generated draft. Every line is your responsibility — edit freely before finalizing.
          </div>
        )}
        {locked && (
          <div className="banner banner-done">
            SOAP note finalized and locked. The patient record is immutable from here.
          </div>
        )}
        <div style={{ height: 14 }} />
        {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
          <label className="field" key={k}>
            <span className="field-label">{SOAP_LABELS[k]}</span>
            <textarea
              className={`textarea ${locked ? "textarea-locked" : ""}`}
              rows={3}
              value={soap[k]}
              onChange={(e) => setSoap({ ...soap, [k]: e.target.value })}
              disabled={locked}
            />
          </label>
        ))}
        <div className="btn-row">
          <button className="btn" onClick={onSaveDraft} disabled={busy || locked || !hasAiDraft}>
            Save draft
          </button>
        </div>
      </section>

      <section className="card" data-delay="4">
        <div className="card-head">
          <h2>Medications</h2>
          <span className="card-idx card-idx med-counter">{meds.length} / 3</span>
        </div>
        {meds.length === 0 && (
          <p className="empty">No medications yet. Add up to three — the patient will see each with dose and frequency.</p>
        )}
        {meds.map((m, i) => (
          <div className="med-row" key={i}>
            <input
              className="input"
              placeholder="Name (e.g. Paracetamol)"
              value={m.name}
              onChange={(e) => updateMed(i, { name: e.target.value })}
              disabled={locked}
            />
            <input
              className="input"
              placeholder="Dose (e.g. 500 mg)"
              value={m.dosage}
              onChange={(e) => updateMed(i, { dosage: e.target.value })}
              disabled={locked}
            />
            <input
              className="input"
              placeholder="Frequency (e.g. TDS)"
              value={m.frequency}
              onChange={(e) => updateMed(i, { frequency: e.target.value })}
              disabled={locked}
            />
            <button className="btn btn-ghost" onClick={() => removeMed(i)} disabled={locked} aria-label="Remove medication">
              Remove
            </button>
          </div>
        ))}
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button className="btn" onClick={addMed} disabled={locked || meds.length >= 3}>
            + Add medication
          </button>
        </div>
      </section>

      <section className="card finalize-card" data-delay="5">
        <div className="card-head">
          <h2>Finalize &amp; notify</h2>
          <span className="card-idx">04 / PUBLISH</span>
        </div>
        <p>
          One click locks the SOAP note, writes a bilingual English + Malay summary, and publishes it to the patient&apos;s
          portal.
        </p>
        <button className="btn btn-accent" onClick={onFinalizeAndNotify} disabled={busy || locked || !hasAiDraft}>
          {busy ? "Publishing…" : "Finalize & notify patient →"}
        </button>
        {notified && (
          <div className="banner banner-done" style={{ marginTop: 18, background: "rgba(217,227,208,0.95)" }}>
            Patient notified — bilingual summary now live on their portal.
          </div>
        )}
      </section>

      {error && <div className="banner banner-error">{error}</div>}
    </main>
  );
}

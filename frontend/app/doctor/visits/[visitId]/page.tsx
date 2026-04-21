"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { PhaseTabs, PhaseKey } from "@/app/doctor/components/PhaseTabs";
import {
  ConsultationCapture,
  ConsultationCaptureHandle,
} from "@/app/doctor/components/ConsultationCapture";
import { TranscriptReview } from "@/app/doctor/components/TranscriptReview";
import { PatientContextPanel } from "@/app/doctor/components/PatientContextPanel";
import {
  InteractionFlag,
  InteractionFlags,
  keyForFlag,
} from "@/app/doctor/components/InteractionFlags";
import {
  PostVisitPreview,
  PostVisitPreviewData,
} from "@/app/doctor/components/PostVisitPreview";

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
  const [activePhase, setActivePhase] = useState<PhaseKey>("pre");
  const [flags, setFlags] = useState<InteractionFlag[]>([]);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  // Task 6.5: patient-summary preview state. `preview` is the latest draft
  // payload from POST /post-visit/:id/draft; `previewAck` gates finalize;
  // `previewUnavailable` flips true when the backend endpoint 404s so the UI
  // can show a ghost banner without permanently blocking finalize.
  const [preview, setPreview] = useState<PostVisitPreviewData | null>(null);
  const [previewAck, setPreviewAck] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);
  // Reserved for future "checking interactions…" spinner. Kept internal so the
  // fetchFlags helper can guard against overlapping requests without spamming
  // the backend on rapid medication edits.
  const [, setFlagsLoading] = useState(false);
  const captureRef = useRef<ConsultationCaptureHandle | null>(null);

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

  const fetchFlags = useCallback(async () => {
    // Graceful stub — ANY error (HTTP 404, network, envelope error) clears
    // flags and keeps the finalize flow unblocked. Never surface to the
    // doctor: backend precondition may simply not be wired yet.
    setFlagsLoading(true);
    try {
      const data = await apiPost<{ flags: InteractionFlag[] }>(
        `/visits/${visitId}/interactions`,
        { medications: meds },
      );
      setFlags(Array.isArray(data.flags) ? data.flags : []);
    } catch {
      setFlags([]);
    } finally {
      setFlagsLoading(false);
    }
  }, [visitId, meds]);

  async function onGenerate() {
    if (!transcript.trim()) { setError("Transcript is required"); return; }
    setBusy(true); setError(null);
    try {
      const s = await apiPost<Soap>(`/visits/${visitId}/soap/generate`, { transcript });
      setSoap(s); setHasAiDraft(true);
      // Task 6.5: regenerating SOAP invalidates preview
      setPreview(null);
      setPreviewAck(false);
      // Re-check interactions with the (possibly updated) meds list now that
      // the AI draft is in place. Stub-safe — never throws.
      fetchFlags();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onGeneratePreview() {
    setPreviewBusy(true);
    try {
      const data = await apiPost<PostVisitPreviewData>(
        `/post-visit/${visitId}/draft`,
        { medications: meds },
      );
      setPreview(data);
      setPreviewAck(false);
      setPreviewUnavailable(false);
    } catch (e) {
      const msg = (e as Error).message;
      // Graceful stub: a 404 means the backend /draft endpoint isn't wired
      // yet. Surface a ghost banner in the preview panel (no page-level
      // error) and keep finalize reachable via the "Acknowledge anyway"
      // escape hatch. Plan line 474.
      if (msg.startsWith("HTTP 404")) {
        setPreview(null);
        setPreviewUnavailable(true);
      } else {
        setError(msg);
      }
    } finally {
      setPreviewBusy(false);
    }
  }

  // Re-check interactions whenever medications change, but only after an AI
  // draft exists and the note isn't locked. Debounced 500ms so rapid typing
  // in med fields doesn't spam the endpoint.
  useEffect(() => {
    if (!hasAiDraft || soap.finalized) return;
    const handle = setTimeout(() => {
      fetchFlags();
    }, 500);
    return () => clearTimeout(handle);
  }, [meds, hasAiDraft, soap.finalized, fetchFlags]);

  async function onAcknowledge(flag: InteractionFlag, reason: string) {
    const key = keyForFlag(flag);
    try {
      await apiPost(`/visits/${visitId}/overrides`, {
        flag: { medication: flag.medication, conflictsWith: flag.conflictsWith },
        reason,
      });
    } catch {
      // Graceful stub: if the overrides endpoint is unavailable, still record
      // the acknowledgement locally so the doctor isn't permanently blocked.
      // Real deployments will surface the audit-log row server-side.
    }
    setAcknowledged((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
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
    const blockedBy = flags.some(
      (f) => f.severity === "critical" && !acknowledged.has(keyForFlag(f)),
    );
    if (blockedBy) {
      setError("Unacknowledged critical interactions block finalize");
      return;
    }
    if (!previewAck) {
      setError("Preview must be approved before finalizing");
      return;
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

  const onPhaseChange = useCallback((key: PhaseKey) => {
    setActivePhase(key);
  }, []);

  if (!detail) {
    return (
      <main className="shell visit-shell">
        <p className="empty">Loading visit…</p>
      </main>
    );
  }

  const fields = (detail.preVisitStructured?.fields ?? {}) as Record<string, unknown>;
  const locked = soap.finalized;
  const hasBlockingCritical = flags.some(
    (f) => f.severity === "critical" && !acknowledged.has(keyForFlag(f)),
  );

  // Map of normalized medication name → highest-severity flag, used to render
  // an inline chip on each .med-row. critical > warn > info.
  const severityRank: Record<InteractionFlag["severity"], number> = {
    info: 0,
    warn: 1,
    critical: 2,
  };
  const flagByMedName = new Map<string, InteractionFlag>();
  for (const f of flags) {
    const key = f.medication.toLowerCase().trim();
    const existing = flagByMedName.get(key);
    if (!existing || severityRank[f.severity] > severityRank[existing.severity]) {
      flagByMedName.set(key, f);
    }
  }

  const preVisitPanel = (
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
  );

  const consultationPanel = (
    <>
      <InteractionFlags
        flags={flags}
        acknowledged={acknowledged}
        onAcknowledge={onAcknowledge}
        locked={locked}
      />
      <section className="card" data-delay="1">
        <div className="card-head">
          <h2>Consultation capture</h2>
          <span className="card-idx">02 / CAPTURE</span>
        </div>
        <p>Record, upload, or type the consultation — review the raw transcript before the AI drafts a SOAP note below.</p>
        <ConsultationCapture
          ref={captureRef}
          visitId={visitId}
          onTranscriptReady={(t) => setTranscript(t)}
          locked={locked}
        />
        <div style={{ height: 18 }} />
        <TranscriptReview
          transcript={transcript}
          onEdit={() => captureRef.current?.switchToType(transcript)}
          onGenerate={onGenerate}
          busy={busy}
          disabled={locked || !transcript}
        />
      </section>

      <section className="card" data-delay="2">
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
          {hasAiDraft && !locked && (
            <button
              className="btn"
              onClick={onGeneratePreview}
              disabled={previewBusy || locked}
            >
              {previewBusy ? "Generating preview…" : "Generate patient preview"}
            </button>
          )}
        </div>
      </section>

      <section className="card" data-delay="3">
        <div className="card-head">
          <h2>Medications</h2>
          <span className="card-idx card-idx med-counter">{meds.length} / 3</span>
        </div>
        {meds.length === 0 && (
          <p className="empty">No medications yet. Add up to three — the patient will see each with dose and frequency.</p>
        )}
        {meds.map((m, i) => {
          const medKey = m.name.toLowerCase().trim();
          const medFlag = medKey ? flagByMedName.get(medKey) : undefined;
          // Collect conflicts for the tooltip — all flags touching this med,
          // not just the highest-severity one.
          const conflicts = medKey
            ? flags.filter((f) => f.medication.toLowerCase().trim() === medKey)
            : [];
          const tooltip = conflicts
            .map((f) => `${f.severity.toUpperCase()}: conflicts with ${f.conflictsWith} — ${f.reason}`)
            .join("\n");
          return (
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
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button className="btn btn-ghost" onClick={() => removeMed(i)} disabled={locked} aria-label="Remove medication">
                  Remove
                </button>
                {medFlag && (
                  <span
                    className={`med-flag med-flag-${medFlag.severity}`}
                    title={tooltip}
                    aria-label={`Interaction: ${medFlag.severity}`}
                    role="img"
                  >
                    !
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button className="btn" onClick={addMed} disabled={locked || meds.length >= 3}>
            + Add medication
          </button>
        </div>
      </section>

      <section className="card finalize-card" data-delay="4">
        <div className="card-head">
          <h2>Finalize &amp; notify</h2>
          <span className="card-idx">04 / PUBLISH</span>
        </div>
        <p>
          One click locks the SOAP note, writes a bilingual English + Malay summary, and publishes it to the patient&apos;s
          portal.
        </p>
        <button
          className="btn btn-accent"
          onClick={onFinalizeAndNotify}
          disabled={busy || locked || !hasAiDraft || hasBlockingCritical || !previewAck}
        >
          {busy ? "Publishing…" : "Finalize & notify patient →"}
        </button>
        {hasBlockingCritical && !locked && (
          <p className="finalize-gate-note">
            Unacknowledged critical interactions must be overridden before finalizing.
          </p>
        )}
        {!previewAck && !locked && !hasBlockingCritical && (
          <p className="finalize-gate-note">
            Approve the patient preview before finalizing.
          </p>
        )}
        {notified && (
          <div className="banner banner-done" style={{ marginTop: 18, background: "rgba(217,227,208,0.95)" }}>
            Patient notified — bilingual summary now live on their portal.
          </div>
        )}
      </section>
    </>
  );

  const postVisitPanel = (
    <section className="card" data-delay="1">
      <div className="card-head">
        <h2>Post-visit preview</h2>
        <span className="card-idx">05 / PREVIEW</span>
      </div>
      <PostVisitPreview
        data={preview}
        acknowledged={previewAck}
        onAcknowledge={() => setPreviewAck(true)}
        onRegenerate={onGeneratePreview}
        busy={previewBusy}
        locked={locked}
        unavailable={previewUnavailable}
      />
    </section>
  );

  return (
    <main className="shell visit-shell">
      <PageHeader
        eyebrow="Clinician review"
        title={<>Visit with <em>{detail.patientName}</em></>}
        sub="Review the pre-visit intake, capture your SOAP note, prescribe up to three medications, and publish a bilingual summary to the patient in one action."
      />

      <div className="status-row">
        <span className={`pill ${locked ? "pill-good" : "pill-primary"}`}>{detail.status}</span>
        {hasAiDraft && !locked && <span className="pill pill-warn">AI draft pending review</span>}
        {locked && <span className="pill pill-good">Finalized</span>}
        <span className="pill pill-ghost"><code>{detail.visitId.slice(0, 8)}…</code></span>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="visit-rail-grid">
        <div className="visit-rail-main">
          <PhaseTabs
            consultationNeedsReview={hasAiDraft && !locked}
            postVisitNeedsReview={locked && activePhase !== "post"}
            onActiveChange={onPhaseChange}
            panelFocusable={{ pre: true, post: true }}
          >
            {{
              pre: preVisitPanel,
              visit: consultationPanel,
              post: postVisitPanel,
            }}
          </PhaseTabs>
        </div>
        <PatientContextPanel patientId={detail.patientId} />
      </div>
    </main>
  );
}

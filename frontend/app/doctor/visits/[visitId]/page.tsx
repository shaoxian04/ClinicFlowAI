"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { PhaseTabs, PhaseKey } from "@/app/doctor/components/PhaseTabs";
import { PatientContextPanel } from "@/app/doctor/components/PatientContextPanel";
import {
  ReportPreview,
  ReportPreviewData,
} from "@/app/doctor/components/ReportPreview";
import { SplitReview } from "./components/review/SplitReview";

type Soap = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  finalized: boolean;
  aiDraftHash: string | null;
  previewApprovedAt?: string | null;
  summaryEn?: string | null;
  summaryMs?: string | null;
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
  const [error, setError] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseKey>("pre");
  // Report preview state — populated when the doctor navigates to the preview
  // tab after approving the report in SplitReview.
  const [preview] = useState<ReportPreviewData | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); return; }
    apiGet<VisitDetail>(`/visits/${visitId}`)
      .then((d) => {
        setDetail(d);
      })
      .catch((e) => setError(e.message));
  }, [visitId, router]);

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
  const history = Array.isArray(detail.preVisitStructured?.history)
    ? (detail.preVisitStructured?.history as Array<{ role?: string; content?: string }>)
    : [];
  const hasFields = Object.keys(fields).length > 0;
  const hasHistory = history.length > 0;
  const locked = detail.soap.finalized;

  const preVisitPanel = (
    <section className="card" data-delay="1" id="section-intake">
      <div className="card-head">
        <h2>Pre-visit intake</h2>
        <span className="card-idx">01 / INTAKE</span>
      </div>
      {hasFields && (
        <ul>
          {Object.entries(fields).map(([k, v]) => (
            <li key={k}><strong>{k}:</strong> {String(v)}</li>
          ))}
        </ul>
      )}
      {hasHistory && (
        <div className="previsit-transcript" style={{ marginTop: hasFields ? "1rem" : 0 }}>
          {!hasFields && (
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
              Structured fields not yet captured — showing the patient&apos;s intake conversation below.
            </p>
          )}
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
            {history.map((m, i) => {
              const role = (m.role ?? "").toLowerCase();
              const label = role === "user" ? "Patient" : role === "assistant" ? "Assistant" : role || "—";
              return (
                <li key={i} style={{ borderLeft: "2px solid #cfd7cc", paddingLeft: "0.75rem" }}>
                  <div style={{ fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6a7468" }}>
                    {label}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.content ?? ""}</div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {!hasFields && !hasHistory && (
        <p className="empty">No pre-visit data captured.</p>
      )}
    </section>
  );

  const consultationPanel = (
    <SplitReview
      visitId={visitId}
      initialReport={null}
      initialApproved={detail.soap.previewApprovedAt != null}
      locked={locked}
      onNavigateToPreview={() => {
        window.location.hash = "#preview";
      }}
    />
  );

  const reportPreviewPanel = (
    <section className="card" data-delay="1">
      <div className="card-head">
        <h2>Report preview</h2>
        <span className="card-idx">05 / PREVIEW</span>
      </div>
      <ReportPreview
        data={preview}
        acknowledged={false}
        onAcknowledge={() => {}}
        onRegenerate={() => {}}
        busy={false}
        locked={locked}
        unavailable={false}
      />
    </section>
  );

  return (
    <main className="shell visit-shell">
      <PageHeader
        eyebrow="Clinician review"
        title={<>Visit with <em>{detail.patientName}</em></>}
        sub="Review the pre-visit intake, capture your consultation, and publish a bilingual summary to the patient."
      />

      <div className="status-row">
        <span className={`pill ${locked ? "pill-good" : "pill-primary"}`}>{
          ({ AWAITING_DOCTOR_REVIEW: "Awaiting review", IN_PROGRESS: "In progress", FINALIZED: "Finalized" } as Record<string,string>)[detail.status] ?? detail.status
        }</span>
        {locked && <span className="pill pill-good">Finalized</span>}
        <span className="pill pill-ghost"><code>{detail.visitId.slice(0, 8)}…</code></span>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {/* Tab list — always rendered; panels below are context-dependent */}
      <PhaseTabs
        consultationNeedsReview={false}
        reportPreviewNeedsReview={locked && activePhase !== "preview"}
        onActiveChange={onPhaseChange}
        panelFocusable={{ pre: true, preview: true }}
      >
        {{
          pre: (
            /* Pre-Visit: two-column layout with patient context sidebar */
            <div className="visit-rail-grid visit-rail-grid-tri">
              {/* Empty slot to hold the ProgressRail column position */}
              <div aria-hidden="true" />
              <div className="visit-rail-main">{preVisitPanel}</div>
              <PatientContextPanel patientId={detail.patientId} />
            </div>
          ),
          visit: (
            /* Consultation: full-width review layout, no rail grid */
            <div className="review-tabpanel">{consultationPanel}</div>
          ),
          preview: (
            /* Report Preview: full-width layout */
            <div className="review-tabpanel">{reportPreviewPanel}</div>
          ),
        }}
      </PhaseTabs>

    </main>
  );
}

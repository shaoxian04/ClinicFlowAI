"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { PhaseTabs, PhaseKey } from "@/app/doctor/components/PhaseTabs";
import { PatientContextPanel } from "@/app/doctor/components/PatientContextPanel";
import { SplitReview } from "./components/review/SplitReview";
import { ReportPreview } from "./components/ReportPreview";
import { PreVisitSummary } from "./components/PreVisitSummary";
import type { MedicalReport } from "@/lib/types/report";
import type { PreVisitFields } from "@/lib/types/preVisit";

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
  preVisitStructured?: {
    fields?: PreVisitFields;
    history?: Array<{ role: string; content: string }>;
    done?: boolean;
  } | null;
  soap: Soap;
  createdAt: string;
  finalizedAt: string | null;
  reportDraft?: MedicalReport | null;
};

function visitStateChip(detail: VisitDetail): { label: string; tone: "draft" | "review" | "published" } {
  if (detail.soap?.finalized) return { label: "Published", tone: "published" };
  if (detail.soap?.previewApprovedAt) return { label: "Approved — awaiting publish", tone: "review" };
  if (detail.status === "FINALIZED") return { label: "Finalized", tone: "published" };
  return { label: "In progress", tone: "draft" };
}

export default function VisitDetailPage() {
  const router = useRouter();
  const params = useParams<{ visitId: string }>();
  const visitId = params.visitId;
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseKey>("pre");

  const refetch = useCallback(() => {
    apiGet<VisitDetail>(`/visits/${visitId}`)
      .then((d) => setDetail(d))
      .catch((e) => setError(e.message));
  }, [visitId]);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); return; }
    refetch();
  }, [visitId, router, refetch]);

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

  const locked = detail.soap.finalized;

  const chip = visitStateChip(detail);

  const preVisitPanel = (
    <PreVisitSummary
      fields={detail.preVisitStructured?.fields}
      done={!!detail.preVisitStructured?.done}
      capturedAt={null}
    />
  );

  const consultationPanel = (
    <SplitReview
      visitId={visitId}
      initialReport={detail.reportDraft ?? null}
      initialApproved={detail.soap.previewApprovedAt != null}
      locked={locked}
      onNavigateToPreview={() => {
        window.location.hash = "#preview";
      }}
    />
  );

  const currentUser = getUser();
  const doctorName = currentUser?.fullName ?? "Attending";

  const reportPreviewPanel = (
    <ReportPreview
      visitId={visitId}
      patientName={detail.patientName}
      doctorName={doctorName}
      createdAt={detail.createdAt}
      report={detail.reportDraft ?? null}
      finalized={detail.soap?.finalized ?? false}
      approved={detail.soap?.previewApprovedAt != null}
      finalizedAt={detail.finalizedAt}
      onPublished={refetch}
    />
  );

  return (
    <main className="shell visit-shell">
      <PageHeader
        eyebrow="Clinician review"
        title={<>Visit with <em>{detail.patientName}</em></>}
        sub="Review the pre-visit intake, capture your consultation, and publish a bilingual summary to the patient."
      />

      <div className="status-row">
        <span className={`visit-chip chip-${chip.tone}`}>{chip.label}</span>
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

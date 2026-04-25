"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { fadeUp, staggerChildren } from "@/design/motion";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { PhaseTabs, PhaseKey } from "@/app/doctor/components/PhaseTabs";
import { PatientContextPanel } from "@/app/doctor/components/PatientContextPanel";
import { SplitReview } from "./components/review/SplitReview";
import { ReportPreview } from "./components/ReportPreview";
import { PreVisitSummary } from "./components/PreVisitSummary";
import DoctorNav from "@/app/doctor/components/DoctorNav";
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
      <>
        <DoctorNav active="today" />
        <main className="max-w-screen-xl mx-auto px-6 py-8">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-96 w-full mt-4" />
          </div>
        </main>
      </>
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
        refetch();
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
    <>
      <DoctorNav active="today" />
      <main className="max-w-screen-xl mx-auto px-6 py-8">
        <motion.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="flex flex-col"
        >
          {/* Page header */}
          <motion.div variants={fadeUp} className="mb-4">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
              Clinician review
            </p>
            <h1 className="font-display text-3xl text-fog leading-tight">
              Visit with{" "}
              <em className="not-italic text-cyan">{detail.patientName}</em>
            </h1>
            <p className="font-sans text-sm text-fog-dim mt-2">
              Review the pre-visit intake, capture your consultation, and publish a bilingual summary to the patient.
            </p>
          </motion.div>

          {/* Status row */}
          <motion.div variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Badge variant={chip.tone}>{chip.label}</Badge>
            <span className="font-mono text-xs text-fog-dim/50">
              {detail.visitId.slice(0, 8)}…
            </span>
          </motion.div>

          {error && (
            <motion.div variants={fadeUp}>
              <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-crimson/10 border border-crimson/30 rounded-xs text-sm text-crimson font-sans" role="alert">{error}</div>
            </motion.div>
          )}

          {/* Tabs */}
          <motion.div variants={fadeUp}>
            <PhaseTabs
              consultationNeedsReview={false}
              reportPreviewNeedsReview={locked && activePhase !== "preview"}
              onActiveChange={onPhaseChange}
              panelFocusable={{ pre: true, preview: true }}
            >
              {{
                pre: (
                  <div className="flex gap-6 items-start">
                    <div className="flex-1 min-w-0">{preVisitPanel}</div>
                    <PatientContextPanel patientId={detail.patientId} />
                  </div>
                ),
                visit: (
                  <div>{consultationPanel}</div>
                ),
                preview: (
                  <div>{reportPreviewPanel}</div>
                ),
              }}
            </PhaseTabs>
          </motion.div>
        </motion.div>
      </main>
    </>
  );
}

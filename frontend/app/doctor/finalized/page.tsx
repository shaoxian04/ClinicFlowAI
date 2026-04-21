"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Stethoscope } from "@/app/components/Illustration";
import { SkeletonGrid } from "@/app/components/Skeleton";
import DoctorNav from "../components/DoctorNav";
import VisitRow from "../components/VisitRow";

type VisitSummary = {
  visitId: string;
  patientName: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINALIZED" | "CANCELLED";
  preVisitDone: boolean;
  soapFinalized: boolean;
  createdAt: string;
};

export default function DoctorFinalizedPage() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); return; }
    apiGet<VisitSummary[]>("/visits")
      .then((all) => setVisits(all.filter((v) => v.soapFinalized)))
      .catch((e: Error) => {
        const msg = e.message;
        if (msg === "HTTP 401" || msg === "HTTP 403") { router.replace("/login"); return; }
        setError(msg);
        setVisits([]);
      });
  }, [router]);

  return (
    <main className="shell">
      <DoctorNav active="finalized" />
      <div style={{ marginTop: 24 }}>
        <PageHeader eyebrow="Clinician workspace" title="Finalized visits" />
      </div>
      {error && <div className="banner banner-error">{error}</div>}
      {visits === null ? (
        <SkeletonGrid count={3} />
      ) : visits.length === 0 ? (
        <EmptyState
          glyph={<Stethoscope size={56} />}
          title="No finalized visits yet"
          body="Visits you finalize will appear here for your reference."
        />
      ) : (
        <div className="visit-list">
          {visits.map((v) => (
            <VisitRow
              key={v.visitId}
              visitId={v.visitId}
              patientName={v.patientName}
              date={v.createdAt}
              preVisitDone={v.preVisitDone}
              visitDone={true}
              postVisitDone={v.soapFinalized}
              awaitingReview={false}
            />
          ))}
        </div>
      )}
    </main>
  );
}

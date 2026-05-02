"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  getVisitIdentification,
  type VisitIdentification,
} from "@/lib/visit-identification";

export type MedItem = {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  instructions?: string;
};

type Props = {
  visitId: string;
  medications: MedItem[];
  onClose: () => void;
};

function formatDob(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatVisitDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function EPrescriptionModal({ visitId, medications, onClose }: Props) {
  const [ident, setIdent] = useState<VisitIdentification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getVisitIdentification(visitId)
      .then(setIdent)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load prescription data.")
      )
      .finally(() => setLoading(false));
  }, [visitId]);

  /* Close on Escape */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rx-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="w-full max-w-2xl bg-ink-well border border-ink-rim rounded-sm flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-rim shrink-0">
          <div>
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
              Official document
            </p>
            <h2
              id="rx-modal-title"
              className="font-display text-xl text-fog leading-tight mt-0.5"
            >
              E-Prescription
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-fog-dim hover:text-fog transition-colors duration-150 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-32 w-full mt-4" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-3 border border-crimson/30 bg-crimson/5 rounded-sm">
              <p className="font-sans text-sm text-crimson">{error}</p>
            </div>
          )}

          {!loading && !error && ident && (
            <>
              {/* ── Clinic letterhead ──────────────────────────────────── */}
              <section className="border-b border-ink-rim pb-5">
                <h3 className="font-display text-lg text-fog">
                  {ident.clinic.name}
                </h3>
                <p className="font-sans text-sm text-fog-dim mt-1">
                  {ident.clinic.addressLine1}
                  {ident.clinic.addressLine2 ? `, ${ident.clinic.addressLine2}` : ""}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                  {ident.clinic.phone && (
                    <p className="font-mono text-xs text-fog-dim/70">
                      Tel: {ident.clinic.phone}
                    </p>
                  )}
                  {ident.clinic.email && (
                    <p className="font-mono text-xs text-fog-dim/70">
                      {ident.clinic.email}
                    </p>
                  )}
                  {ident.clinic.registrationNumber && (
                    <p className="font-mono text-xs text-fog-dim/70">
                      Reg: {ident.clinic.registrationNumber}
                    </p>
                  )}
                </div>
              </section>

              {/* ── Patient demographics ───────────────────────────────── */}
              <section className="border-b border-ink-rim pb-5">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                  Patient
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  <PatientRow label="Name" value={ident.patient.fullName} />
                  <PatientRow
                    label="NRIC"
                    value={ident.patient.nationalId ?? "—"}
                  />
                  <PatientRow
                    label="Date of Birth"
                    value={formatDob(ident.patient.dateOfBirth)}
                  />
                  <PatientRow
                    label="Age"
                    value={
                      ident.patient.ageYears != null
                        ? `${ident.patient.ageYears} yrs`
                        : "—"
                    }
                  />
                  <PatientRow
                    label="Ref No"
                    value={ident.visit.referenceNumber ?? "—"}
                  />
                  <PatientRow
                    label="Date"
                    value={formatVisitDate(ident.visit.visitDate)}
                  />
                </div>
              </section>

              {/* ── Medications table ──────────────────────────────────── */}
              <section className="border-b border-ink-rim pb-5">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                  Medications prescribed
                </p>

                {medications.length === 0 ? (
                  <p className="font-sans text-sm text-fog-dim italic">
                    No medications prescribed for this visit.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm font-sans border-collapse">
                      <thead>
                        <tr className="border-b border-ink-rim">
                          <th className="text-left py-2 pr-4 font-medium text-fog-dim/80 font-mono text-xs uppercase tracking-wider">
                            Drug
                          </th>
                          <th className="text-left py-2 pr-4 font-medium text-fog-dim/80 font-mono text-xs uppercase tracking-wider">
                            Dose
                          </th>
                          <th className="text-left py-2 pr-4 font-medium text-fog-dim/80 font-mono text-xs uppercase tracking-wider">
                            Frequency
                          </th>
                          <th className="text-left py-2 font-medium text-fog-dim/80 font-mono text-xs uppercase tracking-wider">
                            Duration
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {medications.map((m, i) => (
                          <tr
                            key={i}
                            className="border-b border-ink-rim/50 last:border-0"
                          >
                            <td className="py-2.5 pr-4 text-fog font-medium">
                              {m.name}
                            </td>
                            <td className="py-2.5 pr-4 text-fog-dim font-mono text-xs">
                              {m.dosage || "—"}
                            </td>
                            <td className="py-2.5 pr-4 text-fog-dim font-mono text-xs">
                              {m.frequency || "—"}
                            </td>
                            <td className="py-2.5 text-fog-dim font-mono text-xs">
                              {m.duration || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ── Doctor signature ───────────────────────────────────── */}
              <section>
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                  Prescribing doctor
                </p>
                <p className="font-sans text-sm font-medium text-fog">
                  {ident.doctor.fullName}
                </p>
                <p className="font-mono text-xs text-fog-dim/70 mt-0.5">
                  MMC: {ident.doctor.mmcNumber ?? "—"}
                </p>
                {ident.doctor.specialty && (
                  <p className="font-sans text-xs text-fog-dim mt-0.5">
                    {ident.doctor.specialty}
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-ink-rim shrink-0">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => alert("PDF download coming soon.")}
          >
            Download as PDF
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Internal helpers ────────────────────────────────────────────────────── */

function PatientRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-xs text-fog-dim/50 uppercase tracking-wider">
        {label}
      </span>
      <span className="font-sans text-sm text-fog">{value}</span>
    </div>
  );
}

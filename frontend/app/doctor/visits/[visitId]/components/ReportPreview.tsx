"use client";
import { useState } from "react";
import { apiPost } from "@/lib/api";
import type { MedicalReport } from "@/lib/types/report";
import { cn } from "@/design/cn";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Separator } from "@/components/ui/Separator";

export interface ReportPreviewProps {
  visitId: string;
  patientName: string;
  doctorName: string;
  createdAt: string;
  report: MedicalReport | null;
  finalized: boolean;
  approved: boolean;
  finalizedAt: string | null | undefined;
  onPublished: () => void;
}

const CLINIC = {
  name: "CliniFlow AI Clinic",
  address: "No. 12, Jalan Bukit Bintang, 55100 Kuala Lumpur, Malaysia",
  phone: "+60 3-2145 8800",
  email: "reception@cliniflow.demo",
  registration: "KKM-KL-2024-0451",
};

function demoPatientProfile(visitId: string, patientName: string) {
  const seed = visitId.charCodeAt(0) + visitId.charCodeAt(1);
  const sexes = ["Male", "Female"] as const;
  const year = 1978 + (seed % 40);
  const month = ((seed * 3) % 12) + 1;
  const day = ((seed * 7) % 27) + 1;
  const icSuffix = (seed * 1237).toString().padStart(7, "0").slice(0, 7);
  const phoneLast = (1000 + (seed * 19) % 9000).toString();
  return {
    name: patientName,
    mrn: `MRN-${visitId.slice(0, 6).toUpperCase()}`,
    dob: `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    sex: sexes[seed % 2],
    ic: `${String(year).slice(2)}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}-14-${icSuffix.slice(0, 4)}`,
    phone: `+60 12-345 ${phoneLast}`,
  };
}

function demoDoctorProfile(name: string) {
  return {
    name: formatDoctorName(name),
    specialty: "General Practice",
    mmcNumber: "MMC 54321",
    qualification: "MBBS (UM)",
  };
}

function formatDoctorName(name: string): string {
  const trimmed = name.trim();
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function humanizeVital(key: string): string {
  const map: Record<string, string> = {
    blood_pressure: "BP",
    heart_rate: "HR",
    temperature: "Temp",
    respiratory_rate: "RR",
    spo2: "SpO₂",
    weight: "Weight",
    height: "Height",
    bmi: "BMI",
  };
  return map[key] ?? key.replace(/_/g, " ");
}

const dtCls = "font-mono text-xs text-fog-dim/60 mt-2";
const ddCls = "font-sans text-sm text-fog mt-0.5";
const monoCls = "font-mono text-sm";

export function ReportPreview({
  visitId, patientName, doctorName, createdAt, report,
  finalized, approved, finalizedAt, onPublished,
}: ReportPreviewProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hasReport = report != null;

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost(`/visits/${visitId}/report/finalize`, {});
      onPublished();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visitDate = new Date(createdAt);
  const patient = demoPatientProfile(visitId, patientName);
  const doctor = demoDoctorProfile(doctorName);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Document card */}
      <Card variant="paper" className="p-6">
        {/* ============================ HEADER ============================ */}
        <div className="flex flex-col sm:flex-row sm:justify-between gap-4 mb-6">
          <div>
            <p className="font-display text-lg text-fog">{CLINIC.name}</p>
            <p className="font-sans text-xs text-fog-dim mt-0.5">{CLINIC.address}</p>
            <p className="font-mono text-xs text-fog-dim/60 mt-1 flex flex-wrap gap-2">
              <span>Tel: {CLINIC.phone}</span>
              <span>·</span>
              <span>{CLINIC.email}</span>
              <span>·</span>
              <span>Reg. {CLINIC.registration}</span>
            </p>
          </div>
          <div className="flex flex-col gap-1 sm:items-end flex-shrink-0">
            <div className="flex gap-2 items-baseline">
              <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">Visit ID</span>
              <code className="font-mono text-xs text-fog">{visitId.slice(0, 8)}…</code>
            </div>
            <div className="flex gap-2 items-baseline">
              <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">Date</span>
              <span className="font-mono text-xs text-fog">{visitDate.toLocaleDateString()}</span>
            </div>
            <div className="flex gap-2 items-baseline">
              <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">Time</span>
              <span className="font-mono text-xs text-fog">{visitDate.toLocaleTimeString()}</span>
            </div>
            <div className="flex gap-2 items-baseline">
              <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">Encounter</span>
              <span className="font-sans text-xs text-fog">Outpatient</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* ============================ PARTIES ============================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
          <div>
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest mb-2">Patient</p>
            <p className="font-display text-base text-fog">{patient.name}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className={dtCls}>MRN</dt><dd className={cn(ddCls, monoCls)}>{patient.mrn}</dd>
              <dt className={dtCls}>IC No.</dt><dd className={cn(ddCls, monoCls)}>{patient.ic}</dd>
              <dt className={dtCls}>DOB</dt><dd className={ddCls}>{patient.dob} ({calcAge(patient.dob)} y)</dd>
              <dt className={dtCls}>Sex</dt><dd className={ddCls}>{patient.sex}</dd>
              <dt className={dtCls}>Phone</dt><dd className={ddCls}>{patient.phone}</dd>
            </dl>
          </div>
          <div>
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest mb-2">Attending Doctor</p>
            <p className="font-display text-base text-fog">{doctor.name}</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className={dtCls}>Qualification</dt><dd className={ddCls}>{doctor.qualification}</dd>
              <dt className={dtCls}>Specialty</dt><dd className={ddCls}>{doctor.specialty}</dd>
              <dt className={dtCls}>MMC No.</dt><dd className={cn(ddCls, monoCls)}>{doctor.mmcNumber}</dd>
            </dl>
          </div>
        </div>

        <Separator />

        {/* ============================ CLINICAL REPORT ============================ */}
        {!hasReport && (
          <p className="font-sans text-sm text-fog-dim mt-6">
            No report draft available. Generate a report in the Consultation tab first.
          </p>
        )}

        {hasReport && report && (
          <article className="mt-6 flex flex-col gap-6">
            {/* Subjective */}
            <section>
              <SectionHeader number="01" title="Subjective" className="mb-3" />
              <dl className="grid grid-cols-1 gap-2">
                <div>
                  <dt className={dtCls}>Chief complaint</dt>
                  <dd className={ddCls}>{report.subjective.chiefComplaint || <span className="text-fog-dim/50">—</span>}</dd>
                </div>
                <div>
                  <dt className={dtCls}>History of present illness</dt>
                  <dd className={ddCls}>{report.subjective.historyOfPresentIllness || <span className="text-fog-dim/50">—</span>}</dd>
                </div>
                {report.subjective.symptomDuration && (
                  <div>
                    <dt className={dtCls}>Symptom duration</dt>
                    <dd className={ddCls}>{report.subjective.symptomDuration}</dd>
                  </div>
                )}
                {(report.subjective.associatedSymptoms ?? []).length > 0 && (
                  <div>
                    <dt className={dtCls}>Associated symptoms</dt>
                    <dd className={ddCls}>{(report.subjective.associatedSymptoms ?? []).join(", ")}</dd>
                  </div>
                )}
                {(report.subjective.relevantHistory ?? []).length > 0 && (
                  <div>
                    <dt className={dtCls}>Relevant history</dt>
                    <dd className={ddCls}>{(report.subjective.relevantHistory ?? []).join(", ")}</dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Objective */}
            <section>
              <SectionHeader number="02" title="Objective" className="mb-3" />
              {Object.keys(report.objective.vitalSigns ?? {}).length > 0 && (
                <div className="flex flex-wrap gap-3 mb-3">
                  {Object.entries(report.objective.vitalSigns ?? {}).map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-0.5">
                      <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">{humanizeVital(k)}</span>
                      <strong className="font-mono text-sm text-fog">{v}</strong>
                    </div>
                  ))}
                </div>
              )}
              {report.objective.physicalExam && (
                <div>
                  <dt className={dtCls}>Physical exam</dt>
                  <dd className={ddCls}>{report.objective.physicalExam}</dd>
                </div>
              )}
              {Object.keys(report.objective.vitalSigns ?? {}).length === 0 && !report.objective.physicalExam && (
                <p className="font-sans text-sm text-fog-dim/50">Vitals and exam not captured.</p>
              )}
            </section>

            {/* Assessment */}
            <section>
              <SectionHeader number="03" title="Assessment" className="mb-3" />
              <dl className="grid grid-cols-1 gap-2">
                <div>
                  <dt className={dtCls}>Primary diagnosis</dt>
                  <dd className={ddCls}><strong>{report.assessment.primaryDiagnosis || <span className="text-fog-dim/50">—</span>}</strong></dd>
                </div>
                {(report.assessment.differentialDiagnoses ?? []).length > 0 && (
                  <div>
                    <dt className={dtCls}>Differentials</dt>
                    <dd className={ddCls}>{(report.assessment.differentialDiagnoses ?? []).join(" · ")}</dd>
                  </div>
                )}
                {(report.assessment.icd10Codes ?? []).length > 0 && (
                  <div>
                    <dt className={dtCls}>ICD-10</dt>
                    <dd className={cn(ddCls, monoCls)}>{(report.assessment.icd10Codes ?? []).join(", ")}</dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Plan */}
            <section>
              <SectionHeader number="04" title="Plan" className="mb-3" />

              {(report.plan.medications ?? []).length > 0 && (
                <div className="mb-4">
                  <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest mb-2">Medications</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-ink-rim">
                          {["Drug", "Dose", "Route", "Frequency", "Duration"].map((h) => (
                            <th key={h} className="text-left font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest pb-1.5 pr-4">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(report.plan.medications ?? []).map((m, i) => (
                          <tr key={i} className="border-b border-ink-rim/50">
                            <td className="font-sans text-sm text-fog py-1.5 pr-4"><strong>{m.drugName || "—"}</strong></td>
                            <td className="font-mono text-sm text-fog py-1.5 pr-4">{m.dose || "—"}</td>
                            <td className="font-mono text-sm text-fog py-1.5 pr-4">{m.route || "PO"}</td>
                            <td className="font-mono text-sm text-fog py-1.5 pr-4">{m.frequency || "—"}</td>
                            <td className="font-mono text-sm text-fog py-1.5">{m.duration || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(report.plan.investigations ?? []).length > 0 && (
                <div className="mb-3">
                  <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest mb-1.5">Investigations</p>
                  <ul className="flex flex-col gap-0.5">
                    {(report.plan.investigations ?? []).map((x, i) => (
                      <li key={i} className="font-sans text-sm text-fog flex gap-2">
                        <span className="text-cyan/40 font-mono text-xs">—</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(report.plan.lifestyleAdvice ?? []).length > 0 && (
                <div className="mb-3">
                  <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest mb-1.5">Lifestyle advice</p>
                  <ul className="flex flex-col gap-0.5">
                    {(report.plan.lifestyleAdvice ?? []).map((x, i) => (
                      <li key={i} className="font-sans text-sm text-fog flex gap-2">
                        <span className="text-cyan/40 font-mono text-xs">—</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.plan.followUp.needed && (
                <div className="mb-3">
                  <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest mb-1">Follow-up</p>
                  <p className="font-sans text-sm text-fog">
                    {report.plan.followUp.timeframe ?? "As advised"}
                    {report.plan.followUp.reason ? ` — ${report.plan.followUp.reason}` : ""}
                  </p>
                </div>
              )}

              {(report.plan.redFlags ?? []).length > 0 && (
                <div className="border-l-2 border-l-crimson pl-4 bg-crimson/5 py-2 rounded-xs">
                  <p className="font-mono text-[10px] text-crimson uppercase tracking-widest mb-1.5">Seek urgent care if:</p>
                  <ul className="flex flex-col gap-0.5">
                    {(report.plan.redFlags ?? []).map((x, i) => (
                      <li key={i} className="font-sans text-sm text-crimson/80">{x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </article>
        )}

        {/* ============================ SIGNATURE ============================ */}
        <Separator className="mt-6 mb-4" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">Attending Doctor</span>
          <p className="font-display text-base text-fog">{doctor.name}</p>
          <p className="font-mono text-xs text-fog-dim/60">{doctor.qualification} · {doctor.mmcNumber}</p>
          {finalizedAt && (
            <p className="font-mono text-xs text-fog-dim/50">
              Signed: {new Date(finalizedAt).toLocaleString()}
            </p>
          )}
        </div>
      </Card>

      {/* ============================ PUBLISHED SEAL ============================ */}
      {finalized && finalizedAt && (
        <div className="flex items-center gap-2 px-4 py-3 bg-lime/10 border border-lime/30 rounded-xs">
          <span className="w-2 h-2 rounded-full bg-lime flex-shrink-0" />
          <span className="font-sans text-sm text-lime">
            Published on {new Date(finalizedAt).toLocaleString()}
          </span>
        </div>
      )}

      {/* ============================ PUBLISH ACTION ============================ */}
      {!finalized && approved && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={publish}
            disabled={busy}
          >
            {busy ? "Publishing…" : "Publish to patient"}
          </Button>
          {err && <span className="font-sans text-sm text-crimson">{err}</span>}
        </div>
      )}

      {/* ============================ REPORT ACTIONS ============================ */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {}}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {}}
        >
          Download
        </Button>
      </div>
    </div>
  );
}

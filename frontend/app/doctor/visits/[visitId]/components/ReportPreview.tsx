"use client";
import { useState } from "react";
import { apiPost } from "@/lib/api";
import type { MedicalReport } from "@/lib/types/report";

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

// Demo-only static data. Replace with real clinic/patient/provider records
// when those bounded contexts are implemented (see PRD §3.2, §3.4).
const CLINIC = {
  name: "CliniFlow AI Clinic",
  address: "No. 12, Jalan Bukit Bintang, 55100 Kuala Lumpur, Malaysia",
  phone: "+60 3-2145 8800",
  email: "reception@cliniflow.demo",
  registration: "KKM-KL-2024-0451",
};

// Deterministic fake patient demographics seeded from the visitId so the same
// visit always renders the same header across reloads. Real patient records
// (DOB, IC, gender, phone) will come from the backend once that slice ships.
function demoPatientProfile(visitId: string, patientName: string) {
  const seed = visitId.charCodeAt(0) + visitId.charCodeAt(1);
  const sexes = ["Male", "Female"] as const;
  const year = 1978 + (seed % 40);        // age ~8–48
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

// Demo doctor credentials. Real data will come from the doctor's user profile
// once specialty + MMC# fields are wired through auth.
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
    <>
    <section className="report-preview">
      {/* ============================ HEADER ============================ */}
      <header className="report-doc-head">
        <div className="clinic-block">
          <h1>{CLINIC.name}</h1>
          <p className="muted">{CLINIC.address}</p>
          <p className="clinic-contact">
            <span>Tel: {CLINIC.phone}</span>
            <span>·</span>
            <span>{CLINIC.email}</span>
            <span>·</span>
            <span>Reg. {CLINIC.registration}</span>
          </p>
        </div>
        <div className="visit-meta">
          <div><span>Visit ID</span><code>{visitId.slice(0, 8)}…</code></div>
          <div><span>Date</span>{visitDate.toLocaleDateString()}</div>
          <div><span>Time</span>{visitDate.toLocaleTimeString()}</div>
          <div><span>Encounter</span>Outpatient</div>
        </div>
      </header>

      <div className="parties">
        <div className="party-card">
          <h3>Patient</h3>
          <p className="party-name">{patient.name}</p>
          <dl className="party-grid">
            <dt>MRN</dt><dd className="mono">{patient.mrn}</dd>
            <dt>IC No.</dt><dd className="mono">{patient.ic}</dd>
            <dt>DOB</dt><dd>{patient.dob} ({calcAge(patient.dob)} y)</dd>
            <dt>Sex</dt><dd>{patient.sex}</dd>
            <dt>Phone</dt><dd>{patient.phone}</dd>
          </dl>
        </div>
        <div className="party-card">
          <h3>Attending Doctor</h3>
          <p className="party-name">{doctor.name}</p>
          <dl className="party-grid">
            <dt>Qualification</dt><dd>{doctor.qualification}</dd>
            <dt>Specialty</dt><dd>{doctor.specialty}</dd>
            <dt>MMC No.</dt><dd className="mono">{doctor.mmcNumber}</dd>
          </dl>
        </div>
      </div>

      {/* ============================ CLINICAL REPORT ============================ */}
      {!hasReport && (
        <p className="muted">No report draft available. Generate a report in the Consultation tab first.</p>
      )}

      {hasReport && report && (
        <article className="clinical-doc">
          {/* Subjective */}
          <section className="soap-section">
            <h2>Subjective</h2>
            <dl>
              <dt>Chief complaint</dt>
              <dd>{report.subjective.chiefComplaint || <span className="muted">—</span>}</dd>

              <dt>History of present illness</dt>
              <dd>{report.subjective.historyOfPresentIllness || <span className="muted">—</span>}</dd>

              {report.subjective.symptomDuration && (
                <>
                  <dt>Symptom duration</dt>
                  <dd>{report.subjective.symptomDuration}</dd>
                </>
              )}

              {report.subjective.associatedSymptoms.length > 0 && (
                <>
                  <dt>Associated symptoms</dt>
                  <dd>{report.subjective.associatedSymptoms.join(", ")}</dd>
                </>
              )}

              {report.subjective.relevantHistory.length > 0 && (
                <>
                  <dt>Relevant history</dt>
                  <dd>{report.subjective.relevantHistory.join(", ")}</dd>
                </>
              )}
            </dl>
          </section>

          {/* Objective */}
          <section className="soap-section">
            <h2>Objective</h2>
            {Object.keys(report.objective.vitalSigns ?? {}).length > 0 && (
              <div className="vitals-readout">
                {Object.entries(report.objective.vitalSigns).map(([k, v]) => (
                  <div key={k}>
                    <span>{humanizeVital(k)}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            )}
            {report.objective.physicalExam && (
              <dl>
                <dt>Physical exam</dt>
                <dd>{report.objective.physicalExam}</dd>
              </dl>
            )}
            {Object.keys(report.objective.vitalSigns ?? {}).length === 0 && !report.objective.physicalExam && (
              <p className="muted">Vitals and exam not captured.</p>
            )}
          </section>

          {/* Assessment */}
          <section className="soap-section">
            <h2>Assessment</h2>
            <dl>
              <dt>Primary diagnosis</dt>
              <dd><strong>{report.assessment.primaryDiagnosis || <span className="muted">—</span>}</strong></dd>

              {report.assessment.differentialDiagnoses.length > 0 && (
                <>
                  <dt>Differentials</dt>
                  <dd>{report.assessment.differentialDiagnoses.join(" · ")}</dd>
                </>
              )}

              {report.assessment.icd10Codes.length > 0 && (
                <>
                  <dt>ICD-10</dt>
                  <dd className="mono">{report.assessment.icd10Codes.join(", ")}</dd>
                </>
              )}
            </dl>
          </section>

          {/* Plan */}
          <section className="soap-section">
            <h2>Plan</h2>

            {report.plan.medications.length > 0 && (
              <>
                <h4>Medications</h4>
                <table className="med-table">
                  <thead>
                    <tr>
                      <th>Drug</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.plan.medications.map((m, i) => (
                      <tr key={i}>
                        <td><strong>{m.drugName || "—"}</strong></td>
                        <td>{m.dose || "—"}</td>
                        <td>{m.route || "PO"}</td>
                        <td>{m.frequency || "—"}</td>
                        <td>{m.duration || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {report.plan.investigations.length > 0 && (
              <>
                <h4>Investigations</h4>
                <ul>{report.plan.investigations.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}

            {report.plan.lifestyleAdvice.length > 0 && (
              <>
                <h4>Lifestyle advice</h4>
                <ul>{report.plan.lifestyleAdvice.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}

            {report.plan.followUp.needed && (
              <>
                <h4>Follow-up</h4>
                <p>
                  {report.plan.followUp.timeframe ?? "As advised"}
                  {report.plan.followUp.reason ? ` — ${report.plan.followUp.reason}` : ""}
                </p>
              </>
            )}

            {report.plan.redFlags.length > 0 && (
              <>
                <h4 className="red-flag-head">⚠ Seek urgent care if:</h4>
                <ul className="red-flag-list">
                  {report.plan.redFlags.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            )}
          </section>
        </article>
      )}

      {/* ============================ SIGNATURE ============================ */}
      <footer className="signature-block">
        <div className="sig-line">
          <span className="sig-label">Attending Doctor</span>
          <div className="sig-value">{doctor.name}</div>
          <div className="sig-meta">{doctor.qualification} · {doctor.mmcNumber}</div>
          {finalizedAt && (
            <div className="sig-date">Signed: {new Date(finalizedAt).toLocaleString()}</div>
          )}
        </div>
      </footer>

      {/* ============================ ACTIONS ============================ */}
      {finalized && finalizedAt && (
        <div className="published-seal">
          <span className="seal-dot" /> Published on {new Date(finalizedAt).toLocaleString()}
        </div>
      )}

      {!finalized && approved && (
        <div className="publish-bar">
          <button type="button" className="btn-primary" onClick={publish} disabled={busy}>
            {busy ? "Publishing…" : "Publish to patient →"}
          </button>
          {err && <span className="publish-error">{err}</span>}
        </div>
      )}
      </section>

      {/* Report actions live OUTSIDE the report card, under the document. */}
      <div className="report-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => console.info("[REPORT] Save clicked (no-op)")}
        >
          Save
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => console.info("[REPORT] Download clicked (no-op)")}
        >
          Download
        </button>
      </div>
    </>
  );
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

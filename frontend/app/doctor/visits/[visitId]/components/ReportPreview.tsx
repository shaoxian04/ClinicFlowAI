"use client";
import { useState, useEffect } from "react";
import { apiPost } from "@/lib/api";
import { getVisitIdentification, type VisitIdentification } from "@/lib/visit-identification";
import type { MedicalReport } from "@/lib/types/report";
import { cn } from "@/design/cn";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Separator } from "@/components/ui/Separator";
import type { Finding } from "./safety/types";
import { ApproveOverrideDialog } from "./safety/ApproveOverrideDialog";

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
  findings?: Finding[];
  onFindingsRefetch?: () => Promise<void>;
  onAcknowledgeFinding?: (id: string, reason?: string) => Promise<void>;
  onReEvaluate?: () => Promise<Finding[] | null>;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
  findings = [], onFindingsRefetch, onAcknowledgeFinding, onReEvaluate,
}: ReportPreviewProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideFindings, setOverrideFindings] = useState<Finding[]>([]);

  const [ident, setIdent] = useState<VisitIdentification | null>(null);
  const [identErr, setIdentErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVisitIdentification(visitId)
      .then((d) => { if (!cancelled) setIdent(d); })
      .catch((e) => { if (!cancelled) setIdentErr(e instanceof Error ? e.message : "Failed to load identification"); });
    return () => { cancelled = true; };
  }, [visitId]);

  const hasReport = report != null;

  const unackedCriticalCount = findings.filter(
    (f) => f.severity === "CRITICAL" && !f.acknowledgedAt,
  ).length;

  async function doFinalize() {
    await apiPost(`/visits/${visitId}/report/finalize`, {});
    onPublished();
  }

  function looksLikeCriticalConflict(msg: string) {
    const upper = msg.toUpperCase();
    return (
      upper.includes("HTTP 409") ||
      upper.includes("CONFLICT") ||
      upper.includes("UNACKNOWLEDGED") ||
      upper.includes("CRITICAL_FINDING") ||
      upper.includes("CRITICAL SAFETY") ||
      upper.includes("EVALUATOR") ||
      upper.includes("AGENT RETURNED HTTP 409")
    );
  }

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      // Re-run evaluator first — finalize on the agent re-validates the
      // report against fresh patient context, so a stale findings list
      // can mask a new CRITICAL. Surface it before the user even sees a
      // 409 from the publish call.
      if (onReEvaluate) {
        const fresh = await onReEvaluate();
        if (fresh) {
          const criticals = fresh.filter(
            (f) => f.severity === "CRITICAL" && !f.acknowledgedAt,
          );
          if (criticals.length > 0 && onAcknowledgeFinding) {
            setOverrideFindings(criticals);
            setOverrideOpen(true);
            return;
          }
        }
      }
      await doFinalize();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (looksLikeCriticalConflict(msg) && onAcknowledgeFinding) {
        // Agent rejected with a fresh critical finding we didn't have
        // locally yet. Refetch and open the override dialog so the
        // doctor can record a reason and retry without re-clicking.
        if (onFindingsRefetch) await onFindingsRefetch();
        const criticals = findings.filter(
          (f) => f.severity === "CRITICAL" && !f.acknowledgedAt,
        );
        if (criticals.length > 0) {
          setOverrideFindings(criticals);
          setOverrideOpen(true);
          setErr(null);
          return;
        }
        setErr("Publishing was blocked by the safety evaluator. Click Re-run safety checks in the safety panel and try again.");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const visitDate = new Date(createdAt);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Document card */}
      <Card variant="paper" className="p-6">
        {/* ============================ HEADER ============================ */}
        <div className="flex flex-col sm:flex-row sm:justify-between gap-4 mb-6">
          <div>
            {identErr ? (
              <p className="font-sans text-sm text-crimson">Failed to load clinic info: {identErr}</p>
            ) : ident ? (
              <>
                <p className="font-display text-lg text-fog">{ident.clinic.name}</p>
                <p className="font-sans text-xs text-fog-dim mt-0.5">
                  {ident.clinic.addressLine1}{ident.clinic.addressLine2 ? `, ${ident.clinic.addressLine2}` : ""}
                </p>
                <p className="font-mono text-xs text-fog-dim/60 mt-1 flex flex-wrap gap-2">
                  <span>Tel: {ident.clinic.phone}</span>
                  <span>·</span>
                  <span>{ident.clinic.email}</span>
                  <span>·</span>
                  <span>Reg. {ident.clinic.registrationNumber}</span>
                </p>
              </>
            ) : (
              <div className="animate-pulse space-y-1.5">
                <div className="h-4 w-48 rounded bg-white/10" />
                <div className="h-3 w-64 rounded bg-white/10" />
                <div className="h-3 w-56 rounded bg-white/10" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 sm:items-end flex-shrink-0">
            <div className="flex gap-2 items-baseline">
              <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">Visit ID</span>
              <code className="font-mono text-xs text-fog">{visitId.slice(0, 8)}…</code>
            </div>
            {ident?.visit.referenceNumber && (
              <div className="flex gap-2 items-baseline">
                <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">Ref</span>
                <code className="font-mono text-xs text-fog">{ident.visit.referenceNumber}</code>
              </div>
            )}
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
            {ident ? (
              <>
                <p className="font-display text-base text-fog">{ident.patient.fullName}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className={dtCls}>IC No.</dt>
                  <dd className={cn(ddCls, monoCls)}>{ident.patient.nationalId ?? "—"}</dd>
                  <dt className={dtCls}>DOB</dt>
                  <dd className={ddCls}>
                    {formatDate(ident.patient.dateOfBirth)}
                    {ident.patient.ageYears != null ? ` (${ident.patient.ageYears} y)` : ""}
                  </dd>
                  <dt className={dtCls}>Sex</dt>
                  <dd className={ddCls}>{ident.patient.gender ?? "—"}</dd>
                  <dt className={dtCls}>Phone</dt>
                  <dd className={ddCls}>{ident.patient.phone ?? "—"}</dd>
                </dl>
              </>
            ) : !identErr ? (
              <div className="animate-pulse space-y-1.5 mt-1">
                <div className="h-4 w-36 rounded bg-white/10" />
                <div className="h-3 w-48 rounded bg-white/10" />
                <div className="h-3 w-40 rounded bg-white/10" />
              </div>
            ) : (
              <p className="font-sans text-sm text-fog-dim/50">{patientName}</p>
            )}
          </div>
          <div>
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest mb-2">Attending Doctor</p>
            {ident ? (
              <>
                <p className="font-display text-base text-fog">{ident.doctor.fullName}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className={dtCls}>Specialty</dt>
                  <dd className={ddCls}>{ident.doctor.specialty}</dd>
                  <dt className={dtCls}>MMC No.</dt>
                  <dd className={cn(ddCls, monoCls)}>{ident.doctor.mmcNumber}</dd>
                </dl>
              </>
            ) : !identErr ? (
              <div className="animate-pulse space-y-1.5 mt-1">
                <div className="h-4 w-36 rounded bg-white/10" />
                <div className="h-3 w-48 rounded bg-white/10" />
                <div className="h-3 w-40 rounded bg-white/10" />
              </div>
            ) : (
              <p className="font-sans text-sm text-fog-dim/50">{doctorName}</p>
            )}
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
                <div className="rounded-xs border border-ink-rim bg-obsidian/40 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-3.5 h-3.5 text-amber flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    </svg>
                    <p className="font-sans font-medium text-sm text-fog uppercase tracking-wide">
                      Return precautions
                    </p>
                  </div>
                  <p className="font-sans text-xs text-fog-dim mb-2.5 italic">
                    Please return to clinic or seek medical attention if any of the following occur:
                  </p>
                  <ul className="flex flex-col gap-1.5 pl-1">
                    {(report.plan.redFlags ?? []).map((x, i) => (
                      <li key={i} className="flex gap-2 font-sans text-sm text-fog leading-relaxed">
                        <span className="text-amber flex-shrink-0 select-none" aria-hidden="true">•</span>
                        <span>{x}</span>
                      </li>
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
          {ident ? (
            <>
              <p className="font-display text-base text-fog">{ident.doctor.fullName}</p>
              <p className="font-mono text-xs text-fog-dim/60">{ident.doctor.specialty} · {ident.doctor.mmcNumber}</p>
            </>
          ) : (
            <p className="font-display text-base text-fog">{doctorName}</p>
          )}
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

      {/* ============================ ACTIONS ============================ */}
      <div className="flex items-center gap-3 flex-wrap">
        {!finalized && approved && (
          <Button
            type="button"
            variant="primary"
            onClick={publish}
            disabled={busy}
            title={
              unackedCriticalCount > 0
                ? `${unackedCriticalCount} critical safety finding${unackedCriticalCount > 1 ? "s" : ""} — you'll be asked for an override reason before publishing.`
                : "Re-running safety checks before publishing."
            }
          >
            {busy
              ? "Publishing…"
              : unackedCriticalCount > 0
                ? "Publish with override…"
                : "Publish to patient"}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => {}}
        >
          Download PDF
        </Button>
        {err && <span className="font-sans text-sm text-crimson">{err}</span>}
      </div>

      {!finalized && approved && onAcknowledgeFinding && (
        <ApproveOverrideDialog
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          unackedCritical={overrideFindings.length > 0
            ? overrideFindings
            : findings.filter((f) => f.severity === "CRITICAL" && !f.acknowledgedAt)}
          onAcknowledge={onAcknowledgeFinding}
          onProceed={async () => { await doFinalize(); }}
        />
      )}
    </div>
  );
}

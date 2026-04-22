// frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx
"use client";
import type { MedicalReport, MedicationOrder } from "@/lib/types/report";

export interface ReportPanelProps {
  report: MedicalReport | null;
  approved: boolean;
  onApprove: () => void | Promise<void>;
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
  locked: boolean;
}

export function ReportPanel({ report, approved, onApprove, onPatch, patching, locked }: ReportPanelProps) {
  if (report == null) {
    return (
      <section className="report-panel empty">
        <div className="card-head"><h2>Report</h2></div>
        <p className="muted">Report will appear here once generated.</p>
      </section>
    );
  }

  const approveDisabled = locked || approved || report == null;

  function field(path: string) {
    return patching.has(path) ? "saving" : "";
  }

  return (
    <section className="report-panel">
      <div className="card-head">
        <h2>Report <span className="badge">AI draft</span></h2>
        <button
          type="button"
          className="btn-primary"
          onClick={() => { console.info("[REVIEW] approve click"); onApprove(); }}
          disabled={approveDisabled}
        >
          {approved ? "Approved ✓" : "Approve & continue →"}
        </button>
      </div>

      <fieldset disabled={locked}>
        <label>Subjective — chief complaint</label>
        <textarea
          defaultValue={report.subjective.chiefComplaint}
          onBlur={(e) => onPatch("subjective.chiefComplaint", e.target.value)}
          className={field("subjective.chiefComplaint")}
        />
        <label>Subjective — history of present illness</label>
        <textarea
          defaultValue={report.subjective.historyOfPresentIllness}
          onBlur={(e) => onPatch("subjective.historyOfPresentIllness", e.target.value)}
          className={field("subjective.historyOfPresentIllness")}
        />

        <label>Objective — physical exam</label>
        <textarea
          defaultValue={report.objective.physicalExam ?? ""}
          onBlur={(e) => onPatch("objective.physicalExam", e.target.value)}
          className={field("objective.physicalExam")}
        />

        <label>Assessment — primary diagnosis</label>
        <input
          type="text"
          defaultValue={report.assessment.primaryDiagnosis}
          onBlur={(e) => onPatch("assessment.primaryDiagnosis", e.target.value)}
          className={field("assessment.primaryDiagnosis")}
        />

        <h3>Plan — medications</h3>
        {[0, 1, 2].map((i) => (
          <MedRow
            key={i}
            med={report.plan.medications[i]}
            index={i}
            onPatch={onPatch}
            patching={patching}
          />
        ))}

        <h3>Plan — follow-up</h3>
        <label>
          <input
            type="checkbox"
            defaultChecked={report.plan.followUp.needed}
            onBlur={(e) => onPatch("plan.followUp.needed", e.target.checked)}
          />
          Follow-up needed
        </label>
        <label>Timeframe</label>
        <input
          type="text"
          defaultValue={report.plan.followUp.timeframe ?? ""}
          onBlur={(e) => onPatch("plan.followUp.timeframe", e.target.value)}
        />
      </fieldset>
    </section>
  );
}

interface MedRowProps {
  med: MedicationOrder | undefined;
  index: number;
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
}
function MedRow({ med, index, onPatch, patching }: MedRowProps) {
  const p = (f: string) => `plan.medications[${index}].${f}`;
  const cls = (f: string) => patching.has(p(f)) ? "saving" : "";
  return (
    <div className="med-row">
      <input type="text" placeholder="Drug name"
        defaultValue={med?.drugName ?? ""}
        onBlur={(e) => onPatch(p("drugName"), e.target.value)}
        className={cls("drugName")} />
      <input type="text" placeholder="Dose"
        defaultValue={med?.dose ?? ""}
        onBlur={(e) => onPatch(p("dose"), e.target.value)}
        className={cls("dose")} />
      <input type="text" placeholder="Frequency"
        defaultValue={med?.frequency ?? ""}
        onBlur={(e) => onPatch(p("frequency"), e.target.value)}
        className={cls("frequency")} />
      <input type="text" placeholder="Duration"
        defaultValue={med?.duration ?? ""}
        onBlur={(e) => onPatch(p("duration"), e.target.value)}
        className={cls("duration")} />
    </div>
  );
}

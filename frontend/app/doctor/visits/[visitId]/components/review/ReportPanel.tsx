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

const VITAL_FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "blood_pressure", label: "BP", placeholder: "120/80 mmHg" },
  { key: "heart_rate", label: "HR", placeholder: "80 bpm" },
  { key: "temperature", label: "Temp", placeholder: "37.0 °C" },
  { key: "respiratory_rate", label: "RR", placeholder: "16/min" },
  { key: "spo2", label: "SpO₂", placeholder: "98 %" },
  { key: "weight", label: "Weight", placeholder: "70 kg" },
];

export function ReportPanel({ report, approved, onApprove, onPatch, patching, locked }: ReportPanelProps) {
  if (report == null) {
    return (
      <section className="report-panel empty">
        <div className="card-head"><h2>Report</h2></div>
        <p className="muted">Report will appear here once generated.</p>
      </section>
    );
  }

  const approveDisabled = locked || approved;

  const fieldCls = (path: string) => (patching.has(path) ? "saving" : "");

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
        {/* ======================== SUBJECTIVE ======================== */}
        <h3>Subjective</h3>

        <label>Chief complaint</label>
        <textarea
          defaultValue={report.subjective.chiefComplaint}
          onBlur={(e) => onPatch("subjective.chiefComplaint", e.target.value)}
          className={fieldCls("subjective.chiefComplaint")}
        />

        <label>History of present illness</label>
        <textarea
          defaultValue={report.subjective.historyOfPresentIllness}
          onBlur={(e) => onPatch("subjective.historyOfPresentIllness", e.target.value)}
          className={fieldCls("subjective.historyOfPresentIllness")}
        />

        <label>Symptom duration</label>
        <input
          type="text"
          placeholder="e.g. 3 days"
          defaultValue={report.subjective.symptomDuration ?? ""}
          onBlur={(e) => onPatch("subjective.symptomDuration", e.target.value)}
          className={fieldCls("subjective.symptomDuration")}
        />

        <label>Associated symptoms</label>
        <ChipListEditor
          path="subjective.associatedSymptoms"
          items={report.subjective.associatedSymptoms}
          onPatch={onPatch}
          patching={patching}
          placeholder="Add symptom, press Enter"
        />

        <label>Relevant history</label>
        <ChipListEditor
          path="subjective.relevantHistory"
          items={report.subjective.relevantHistory}
          onPatch={onPatch}
          patching={patching}
          placeholder="Add history item, press Enter"
        />

        {/* ======================== OBJECTIVE ======================== */}
        <h3>Objective</h3>

        <label>Vital signs</label>
        <div className="vitals-grid">
          {VITAL_FIELDS.map(({ key, label, placeholder }) => {
            const path = `objective.vitalSigns.${key}`;
            return (
              <div key={key} className="vital-cell">
                <span>{label}</span>
                <input
                  type="text"
                  placeholder={placeholder}
                  defaultValue={report.objective.vitalSigns?.[key] ?? ""}
                  onBlur={(e) => onPatch(path, e.target.value)}
                  className={fieldCls(path)}
                />
              </div>
            );
          })}
        </div>

        <label>Physical exam</label>
        <textarea
          defaultValue={report.objective.physicalExam ?? ""}
          onBlur={(e) => onPatch("objective.physicalExam", e.target.value)}
          className={fieldCls("objective.physicalExam")}
        />

        {/* ======================== ASSESSMENT ======================== */}
        <h3>Assessment</h3>

        <label>Primary diagnosis</label>
        <input
          type="text"
          defaultValue={report.assessment.primaryDiagnosis}
          onBlur={(e) => onPatch("assessment.primaryDiagnosis", e.target.value)}
          className={fieldCls("assessment.primaryDiagnosis")}
        />

        <label>Differential diagnoses</label>
        <ChipListEditor
          path="assessment.differentialDiagnoses"
          items={report.assessment.differentialDiagnoses}
          onPatch={onPatch}
          patching={patching}
          placeholder="Add differential, press Enter"
        />

        <label>ICD-10 codes</label>
        <ChipListEditor
          path="assessment.icd10Codes"
          items={report.assessment.icd10Codes}
          onPatch={onPatch}
          patching={patching}
          placeholder="e.g. J06.9"
        />

        {/* ======================== PLAN ======================== */}
        <h3>Plan — medications</h3>

        <MedList
          meds={report.plan.medications}
          onPatch={onPatch}
          patching={patching}
        />

        <h3>Plan — investigations</h3>
        <ChipListEditor
          path="plan.investigations"
          items={report.plan.investigations}
          onPatch={onPatch}
          patching={patching}
          placeholder="e.g. CBC, Chest X-ray"
        />

        <h3>Plan — lifestyle advice</h3>
        <ChipListEditor
          path="plan.lifestyleAdvice"
          items={report.plan.lifestyleAdvice}
          onPatch={onPatch}
          patching={patching}
          placeholder="e.g. Increase fluid intake"
        />

        <h3>Plan — follow-up</h3>
        <label className="inline-check">
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
          placeholder="e.g. in 3 days"
          defaultValue={report.plan.followUp.timeframe ?? ""}
          onBlur={(e) => onPatch("plan.followUp.timeframe", e.target.value)}
          className={fieldCls("plan.followUp.timeframe")}
        />
        <label>Reason</label>
        <input
          type="text"
          placeholder="e.g. Review response to antibiotics"
          defaultValue={report.plan.followUp.reason ?? ""}
          onBlur={(e) => onPatch("plan.followUp.reason", e.target.value)}
          className={fieldCls("plan.followUp.reason")}
        />

        <h3>Plan — red flags</h3>
        <ChipListEditor
          path="plan.redFlags"
          items={report.plan.redFlags}
          onPatch={onPatch}
          patching={patching}
          placeholder="e.g. Worsening shortness of breath"
        />
      </fieldset>
    </section>
  );
}

/* =============================================================
   MedList — dynamic add/remove medication rows
   ============================================================= */
interface MedListProps {
  meds: MedicationOrder[];
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
}
function MedList({ meds, onPatch, patching }: MedListProps) {
  function addMed() {
    const next = [
      ...meds,
      { drugName: "", dose: "", frequency: "", duration: "", route: null },
    ];
    onPatch("plan.medications", next);
  }
  function removeMed(i: number) {
    const next = meds.filter((_, idx) => idx !== i);
    onPatch("plan.medications", next);
  }
  return (
    <div className="med-list">
      <div className="med-row head">
        <span>Drug</span><span>Dose</span><span>Frequency</span><span>Duration</span><span>Route</span><span aria-hidden="true" />
      </div>
      {meds.length === 0 && (
        <p className="muted inline-empty">No medications prescribed.</p>
      )}
      {meds.map((med, i) => (
        <MedRow
          key={i}
          med={med}
          index={i}
          onPatch={onPatch}
          patching={patching}
          onRemove={() => removeMed(i)}
        />
      ))}
      <button type="button" className="btn-ghost add-row" onClick={addMed}>
        + Add medication
      </button>
    </div>
  );
}

interface MedRowProps {
  med: MedicationOrder;
  index: number;
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
  onRemove: () => void;
}
function MedRow({ med, index, onPatch, patching, onRemove }: MedRowProps) {
  const p = (f: string) => `plan.medications[${index}].${f}`;
  const cls = (f: string) => (patching.has(p(f)) ? "saving" : "");
  return (
    <div className="med-row">
      <input type="text" placeholder="Drug name"
        defaultValue={med.drugName}
        onBlur={(e) => onPatch(p("drugName"), e.target.value)}
        className={cls("drugName")} />
      <input type="text" placeholder="500 mg"
        defaultValue={med.dose}
        onBlur={(e) => onPatch(p("dose"), e.target.value)}
        className={cls("dose")} />
      <input type="text" placeholder="TDS"
        defaultValue={med.frequency}
        onBlur={(e) => onPatch(p("frequency"), e.target.value)}
        className={cls("frequency")} />
      <input type="text" placeholder="7 days"
        defaultValue={med.duration}
        onBlur={(e) => onPatch(p("duration"), e.target.value)}
        className={cls("duration")} />
      <input type="text" placeholder="PO"
        defaultValue={med.route ?? ""}
        onBlur={(e) => onPatch(p("route"), e.target.value)}
        className={cls("route")} />
      <button type="button" className="btn-remove" onClick={onRemove} aria-label="Remove medication">×</button>
    </div>
  );
}

/* =============================================================
   ChipListEditor — editable string[] as chips
   Commits on Enter or on blur of the type-ahead input.
   ============================================================= */
interface ChipListEditorProps {
  path: string;
  items: string[];
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
  placeholder: string;
}
function ChipListEditor({ path, items, onPatch, patching, placeholder }: ChipListEditorProps) {
  const saving = patching.has(path);
  function add(raw: string) {
    const v = raw.trim();
    if (!v) return;
    onPatch(path, [...items, v]);
  }
  function remove(i: number) {
    onPatch(path, items.filter((_, idx) => idx !== i));
  }
  return (
    <div className={`chip-list ${saving ? "saving" : ""}`}>
      {items.map((t, i) => (
        <span key={i} className="chip">
          {t}
          <button type="button" onClick={() => remove(i)} aria-label={`Remove ${t}`}>×</button>
        </span>
      ))}
      <input
        type="text"
        className="chip-input"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
        onBlur={(e) => {
          if (e.target.value.trim()) {
            add(e.target.value);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

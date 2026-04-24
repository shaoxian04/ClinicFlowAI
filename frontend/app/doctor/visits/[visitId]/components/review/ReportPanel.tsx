// frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx
"use client";
import type { MedicalReport, MedicationOrder } from "@/lib/types/report";
import { cn } from "@/design/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Separator } from "@/components/ui/Separator";

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

const inputCls = "w-full rounded-xs border border-hairline bg-slate/80 text-paper/90 placeholder:text-paper/30 px-2.5 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-oxblood/40 disabled:opacity-50";
const textareaCls = "w-full rounded-xs border border-hairline bg-slate/80 text-paper/90 placeholder:text-paper/30 px-2.5 py-1.5 text-sm font-sans focus:outline-none focus:ring-1 focus:ring-oxblood/40 resize-y disabled:opacity-50 min-h-[72px]";
const labelCls = "block font-mono text-[10px] text-paper/40 uppercase tracking-widest mb-1";
const fieldWrapCls = "mb-3";

export function ReportPanel({ report, approved, onApprove, onPatch, patching, locked }: ReportPanelProps) {
  if (report == null) {
    return (
      <section className="bg-slate rounded-sm border border-slate/80 p-5 flex flex-col gap-2">
        <div className="flex items-center justify-between mb-2">
          <span className="font-sans font-medium text-sm text-paper/70 uppercase tracking-wider">Report</span>
        </div>
        <p className="font-sans text-sm text-paper/40">Report will appear here once generated.</p>
      </section>
    );
  }

  const approveDisabled = locked || approved;

  const fieldCls = (path: string) => patching.has(path) ? "opacity-60" : "";

  return (
    <section className="bg-slate rounded-sm border border-slate/80 p-5 overflow-y-auto">
      <h2 className="sr-only">Report</h2>
      {/* Header row with AI DRAFT badge and Approve button */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {!approved && !locked && (
            <Badge variant="draft">AI DRAFT</Badge>
          )}
          {(approved || locked) && (
            <Badge variant="published">Signed</Badge>
          )}
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onApprove}
          disabled={approveDisabled}
        >
          {approved ? "Approved ✓" : "Approve & continue"}
        </Button>
      </div>

      <div className={cn(
        !approved && !locked
          ? "border-l-2 border-l-oxblood pl-4"
          : "pl-0"
      )}>
        <fieldset disabled={locked} className="border-none p-0 m-0">
          {/* ======================== SUBJECTIVE ======================== */}
          <SectionHeader number="01" title="Subjective" className="mb-3 text-paper/70 [&>span:first-child]:text-paper/30 [&>span:nth-child(2)]:text-paper/20 [&>span:last-child]:text-paper/60" />

          <div className={cn(fieldWrapCls, fieldCls("subjective.chiefComplaint"))}>
            <label className={labelCls}>Chief complaint</label>
            <textarea
              className={textareaCls}
              defaultValue={report.subjective.chiefComplaint}
              onBlur={(e) => onPatch("subjective.chiefComplaint", e.target.value)}
            />
          </div>

          <div className={cn(fieldWrapCls, fieldCls("subjective.historyOfPresentIllness"))}>
            <label className={labelCls}>History of present illness</label>
            <textarea
              className={textareaCls}
              defaultValue={report.subjective.historyOfPresentIllness}
              onBlur={(e) => onPatch("subjective.historyOfPresentIllness", e.target.value)}
            />
          </div>

          <div className={cn(fieldWrapCls, fieldCls("subjective.symptomDuration"))}>
            <label className={labelCls}>Symptom duration</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. 3 days"
              defaultValue={report.subjective.symptomDuration ?? ""}
              onBlur={(e) => onPatch("subjective.symptomDuration", e.target.value)}
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={labelCls}>Associated symptoms</label>
            <ChipListEditor
              path="subjective.associatedSymptoms"
              items={report.subjective.associatedSymptoms}
              onPatch={onPatch}
              patching={patching}
              placeholder="Add symptom, press Enter"
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={labelCls}>Relevant history</label>
            <ChipListEditor
              path="subjective.relevantHistory"
              items={report.subjective.relevantHistory}
              onPatch={onPatch}
              patching={patching}
              placeholder="Add history item, press Enter"
            />
          </div>

          <Separator className="my-4 border-paper/10" />

          {/* ======================== OBJECTIVE ======================== */}
          <SectionHeader number="02" title="Objective" className="mb-3 text-paper/70 [&>span:first-child]:text-paper/30 [&>span:nth-child(2)]:text-paper/20 [&>span:last-child]:text-paper/60" />

          <div className={fieldWrapCls}>
            <label className={labelCls}>Vital signs</label>
            <div className="grid grid-cols-3 gap-2">
              {VITAL_FIELDS.map(({ key, label, placeholder }) => {
                const path = `objective.vitalSigns.${key}`;
                return (
                  <div key={key} className={cn("flex flex-col gap-0.5", fieldCls(path))}>
                    <span className="font-mono text-[10px] text-paper/40">{label}</span>
                    <input
                      type="text"
                      className={inputCls}
                      placeholder={placeholder}
                      defaultValue={report.objective.vitalSigns?.[key] ?? ""}
                      onBlur={(e) => onPatch(path, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className={cn(fieldWrapCls, fieldCls("objective.physicalExam"))}>
            <label className={labelCls}>Physical exam</label>
            <textarea
              className={textareaCls}
              defaultValue={report.objective.physicalExam ?? ""}
              onBlur={(e) => onPatch("objective.physicalExam", e.target.value)}
            />
          </div>

          <Separator className="my-4 border-paper/10" />

          {/* ======================== ASSESSMENT ======================== */}
          <SectionHeader number="03" title="Assessment" className="mb-3 text-paper/70 [&>span:first-child]:text-paper/30 [&>span:nth-child(2)]:text-paper/20 [&>span:last-child]:text-paper/60" />

          <div className={cn(fieldWrapCls, fieldCls("assessment.primaryDiagnosis"))}>
            <label className={labelCls}>Primary diagnosis</label>
            <input
              type="text"
              className={inputCls}
              defaultValue={report.assessment.primaryDiagnosis}
              onBlur={(e) => onPatch("assessment.primaryDiagnosis", e.target.value)}
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={labelCls}>Differential diagnoses</label>
            <ChipListEditor
              path="assessment.differentialDiagnoses"
              items={report.assessment.differentialDiagnoses}
              onPatch={onPatch}
              patching={patching}
              placeholder="Add differential, press Enter"
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={labelCls}>ICD-10 codes</label>
            <ChipListEditor
              path="assessment.icd10Codes"
              items={report.assessment.icd10Codes}
              onPatch={onPatch}
              patching={patching}
              placeholder="e.g. J06.9"
            />
          </div>

          <Separator className="my-4 border-paper/10" />

          {/* ======================== PLAN ======================== */}
          <SectionHeader number="04" title="Plan" className="mb-3 text-paper/70 [&>span:first-child]:text-paper/30 [&>span:nth-child(2)]:text-paper/20 [&>span:last-child]:text-paper/60" />

          <div className={fieldWrapCls}>
            <label className={labelCls}>Medications</label>
            <MedList
              meds={report.plan.medications}
              onPatch={onPatch}
              patching={patching}
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={labelCls}>Investigations</label>
            <ChipListEditor
              path="plan.investigations"
              items={report.plan.investigations}
              onPatch={onPatch}
              patching={patching}
              placeholder="e.g. CBC, Chest X-ray"
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={labelCls}>Lifestyle advice</label>
            <ChipListEditor
              path="plan.lifestyleAdvice"
              items={report.plan.lifestyleAdvice}
              onPatch={onPatch}
              patching={patching}
              placeholder="e.g. Increase fluid intake"
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={cn(labelCls, "inline-flex items-center gap-2 cursor-pointer")}>
              <input
                type="checkbox"
                defaultChecked={report.plan.followUp.needed}
                onBlur={(e) => onPatch("plan.followUp.needed", e.target.checked)}
                className="rounded-xs border border-paper/30 bg-slate/80 checked:bg-oxblood"
              />
              <span>Follow-up needed</span>
            </label>
          </div>

          <div className={cn(fieldWrapCls, fieldCls("plan.followUp.timeframe"))}>
            <label className={labelCls}>Follow-up timeframe</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. in 3 days"
              defaultValue={report.plan.followUp.timeframe ?? ""}
              onBlur={(e) => onPatch("plan.followUp.timeframe", e.target.value)}
            />
          </div>

          <div className={cn(fieldWrapCls, fieldCls("plan.followUp.reason"))}>
            <label className={labelCls}>Follow-up reason</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Review response to antibiotics"
              defaultValue={report.plan.followUp.reason ?? ""}
              onBlur={(e) => onPatch("plan.followUp.reason", e.target.value)}
            />
          </div>

          <div className={fieldWrapCls}>
            <label className={labelCls}>Red flags</label>
            <ChipListEditor
              path="plan.redFlags"
              items={report.plan.redFlags}
              onPatch={onPatch}
              patching={patching}
              placeholder="e.g. Worsening shortness of breath"
            />
          </div>
        </fieldset>
      </div>
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
function MedList({ meds: rawMeds, onPatch, patching }: MedListProps) {
  const meds = rawMeds ?? [];
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
    <div className="flex flex-col gap-2">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_80px_80px_80px_60px_28px] gap-1.5">
        {["Drug", "Dose", "Freq", "Duration", "Route", ""].map((h, i) => (
          <span key={i} className="font-mono text-[9px] text-paper/30 uppercase tracking-widest">{h}</span>
        ))}
      </div>
      {meds.length === 0 && (
        <p className="font-sans text-xs text-paper/40">No medications prescribed.</p>
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
      <button
        type="button"
        className="font-sans text-xs text-paper/50 hover:text-paper/80 transition-colors duration-150 text-left mt-1"
        onClick={addMed}
      >
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
const medInputCls = "w-full rounded-xs border border-paper/10 bg-slate/60 text-paper/90 placeholder:text-paper/20 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-oxblood/40 disabled:opacity-50";
function MedRow({ med, index, onPatch, patching, onRemove }: MedRowProps) {
  const p = (f: string) => `plan.medications[${index}].${f}`;
  const cls = (f: string) => cn(medInputCls, patching.has(p(f)) ? "opacity-60" : "");
  return (
    <div className="grid grid-cols-[1fr_80px_80px_80px_60px_28px] gap-1.5 items-center">
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
      <button
        type="button"
        className="text-paper/30 hover:text-crimson transition-colors duration-150 font-mono text-sm flex-shrink-0 flex items-center justify-center h-7 w-7"
        onClick={onRemove}
        aria-label="Remove medication"
      >
        ×
      </button>
    </div>
  );
}

/* =============================================================
   ChipListEditor — editable string[] as chips
   ============================================================= */
interface ChipListEditorProps {
  path: string;
  items: string[];
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
  placeholder: string;
}
function ChipListEditor({ path, items: rawItems, onPatch, patching, placeholder }: ChipListEditorProps) {
  const items = rawItems ?? [];
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
    <div className={cn("flex flex-wrap gap-1.5", saving && "opacity-60")}>
      {items.map((t, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-xs border border-paper/20 bg-paper/10 px-2 py-0.5 font-sans text-xs text-paper/80"
        >
          {t}
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove ${t}`}
            className="text-paper/40 hover:text-crimson transition-colors duration-150 text-sm leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        className="rounded-xs border border-paper/10 bg-slate/60 text-paper/90 placeholder:text-paper/20 px-2 py-0.5 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-oxblood/40 min-w-[120px] flex-1"
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

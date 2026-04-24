"use client";

import type { PreVisitFields } from "@/lib/types/preVisit";
import { isPreVisitFieldsEmpty } from "@/lib/types/preVisit";
import { Card, CardHeader } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Separator } from "@/components/ui/Separator";

export interface PreVisitSummaryProps {
  fields: PreVisitFields | null | undefined;
  done: boolean;
  capturedAt?: string | null;
}

export function PreVisitSummary({ fields, done, capturedAt }: PreVisitSummaryProps) {
  const empty = isPreVisitFieldsEmpty(fields);

  if (empty && !done) {
    return (
      <Card variant="paper" className="p-5">
        <SectionHeader number="01" title="Pre-visit intake" className="mb-4" />
        <p className="font-sans text-sm text-ink-soft">
          Pre-visit intake in progress. Summary will appear when captured.
        </p>
      </Card>
    );
  }

  if (empty && done) {
    return (
      <Card variant="paper" className="p-5">
        <SectionHeader number="01" title="Pre-visit intake" className="mb-4" />
        <p className="font-sans text-sm text-ink-soft">No pre-visit intake completed.</p>
      </Card>
    );
  }

  const f = fields!;
  return (
    <Card variant="paper" className="p-5">
      <SectionHeader number="01" title="Pre-visit intake" className="mb-4" />

      {f.chiefComplaint && (
        <div className="mb-3">
          <div className="font-mono text-[10px] text-ink-soft/60 uppercase tracking-widest mb-1">
            Chief complaint
          </div>
          <div className="font-sans text-sm text-ink">{f.chiefComplaint}</div>
        </div>
      )}

      {(f.symptomDuration || f.painSeverity != null) && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {f.symptomDuration && (
            <div>
              <div className="font-mono text-[10px] text-ink-soft/60 uppercase tracking-widest mb-1">Duration</div>
              <div className="font-sans text-sm text-ink">{f.symptomDuration}</div>
            </div>
          )}
          {f.painSeverity != null && (
            <div>
              <div className="font-mono text-[10px] text-ink-soft/60 uppercase tracking-widest mb-1">Pain severity</div>
              <div className="font-sans text-sm text-ink font-mono">{f.painSeverity} / 10</div>
            </div>
          )}
        </div>
      )}

      {((f.knownAllergies?.length ?? 0) > 0 ||
        (f.currentMedications?.length ?? 0) > 0 ||
        (f.relevantHistory?.length ?? 0) > 0) && (
        <div className="font-mono text-[10px] text-ink-soft/50 uppercase tracking-widest my-3 border-t border-hairline pt-3">
          Confirmed with patient
        </div>
      )}

      {(f.knownAllergies?.length ?? 0) > 0 && (
        <ChipSection label="Known allergies" items={f.knownAllergies ?? []} />
      )}
      {(f.currentMedications?.length ?? 0) > 0 && (
        <ChipSection label="Current medications" items={f.currentMedications ?? []} />
      )}
      {(f.relevantHistory?.length ?? 0) > 0 && (
        <ChipSection label="Relevant history" items={f.relevantHistory ?? []} />
      )}

      {capturedAt && (
        <div className="mt-4 pt-3 border-t border-hairline">
          <span className="font-mono text-xs text-ink-soft/50">
            Intake captured {new Date(capturedAt).toLocaleString()}
          </span>
        </div>
      )}
    </Card>
  );
}

function ChipSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-3">
      <div className="font-mono text-[10px] text-ink-soft/60 uppercase tracking-widest mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((x, i) => (
          <span
            key={i}
            className="inline-flex items-center rounded-xs bg-bone border border-hairline px-2 py-0.5 font-sans text-xs text-ink"
          >
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

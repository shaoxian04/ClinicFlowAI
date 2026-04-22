// frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.tsx
"use client";

import type { PreVisitFields } from "@/lib/types/preVisit";
import { isPreVisitFieldsEmpty } from "@/lib/types/preVisit";
import styles from "./PreVisitSummary.module.css";

export interface PreVisitSummaryProps {
  fields: PreVisitFields | null | undefined;
  done: boolean;
  capturedAt?: string | null;  // ISO timestamp of the last intake turn
}

export function PreVisitSummary({ fields, done, capturedAt }: PreVisitSummaryProps) {
  const empty = isPreVisitFieldsEmpty(fields);

  if (empty && !done) {
    return (
      <section className={styles.card}>
        <header className={styles.head}>
          <h2>Pre-visit intake</h2>
          <span className={styles.idx}>01 / INTAKE</span>
        </header>
        <p className={styles.muted}>
          Pre-visit intake in progress. Summary will appear when captured.
        </p>
      </section>
    );
  }

  if (empty && done) {
    return (
      <section className={styles.card}>
        <header className={styles.head}>
          <h2>Pre-visit intake</h2>
          <span className={styles.idx}>01 / INTAKE</span>
        </header>
        <p className={styles.muted}>No pre-visit intake completed.</p>
      </section>
    );
  }

  // Non-null assertion safe: isPreVisitFieldsEmpty returned false.
  const f = fields!;
  return (
    <section className={styles.card}>
      <header className={styles.head}>
        <h2>Pre-visit intake</h2>
        <span className={styles.idx}>01 / INTAKE</span>
      </header>

      {f.chiefComplaint && (
        <div className={styles.section}>
          <div className={styles.label}>Chief complaint</div>
          <div className={styles.value}>{f.chiefComplaint}</div>
        </div>
      )}

      {(f.symptomDuration || f.painSeverity != null) && (
        <div className={styles.grid2}>
          {f.symptomDuration && (
            <div>
              <div className={styles.label}>Duration</div>
              <div className={styles.value}>{f.symptomDuration}</div>
            </div>
          )}
          {f.painSeverity != null && (
            <div>
              <div className={styles.label}>Pain severity</div>
              <div className={styles.value}>{f.painSeverity} / 10</div>
            </div>
          )}
        </div>
      )}

      {((f.knownAllergies?.length ?? 0) > 0 ||
        (f.currentMedications?.length ?? 0) > 0 ||
        (f.relevantHistory?.length ?? 0) > 0) && (
        <div className={styles.divider}>Confirmed with patient</div>
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
        <footer className={styles.foot}>
          Intake captured {new Date(capturedAt).toLocaleString()}
        </footer>
      )}
    </section>
  );
}

function ChipSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className={styles.section}>
      <div className={styles.label}>{label}</div>
      <div className={styles.chips}>
        {items.map((x, i) => (
          <span key={i} className={styles.chip}>{x}</span>
        ))}
      </div>
    </div>
  );
}

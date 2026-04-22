// frontend/lib/types/preVisit.ts
// Mirror of agent/app/schemas/pre_visit.py::PreVisitSlots.
// Backend snake_case → frontend camelCase via @JsonAlias on the DTO boundary.
// See spec §2 — single source of truth.

export interface PreVisitFields {
  chiefComplaint: string | null;
  symptomDuration: string | null;
  painSeverity: number | null;   // 0-10
  knownAllergies: string[];
  currentMedications: string[];
  relevantHistory: string[];
}

export function isPreVisitFieldsEmpty(f: PreVisitFields | null | undefined): boolean {
  if (!f) return true;
  return (
    !f.chiefComplaint &&
    !f.symptomDuration &&
    f.painSeverity == null &&
    f.knownAllergies.length === 0 &&
    f.currentMedications.length === 0 &&
    f.relevantHistory.length === 0
  );
}

import { apiGet, apiPatchVoid } from "./api";

export type AllergyItem    = { name: string; severity?: string };
export type ConditionItem  = { name: string };
export type MedicationItem = { name: string; dose?: string; frequency?: string };

export type ClinicalProfile = {
    patientId: string;
    completenessState: "INCOMPLETE" | "BASIC" | "COMPLETE" | string;
    drugAllergies:           AllergyItem[];
    drugAllergiesUpdatedAt:  string | null;
    drugAllergiesSource:     string | null;
    chronicConditions:           ConditionItem[];
    chronicConditionsUpdatedAt:  string | null;
    chronicConditionsSource:     string | null;
    regularMedications:           MedicationItem[];
    regularMedicationsUpdatedAt:  string | null;
    regularMedicationsSource:     string | null;
};

export type ClinicalProfilePatch = Partial<{
    drugAllergies:      AllergyItem[];
    chronicConditions:  ConditionItem[];
    regularMedications: MedicationItem[];
}>;

export async function getMyClinicalProfile(patientId: string): Promise<ClinicalProfile> {
    return apiGet<ClinicalProfile>(`/patients/${patientId}/clinical-profile`);
}

export async function updateMyClinicalProfile(
    patientId: string,
    patch: ClinicalProfilePatch,
): Promise<void> {
    return apiPatchVoid(`/patients/${patientId}/clinical-profile`, patch);
}

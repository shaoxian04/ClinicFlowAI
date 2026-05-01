import { apiGet } from "./api";

export type PatientMe = {
    patientId: string;
    fullName: string;
    phone: string | null;
    preferredLanguage: string | null;
    whatsappConsent: boolean;
    whatsappConsentAt: string | null;
    whatsappConsentVersion: string | null;
};

export async function getMyProfile(): Promise<PatientMe> {
    return apiGet<PatientMe>("/patients/me");
}

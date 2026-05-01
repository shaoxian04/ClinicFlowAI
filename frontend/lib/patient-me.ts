import { apiGet } from "./api";
import type { Appointment } from "./appointments";

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

// ---------------------------------------------------------------------------
// Patient dashboard
// ---------------------------------------------------------------------------

export type PatientDashboardStats = {
    pastConsultations: number;
    activeMedications: number;
    allergies: number;
    lastVisitDate: string | null;
};
export type TimelinePoint = { date: string; kind: "FINALIZED" | "UPCOMING"; summary: string };
export type PatientDashboard = {
    nextAppointment: Appointment | null;
    stats: PatientDashboardStats;
    timeline: TimelinePoint[];
};

export async function getPatientDashboard(): Promise<PatientDashboard> {
    return apiGet<PatientDashboard>("/patients/me/dashboard");
}

import { apiGet } from "./api";

export type ClinicInfo = {
    name: string;
    addressLine1: string;
    addressLine2: string;
    phone: string;
    email: string;
    registrationNumber: string;
};

export type PatientInfo = {
    fullName: string;
    nationalId: string | null;
    dateOfBirth: string | null;
    ageYears: number;
    gender: string | null;
    phone: string | null;
};

export type DoctorInfo = {
    fullName: string;
    mmcNumber: string;
    specialty: string;
};

export type VisitInfo = {
    visitId: string;
    referenceNumber: string | null;
    visitDate: string;
    finalizedAt: string | null;
};

export type VisitIdentification = {
    clinic: ClinicInfo;
    patient: PatientInfo;
    doctor: DoctorInfo;
    visit: VisitInfo;
};

/** apiGet already unwraps the WebResult envelope and returns envelope.data */
export async function getVisitIdentification(visitId: string): Promise<VisitIdentification> {
    return apiGet<VisitIdentification>(`/visits/${visitId}/identification`);
}

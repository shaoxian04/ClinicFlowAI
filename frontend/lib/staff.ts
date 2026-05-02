import { apiGet, apiPost, apiPostVoid } from "./api";

export type WalkInForm = {
    fullName: string;
    dateOfBirth?: string;
    gender?: "MALE" | "FEMALE" | "OTHER";
    phone?: string;
    email?: string;
    password?: string;
    preferredLanguage?: "en" | "ms" | "zh";
};

export type WalkInResult = {
    patientId: string;
    userId: string | null;
};

export type WaitingEntry = {
    appointmentId: string;
    patientId: string;
    patientName: string;
    preVisitStatus: "none" | "pending" | "submitted";
    arrivedAt: string | null;
    slotStartAt: string;
    type: "NEW_SYMPTOM" | "FOLLOW_UP";
    doctorName: string;
    checkedIn: boolean;
};

export async function getTodayList(): Promise<WaitingEntry[]> {
    const res = await apiGet<{ waitingList: WaitingEntry[] }>("/staff/today");
    return res.waitingList ?? [];
}

export async function checkIn(appointmentId: string): Promise<void> {
    await apiPostVoid("/staff/checkin", { appointmentId });
}

export async function registerWalkIn(form: WalkInForm): Promise<WalkInResult> {
    return apiPost<WalkInResult>("/staff/patients", form);
}

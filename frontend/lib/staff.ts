import { apiGet, apiPostVoid } from "./api";

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

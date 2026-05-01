import { apiGet } from "./api";

export type QueueItem = {
    visitId: string;
    patientName: string;
    subjectivePreview: string;
    draftedAt: string;
    minutesSinceDraft: number;
};

export type QueueDayGroup = {
    date: string;
    count: number;
    items: QueueItem[];
};

export type DoctorQueue = {
    total: number;
    groups: QueueDayGroup[];
};

export function getDoctorQueue(): Promise<DoctorQueue> {
    return apiGet<DoctorQueue>("/doctor/queue");
}

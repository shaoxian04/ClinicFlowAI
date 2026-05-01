import { apiGet, apiPost, apiDelete } from "./api";

export type Slot = {
    id: string;
    doctorId: string;
    startAt: string;
    endAt: string;
    status: "AVAILABLE" | "BOOKED" | "BLOCKED" | "CLOSED";
};

export type Appointment = {
    id: string;
    slotId: string;
    startAt: string;
    endAt: string;
    doctorId: string;
    patientId: string;
    visitId: string;
    type: "NEW_SYMPTOM" | "FOLLOW_UP";
    parentVisitId: string | null;
    status: "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
    cancelledAt: string | null;
};

export type AppointmentBookRequest = {
    slotId: string;
    type: "NEW_SYMPTOM" | "FOLLOW_UP";
    visitId?: string;
    parentVisitId?: string;
};

export async function listAvailability(from: string, to: string): Promise<Slot[]> {
    const res = await apiGet<{ slots: Slot[] }>(`/appointments/availability?from=${from}&to=${to}`);
    return res.slots;
}

export async function bookAppointment(req: AppointmentBookRequest): Promise<string> {
    // The book endpoint returns the appointment UUID directly as `data` (not wrapped).
    return apiPost<string>("/appointments", req);
}

export async function listMine(status?: Appointment["status"]): Promise<Appointment[]> {
    const q = status ? `?status=${status}` : "";
    return apiGet<Appointment[]>(`/appointments/mine${q}`);
}

export async function cancelAppointment(id: string, reason?: string): Promise<void> {
    await apiDelete<void>(`/appointments/${id}`, reason ? { reason } : undefined);
}

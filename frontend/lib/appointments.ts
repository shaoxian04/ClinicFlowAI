import { apiGet, apiPost, apiPostVoid, apiPut, apiDelete } from "./api";

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

/**
 * Fetch a single appointment by id. The backend exposes no single-GET
 * endpoint (only /mine list), so we list and find by id.
 * Returns null when the appointment is not found.
 */
export async function getAppointment(id: string): Promise<Appointment | null> {
    const all = await listMine();
    return all.find((a) => a.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Schedule management helpers (Phase 10)
// ---------------------------------------------------------------------------

export type ScheduleTemplate = {
    id: string;
    doctorId: string;
    effectiveFrom: string;        // ISO date
    slotMinutes: number;
    weeklyHours: Record<string, [string, string][]>;  // {"MON":[["09:00","12:00"]],...}
    cancelLeadHours: number;
    generationHorizonDays: number;
};

export type DaySchedule = {
    date: string;                 // ISO date
    slots: Slot[];
    appointments: Appointment[];
};

export async function getDaySchedule(date: string): Promise<DaySchedule> {
    return apiGet<DaySchedule>(`/schedule/days/${date}`);
}

export async function closeDay(date: string, reason: string): Promise<string> {
    return apiPost<string>(`/schedule/days/${date}/closures`, { date, reason });
}

export async function blockWindow(
    date: string,
    windowStart: string,
    windowEnd: string,
    reason: string,
): Promise<string> {
    return apiPost<string>(`/schedule/days/${date}/blocks`, {
        date, windowStart, windowEnd, reason,
    });
}

export async function removeOverride(id: string): Promise<void> {
    await apiDelete<void>(`/schedule/overrides/${id}`);
}

export async function markNoShow(appointmentId: string): Promise<void> {
    // The backend returns void via POST; use apiPostVoid.
    await apiPostVoid(`/schedule/appointments/${appointmentId}/no-show`);
}

export async function getScheduleTemplate(): Promise<ScheduleTemplate | null> {
    try {
        return await apiGet<ScheduleTemplate>(`/schedule/template`);
    } catch (e) {
        // 404 when no template exists yet
        if (e instanceof Error && /404|not.found/i.test(e.message)) return null;
        throw e;
    }
}

export async function upsertScheduleTemplate(req: {
    effectiveFrom: string;
    slotMinutes: number;
    weeklyHours: Record<string, [string, string][]>;
    cancelLeadHours: number;
    generationHorizonDays: number;
}): Promise<ScheduleTemplate> {
    return apiPut<ScheduleTemplate>(`/schedule/template`, req);
}

export async function getDoctorToday(): Promise<Appointment[]> {
    return apiGet<Appointment[]>(`/doctor/appointments/today`);
}

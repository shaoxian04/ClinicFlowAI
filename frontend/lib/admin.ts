import { apiGet, apiPatchVoid, apiPostVoid } from "./api";

export type AuditEntry = {
    id: number;
    occurred_at: string;
    actor_email: string | null;
    actor_name: string | null;
    actor_role: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    metadata: Record<string, unknown>;
};

export type AuditPage = {
    total: number;
    page: number;
    limit: number;
    entries: AuditEntry[];
};

export type Analytics = {
    kpis: {
        totalPatients: number;
        totalAppointments: number;
        appointmentsToday: number;
        finalized30d: number;
    };
    appointmentSeries30d: { date: string; count: number }[];
};

export type UserRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";

export type AdminUser = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    active: boolean;
};

export async function listUsers(): Promise<AdminUser[]> {
    const res = await apiGet<{ users: AdminUser[] }>("/admin/users");
    return res.users ?? [];
}

export async function changeUserRole(userId: string, role: UserRole): Promise<void> {
    await apiPatchVoid(`/admin/users/${encodeURIComponent(userId)}/role`, { role });
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
    await apiPatchVoid(`/admin/users/${encodeURIComponent(userId)}/active`, { active });
}

export async function forcePasswordReset(userId: string): Promise<void> {
    await apiPostVoid(`/admin/users/${encodeURIComponent(userId)}/force-password-reset`);
}

export async function getAuditLog(params: {
    page?: number;
    limit?: number;
    action?: string;
    resourceType?: string;
    from?: string;
    to?: string;
}): Promise<AuditPage> {
    const q = new URLSearchParams();
    if (params.page !== undefined) q.set("page", String(params.page));
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.action) q.set("action", params.action);
    if (params.resourceType) q.set("resourceType", params.resourceType);
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    return apiGet<AuditPage>(`/admin/audit?${q}`);
}

export async function getAnalytics(): Promise<Analytics> {
    return apiGet<Analytics>("/admin/analytics");
}

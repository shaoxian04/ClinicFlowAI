import { apiGet, apiPatch } from "./api";

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
    await apiPatch<unknown>(`/admin/users/${encodeURIComponent(userId)}/role`, { role });
}

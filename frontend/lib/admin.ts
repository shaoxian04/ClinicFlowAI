import { apiGet, apiPatchVoid, apiPostVoid } from "./api";

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

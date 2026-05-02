"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUser } from "@/lib/auth";
import { apiPost } from "@/lib/api";
import { listUsers, changeUserRole, type AdminUser, type UserRole } from "@/lib/admin";

import AdminNav from "../components/AdminNav";
import UserDetailDrawer from "./components/UserDetailDrawer";

type CreateForm = {
    email: string;
    name: string;
    role: UserRole;
    initialPassword: string;
};

const EMPTY_CREATE: CreateForm = {
    email: "",
    name: "",
    role: "PATIENT",
    initialPassword: "",
};

const ROLES: UserRole[] = ["PATIENT", "DOCTOR", "STAFF", "ADMIN"];

export default function AdminUsersPage() {
    const router = useRouter();
    const [loading, setLoading] = useState<boolean>(true);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [stub, setStub] = useState<boolean>(false);
    const [showCreate, setShowCreate] = useState<boolean>(false);
    const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
    const [createBusy, setCreateBusy] = useState<boolean>(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [roleChanges, setRoleChanges] = useState<Record<string, UserRole>>({});
    const [roleBusy, setRoleBusy] = useState<Record<string, boolean>>({});
    const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});
    const [drawerUser, setDrawerUser] = useState<AdminUser | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user) {
            router.replace("/login");
            return;
        }
        if (user.role !== "ADMIN") {
            router.replace("/login");
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const list = await listUsers();
                if (!cancelled) {
                    setUsers(list);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg === "HTTP 401" || msg === "HTTP 403") {
                    router.replace("/login");
                    return;
                }
                if (!cancelled) {
                    setStub(true);
                    setUsers([]);
                }
                console.warn("admin/users unavailable", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router]);

    async function onCreate(e: React.FormEvent) {
        e.preventDefault();
        setCreateBusy(true);
        setCreateError(null);
        try {
            // Map frontend form fields to backend CreateUserRequest names
            await apiPost<unknown>("/admin/users", {
                role: createForm.role,
                email: createForm.email,
                fullName: createForm.name,
                tempPassword: createForm.initialPassword,
            });
            // Refresh list so new user appears with all fields
            const refreshed = await listUsers();
            setUsers(refreshed);
            setCreateForm(EMPTY_CREATE);
            setShowCreate(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setCreateError(msg);
        } finally {
            setCreateBusy(false);
        }
    }

    function onCreateFormChange(field: keyof CreateForm, value: string) {
        setCreateForm((prev) => ({ ...prev, [field]: value }));
    }

    function onRoleSelect(userId: string, role: UserRole) {
        setRoleChanges((prev) => ({ ...prev, [userId]: role }));
    }

    async function onRoleSave(userId: string) {
        const newRole = roleChanges[userId];
        if (!newRole) return;
        setRoleBusy((prev) => ({ ...prev, [userId]: true }));
        setRoleErrors((prev) => ({ ...prev, [userId]: "" }));
        try {
            await changeUserRole(userId, newRole);
            setUsers((prev) =>
                prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
            );
            setRoleChanges((prev) => {
                const next = { ...prev };
                delete next[userId];
                return next;
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setRoleErrors((prev) => ({ ...prev, [userId]: msg }));
        } finally {
            setRoleBusy((prev) => ({ ...prev, [userId]: false }));
        }
    }

    function onDrawerUpdated(updated: AdminUser) {
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        setDrawerUser(updated);
    }

    return (
        <>
            <AdminNav active="users" />
            <UserDetailDrawer
                user={drawerUser}
                onClose={() => setDrawerUser(null)}
                onUpdated={onDrawerUpdated}
            />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Clinic admin</div>
                    <h1 className="page-header-title">User management.</h1>
                    <p className="page-header-sub">
                        Create accounts and manage roles for clinic staff, doctors, and patients.
                    </p>
                </header>

                {stub && (
                    <div className="ghost-banner" role="status">
                        Unable to load users — check your connection and try refreshing.
                    </div>
                )}

                <div className="admin-section-header">
                    <h2 className="admin-section-title">Users</h2>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowCreate((v) => !v)}
                    >
                        {showCreate ? "Cancel" : "+ New user"}
                    </button>
                </div>

                {showCreate && (
                    <section className="admin-create-panel">
                        <h3 className="admin-create-title">Create new user</h3>
                        <form onSubmit={onCreate} className="admin-create-form">
                            <label className="field">
                                <span className="field-label">Email</span>
                                <input
                                    type="email"
                                    className="input"
                                    value={createForm.email}
                                    onChange={(e) => onCreateFormChange("email", e.target.value)}
                                    required
                                    autoComplete="off"
                                />
                            </label>
                            <label className="field">
                                <span className="field-label">Name</span>
                                <input
                                    type="text"
                                    className="input"
                                    value={createForm.name}
                                    onChange={(e) => onCreateFormChange("name", e.target.value)}
                                    required
                                    autoComplete="off"
                                />
                            </label>
                            <label className="field">
                                <span className="field-label">Role</span>
                                <select
                                    className="input"
                                    value={createForm.role}
                                    onChange={(e) =>
                                        onCreateFormChange("role", e.target.value)
                                    }
                                >
                                    {ROLES.map((r) => (
                                        <option key={r} value={r}>
                                            {r}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="field">
                                <span className="field-label">Initial password (min 12 chars)</span>
                                <input
                                    type="password"
                                    className="input"
                                    value={createForm.initialPassword}
                                    onChange={(e) =>
                                        onCreateFormChange("initialPassword", e.target.value)
                                    }
                                    required
                                    minLength={12}
                                    autoComplete="new-password"
                                />
                            </label>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={createBusy}
                            >
                                {createBusy ? "Creating…" : "Create user"}
                            </button>
                            {createError && (
                                <div className="banner banner-error">{createError}</div>
                            )}
                        </form>
                    </section>
                )}

                {loading ? (
                    <SkeletonTable rows={3} />
                ) : users.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-title">No users found.</div>
                        <div className="empty-state-body">
                            Create the first user with the button above.
                        </div>
                    </div>
                ) : (
                    <div className="admin-table-wrap">
                        <table className="audit-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Change role</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id}>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                {!u.active && (
                                                    <span className="text-fog-dim text-xs">(inactive)</span>
                                                )}
                                                {u.name}
                                            </div>
                                        </td>
                                        <td>{u.email}</td>
                                        <td>
                                            <span className={`role-chip role-chip-${u.role.toLowerCase()}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="role-change-row">
                                                <select
                                                    className="input input-compact"
                                                    value={roleChanges[u.id] ?? u.role}
                                                    onChange={(e) =>
                                                        onRoleSelect(
                                                            u.id,
                                                            e.target.value as UserRole,
                                                        )
                                                    }
                                                    disabled={roleBusy[u.id]}
                                                >
                                                    {ROLES.map((r) => (
                                                        <option key={r} value={r}>
                                                            {r}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    disabled={
                                                        roleBusy[u.id] ||
                                                        !roleChanges[u.id] ||
                                                        roleChanges[u.id] === u.role
                                                    }
                                                    onClick={() => onRoleSave(u.id)}
                                                >
                                                    {roleBusy[u.id] ? "Saving…" : "Save"}
                                                </button>
                                                {roleErrors[u.id] && (
                                                    <span className="error-hint">
                                                        {roleErrors[u.id]}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-sm"
                                                onClick={() => setDrawerUser(u)}
                                            >
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </>
    );
}

function SkeletonTable({ rows }: { rows: number }) {
    return (
        <div className="admin-table-wrap" aria-busy="true">
            <table className="audit-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Change role</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: rows }).map((_, i) => (
                        <tr key={i}>
                            <td>
                                <span className="skeleton-bar skeleton-bar-wide" />
                            </td>
                            <td>
                                <span className="skeleton-bar skeleton-bar-wide" />
                            </td>
                            <td>
                                <span className="skeleton-bar skeleton-bar-narrow" />
                            </td>
                            <td>
                                <span className="skeleton-bar skeleton-bar-narrow" />
                            </td>
                            <td>
                                <span className="skeleton-bar skeleton-bar-btn" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUser } from "@/lib/auth";
import { apiGet, apiPost } from "@/lib/api";

import AdminNav from "../components/AdminNav";

type UserRole = "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";

type AdminUser = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
};

type UsersResponse = { users: AdminUser[] };

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
    const [createStub, setCreateStub] = useState<boolean>(false);
    const [roleChanges, setRoleChanges] = useState<Record<string, UserRole>>({});
    const [roleBusy, setRoleBusy] = useState<Record<string, boolean>>({});
    const [roleStubs, setRoleStubs] = useState<Record<string, boolean>>({});
    const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});

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
                const data = await apiGet<UsersResponse>("/admin/users");
                if (!cancelled) {
                    setUsers(data.users ?? []);
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
        setCreateStub(false);
        try {
            const created = await apiPost<AdminUser>("/admin/users", createForm);
            setUsers((prev) => [...prev, created]);
            setCreateForm(EMPTY_CREATE);
            setShowCreate(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const is404 = msg.includes("404");
            if (is404) {
                setCreateStub(true);
            } else {
                setCreateError(msg);
            }
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
        setRoleStubs((prev) => ({ ...prev, [userId]: false }));
        try {
            await apiPost<unknown>(`/admin/users/${userId}/role`, { role: newRole });
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
            const is404 = msg.includes("404");
            if (is404) {
                setRoleStubs((prev) => ({ ...prev, [userId]: true }));
            } else {
                setRoleErrors((prev) => ({ ...prev, [userId]: msg }));
            }
        } finally {
            setRoleBusy((prev) => ({ ...prev, [userId]: false }));
        }
    }

    return (
        <>
            <AdminNav active="users" />
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
                        Stub — backend pending. Showing empty user list until the API is wired up.
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
                                <span className="field-label">Initial password</span>
                                <input
                                    type="password"
                                    className="input"
                                    value={createForm.initialPassword}
                                    onChange={(e) =>
                                        onCreateFormChange("initialPassword", e.target.value)
                                    }
                                    required
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
                            {createStub && (
                                <div className="ghost-banner" role="status">
                                    Stub — backend pending
                                </div>
                            )}
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
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id}>
                                        <td>{u.name}</td>
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
                                                {roleStubs[u.id] && (
                                                    <span className="stub-hint">
                                                        Stub — backend pending
                                                    </span>
                                                )}
                                                {roleErrors[u.id] && (
                                                    <span className="error-hint">
                                                        {roleErrors[u.id]}
                                                    </span>
                                                )}
                                            </div>
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
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

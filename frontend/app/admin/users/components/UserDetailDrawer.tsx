"use client";

import { useEffect, useRef, useState } from "react";
import { type AdminUser, type UserRole, setUserActive, forcePasswordReset, changeUserRole } from "@/lib/admin";
import { cn } from "@/design/cn";

const ROLES: UserRole[] = ["PATIENT", "DOCTOR", "STAFF", "ADMIN"];

type Props = {
    user: AdminUser | null;
    onClose: () => void;
    onUpdated: (updated: AdminUser) => void;
};

type ActionState = {
    busy: boolean;
    error: string | null;
    success: string | null;
};

const IDLE: ActionState = { busy: false, error: null, success: null };

export default function UserDetailDrawer({ user, onClose, onUpdated }: Props) {
    const [activeState, setActiveState] = useState<ActionState>(IDLE);
    const [resetState, setResetState] = useState<ActionState>(IDLE);
    const [roleState, setRoleState] = useState<ActionState>(IDLE);
    const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    // Reset local state when user changes
    useEffect(() => {
        setActiveState(IDLE);
        setResetState(IDLE);
        setRoleState(IDLE);
        setPendingRole(null);
    }, [user?.id]);

    // Trap focus + ESC
    useEffect(() => {
        if (!user) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        closeRef.current?.focus();
        return () => window.removeEventListener("keydown", onKey);
    }, [user, onClose]);

    async function onToggleActive() {
        if (!user) return;
        setActiveState({ busy: true, error: null, success: null });
        try {
            const next = !user.active;
            await setUserActive(user.id, next);
            setActiveState({ busy: false, error: null, success: next ? "Account activated." : "Account deactivated." });
            onUpdated({ ...user, active: next });
        } catch (err) {
            setActiveState({ busy: false, error: err instanceof Error ? err.message : String(err), success: null });
        }
    }

    async function onForceReset() {
        if (!user) return;
        setResetState({ busy: true, error: null, success: null });
        try {
            await forcePasswordReset(user.id);
            setResetState({ busy: false, error: null, success: "User will be prompted to change password on next login." });
        } catch (err) {
            setResetState({ busy: false, error: err instanceof Error ? err.message : String(err), success: null });
        }
    }

    async function onSaveRole() {
        if (!user || !pendingRole || pendingRole === user.role) return;
        setRoleState({ busy: true, error: null, success: null });
        try {
            await changeUserRole(user.id, pendingRole);
            setRoleState({ busy: false, error: null, success: `Role updated to ${pendingRole}.` });
            onUpdated({ ...user, role: pendingRole });
            setPendingRole(null);
        } catch (err) {
            setRoleState({ busy: false, error: err instanceof Error ? err.message : String(err), success: null });
        }
    }

    const open = user !== null;

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-40 transition-opacity duration-200",
                    open ? "bg-obsidian/60 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                aria-hidden="true"
                onClick={onClose}
            />

            {/* Drawer panel */}
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={user ? `User details: ${user.name}` : "User details"}
                className={cn(
                    "fixed top-0 right-0 h-full w-full max-w-sm z-50",
                    "bg-ink-well border-l border-ink-rim",
                    "flex flex-col",
                    "transition-transform duration-200 ease-out",
                    open ? "translate-x-0" : "translate-x-full"
                )}
            >
                {user && (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-ink-rim">
                            <div className="min-w-0">
                                <p className="font-mono text-xs text-fog-dim uppercase tracking-widest mb-1">
                                    User account
                                </p>
                                <h2 className="font-display text-2xl text-fog leading-tight truncate">
                                    {user.name}
                                </h2>
                                <p className="text-sm text-fog-dim mt-0.5 truncate">{user.email}</p>
                            </div>
                            <button
                                ref={closeRef}
                                type="button"
                                onClick={onClose}
                                className="mt-1 flex-shrink-0 p-1.5 rounded text-fog-dim hover:text-fog hover:bg-ink-rim transition-colors"
                                aria-label="Close drawer"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                            {/* Status row */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-mono text-xs text-fog-dim uppercase tracking-widest mb-1">Status</p>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "inline-block w-2 h-2 rounded-full",
                                            user.active ? "bg-cyan" : "bg-fog-dim"
                                        )} />
                                        <span className="text-sm text-fog">
                                            {user.active ? "Active" : "Inactive"}
                                        </span>
                                    </div>
                                </div>
                                <span className={`role-chip role-chip-${user.role.toLowerCase()}`}>
                                    {user.role}
                                </span>
                            </div>

                            <div className="h-px bg-ink-rim" />

                            {/* Role change */}
                            <div>
                                <p className="font-mono text-xs text-fog-dim uppercase tracking-widest mb-3">Change role</p>
                                <div className="flex gap-2">
                                    <select
                                        className="input input-compact flex-1"
                                        value={pendingRole ?? user.role}
                                        onChange={(e) => setPendingRole(e.target.value as UserRole)}
                                        disabled={roleState.busy}
                                    >
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={onSaveRole}
                                        disabled={roleState.busy || !pendingRole || pendingRole === user.role}
                                    >
                                        {roleState.busy ? "Saving…" : "Save"}
                                    </button>
                                </div>
                                {roleState.success && <p className="mt-2 text-xs text-cyan">{roleState.success}</p>}
                                {roleState.error && <p className="mt-2 text-xs text-crimson">{roleState.error}</p>}
                            </div>

                            <div className="h-px bg-ink-rim" />

                            {/* Activate / Deactivate */}
                            <div>
                                <p className="font-mono text-xs text-fog-dim uppercase tracking-widest mb-3">Account access</p>
                                <button
                                    type="button"
                                    className={cn(
                                        "btn w-full",
                                        user.active
                                            ? "border-crimson/40 text-crimson hover:bg-crimson/10"
                                            : "border-cyan/40 text-cyan hover:bg-cyan/10"
                                    )}
                                    onClick={onToggleActive}
                                    disabled={activeState.busy}
                                >
                                    {activeState.busy
                                        ? (user.active ? "Deactivating…" : "Activating…")
                                        : (user.active ? "Deactivate account" : "Activate account")}
                                </button>
                                {activeState.success && <p className="mt-2 text-xs text-cyan">{activeState.success}</p>}
                                {activeState.error && <p className="mt-2 text-xs text-crimson">{activeState.error}</p>}
                            </div>

                            {/* Force password reset */}
                            <div>
                                <p className="font-mono text-xs text-fog-dim uppercase tracking-widest mb-3">Security</p>
                                <button
                                    type="button"
                                    className="btn w-full border-amber/40 text-amber hover:bg-amber/10"
                                    onClick={onForceReset}
                                    disabled={resetState.busy}
                                >
                                    {resetState.busy ? "Sending…" : "Force password reset"}
                                </button>
                                {resetState.success && <p className="mt-2 text-xs text-cyan">{resetState.success}</p>}
                                {resetState.error && <p className="mt-2 text-xs text-crimson">{resetState.error}</p>}
                            </div>
                        </div>
                    </>
                )}
            </aside>
        </>
    );
}

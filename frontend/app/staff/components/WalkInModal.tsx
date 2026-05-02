"use client";

import { useEffect, useRef, useState } from "react";
import { registerWalkIn, type WalkInForm, type WalkInResult } from "@/lib/staff";
import { cn } from "@/design/cn";

type Props = {
    open: boolean;
    onClose: () => void;
    onRegistered: (result: WalkInResult) => void;
};

const EMPTY: WalkInForm = {
    fullName: "",
    dateOfBirth: "",
    gender: undefined,
    phone: "",
    email: "",
    password: "",
    preferredLanguage: "en",
};

export default function WalkInModal({ open, onClose, onRegistered }: Props) {
    const [form, setForm] = useState<WalkInForm>(EMPTY);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const firstRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setForm(EMPTY);
        setError(null);
        setTimeout(() => firstRef.current?.focus(), 50);
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    function set(field: keyof WalkInForm, value: string) {
        setForm(prev => ({ ...prev, [field]: value || undefined }));
    }

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const result = await registerWalkIn({
                ...form,
                fullName: form.fullName.trim(),
            });
            onRegistered(result);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    const createAccount = !!(form.email?.trim());

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-40 transition-opacity duration-150",
                    open ? "bg-obsidian/70 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                aria-hidden="true"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Register walk-in patient"
                className={cn(
                    "fixed left-1/2 top-1/2 z-50 w-full max-w-md",
                    "-translate-x-1/2 -translate-y-1/2",
                    "bg-ink-well border border-ink-rim rounded-xl shadow-glass",
                    "transition-all duration-150",
                    open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                )}
            >
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-ink-rim">
                    <div>
                        <p className="font-mono text-xs text-fog-dim uppercase tracking-widest mb-0.5">
                            Front desk
                        </p>
                        <h2 className="font-display text-xl text-fog">Register walk-in patient</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded text-fog-dim hover:text-fog hover:bg-ink-rim transition-colors"
                        aria-label="Close"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
                    <div className="field">
                        <label className="field-label">Full name *</label>
                        <input
                            ref={firstRef}
                            className="input"
                            required
                            autoComplete="off"
                            value={form.fullName}
                            onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="field">
                            <label className="field-label">Date of birth</label>
                            <input className="input" type="date"
                                value={form.dateOfBirth ?? ""}
                                onChange={e => set("dateOfBirth", e.target.value)} />
                        </div>
                        <div className="field">
                            <label className="field-label">Gender</label>
                            <select className="input"
                                value={form.gender ?? ""}
                                onChange={e => set("gender", e.target.value)}>
                                <option value="">— select —</option>
                                <option value="MALE">Male</option>
                                <option value="FEMALE">Female</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                    </div>

                    <div className="field">
                        <label className="field-label">Phone</label>
                        <input className="input" type="tel" placeholder="+60123456789"
                            value={form.phone ?? ""}
                            onChange={e => set("phone", e.target.value)} />
                    </div>

                    <div className="h-px bg-ink-rim" />

                    <p className="font-mono text-xs text-fog-dim uppercase tracking-widest">
                        Patient login account (optional)
                    </p>

                    <div className="field">
                        <label className="field-label">Email</label>
                        <input className="input" type="email" autoComplete="off"
                            value={form.email ?? ""}
                            onChange={e => set("email", e.target.value)} />
                    </div>

                    {createAccount && (
                        <div className="field">
                            <label className="field-label">Temporary password *</label>
                            <input className="input" type="password" autoComplete="new-password"
                                required={createAccount}
                                minLength={8}
                                value={form.password ?? ""}
                                onChange={e => set("password", e.target.value)} />
                            <p className="text-xs text-fog-dim mt-1">Patient must change this on first login.</p>
                        </div>
                    )}

                    {error && <div className="banner banner-error">{error}</div>}

                    <div className="flex justify-end gap-3 pt-1">
                        <button type="button" className="btn" onClick={onClose} disabled={busy}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy ? "Registering…" : "Register patient"}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}

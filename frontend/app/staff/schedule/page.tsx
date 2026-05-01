"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import { getUser } from "@/lib/auth";
import {
    getDaySchedule,
    closeDay,
    blockWindow,
    markNoShow,
    type DaySchedule,
} from "@/lib/appointments";
import type { Slot } from "@/lib/appointments";

import StaffNav from "../components/StaffNav";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "—";
    }
}

function truncateId(id: string): string {
    return id ? `…${id.slice(-8)}` : "—";
}

const STATUS_LABELS: Record<Slot["status"], string> = {
    AVAILABLE: "Available",
    BOOKED: "Booked",
    BLOCKED: "Blocked",
    CLOSED: "Closed",
};

const STATUS_CLASS: Record<Slot["status"], string> = {
    AVAILABLE: "sched-badge sched-badge-available",
    BOOKED: "sched-badge sched-badge-booked",
    BLOCKED: "sched-badge sched-badge-blocked",
    CLOSED: "sched-badge sched-badge-closed",
};

// ---------------------------------------------------------------------------
// Dialog primitives
// ---------------------------------------------------------------------------

type CloseDayDialogProps = {
    date: string;
    onClose: () => void;
    onSuccess: () => void;
};

function CloseDayDialog({ date, onClose, onSuccess }: CloseDayDialogProps) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!reason.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await closeDay(date, reason.trim());
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="sched-dialog-backdrop" role="dialog" aria-modal="true">
            <div className="sched-dialog">
                <h2 className="sched-dialog-title">Close day</h2>
                <p className="sched-dialog-sub">
                    All available slots on <strong>{date}</strong> will be marked closed.
                </p>
                <form onSubmit={handleSubmit} className="sched-dialog-form">
                    <label className="field">
                        <span className="field-label">Reason</span>
                        <textarea
                            className="input sched-textarea"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Public holiday, doctor leave…"
                            required
                            rows={3}
                        />
                    </label>
                    {error && (
                        <div className="banner banner-error" role="alert">
                            {error}
                        </div>
                    )}
                    <div className="sched-dialog-actions">
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={busy || !reason.trim()}
                        >
                            {busy ? "Closing…" : "Close day"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

type BlockWindowDialogProps = {
    date: string;
    onClose: () => void;
    onSuccess: () => void;
};

function BlockWindowDialog({ date, onClose, onSuccess }: BlockWindowDialogProps) {
    const [windowStart, setWindowStart] = useState("09:00");
    const [windowEnd, setWindowEnd] = useState("10:00");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!reason.trim()) return;
        setBusy(true);
        setError(null);
        try {
            await blockWindow(date, windowStart, windowEnd, reason.trim());
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="sched-dialog-backdrop" role="dialog" aria-modal="true">
            <div className="sched-dialog">
                <h2 className="sched-dialog-title">Block window</h2>
                <p className="sched-dialog-sub">
                    Slots within the selected window on <strong>{date}</strong> will be blocked.
                </p>
                <form onSubmit={handleSubmit} className="sched-dialog-form">
                    <div className="sched-time-row">
                        <label className="field">
                            <span className="field-label">Start time</span>
                            <input
                                type="time"
                                className="input"
                                value={windowStart}
                                onChange={(e) => setWindowStart(e.target.value)}
                                required
                            />
                        </label>
                        <label className="field">
                            <span className="field-label">End time</span>
                            <input
                                type="time"
                                className="input"
                                value={windowEnd}
                                onChange={(e) => setWindowEnd(e.target.value)}
                                required
                            />
                        </label>
                    </div>
                    <label className="field">
                        <span className="field-label">Reason</span>
                        <textarea
                            className="input sched-textarea"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Team meeting, equipment maintenance…"
                            required
                            rows={3}
                        />
                    </label>
                    {error && (
                        <div className="banner banner-error" role="alert">
                            {error}
                        </div>
                    )}
                    <div className="sched-dialog-actions">
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={busy || !reason.trim()}
                        >
                            {busy ? "Blocking…" : "Block window"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StaffSchedulePage() {
    const router = useRouter();

    const [date, setDate] = useState<string>(todayIso);
    const [schedule, setSchedule] = useState<DaySchedule | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [showCloseDay, setShowCloseDay] = useState(false);
    const [showBlockWindow, setShowBlockWindow] = useState(false);

    const [noShowBusy, setNoShowBusy] = useState<Record<string, boolean>>({});
    const [noShowError, setNoShowError] = useState<Record<string, string>>({});

    // Auth guard.
    useEffect(() => {
        const user = getUser();
        if (!user) { router.replace("/login"); return; }
        if (user.role !== "STAFF") { router.replace("/login"); }
    }, [router]);

    const fetchSchedule = useCallback(async (d: string) => {
        setLoading(true);
        setError(null);
        setSchedule(null);
        try {
            const data = await getDaySchedule(d);
            setSchedule(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSchedule(date);
    }, [date, fetchSchedule]);

    async function handleMarkNoShow(appointmentId: string) {
        setNoShowBusy((prev) => ({ ...prev, [appointmentId]: true }));
        setNoShowError((prev) => ({ ...prev, [appointmentId]: "" }));
        try {
            await markNoShow(appointmentId);
            await fetchSchedule(date);
        } catch (err) {
            setNoShowError((prev) => ({
                ...prev,
                [appointmentId]: err instanceof Error ? err.message : String(err),
            }));
        } finally {
            setNoShowBusy((prev) => ({ ...prev, [appointmentId]: false }));
        }
    }

    function onDialogSuccess() {
        setShowCloseDay(false);
        setShowBlockWindow(false);
        fetchSchedule(date);
    }

    const slots = schedule?.slots ?? [];
    const appointments = schedule?.appointments ?? [];
    const sortedSlots = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const sortedAppointments = [...appointments].sort((a, b) =>
        a.startAt.localeCompare(b.startAt)
    );

    return (
        <>
            <StaffNav active="schedule" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Front desk</div>
                    <h1 className="page-header-title">Day schedule.</h1>
                    <p className="page-header-sub">
                        View slots and appointments for a given day. Close the day or block a
                        window to prevent new bookings.
                    </p>
                </header>

                {/* Date picker + action bar */}
                <div className="sched-toolbar">
                    <label className="field sched-date-field">
                        <span className="field-label">Date</span>
                        <input
                            type="date"
                            className="input"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </label>
                    <div className="sched-toolbar-actions">
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setShowBlockWindow(true)}
                            disabled={loading}
                        >
                            Block window
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setShowCloseDay(true)}
                            disabled={loading}
                        >
                            Close day
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="banner banner-error" role="alert">
                        {error}
                    </div>
                )}

                {loading ? (
                    <SkeletonSection />
                ) : (
                    <>
                        {/* Slots section */}
                        <section className="sched-section">
                            <h2 className="sched-section-title">
                                Slots
                                <span className="sched-count">{sortedSlots.length}</span>
                            </h2>
                            {sortedSlots.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-title">No slots for this day.</div>
                                    <div className="empty-state-body">
                                        Slots are generated from the schedule template.
                                    </div>
                                </div>
                            ) : (
                                <div className="sched-list">
                                    {sortedSlots.map((slot) => (
                                        <div key={slot.id} className="sched-slot-row">
                                            <span className="sched-time">
                                                {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                                            </span>
                                            <span className={STATUS_CLASS[slot.status]}>
                                                {STATUS_LABELS[slot.status]}
                                            </span>
                                            <span className="sched-id">
                                                {truncateId(slot.id)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Appointments section */}
                        <section className="sched-section">
                            <h2 className="sched-section-title">
                                Appointments
                                <span className="sched-count">{sortedAppointments.length}</span>
                            </h2>
                            {sortedAppointments.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-title">No appointments booked.</div>
                                    <div className="empty-state-body">
                                        Booked appointments will appear here.
                                    </div>
                                </div>
                            ) : (
                                <div className="sched-list">
                                    {sortedAppointments.map((appt) => (
                                        <div key={appt.id} className="sched-appt-row">
                                            <span className="sched-time">
                                                {formatTime(appt.startAt)}
                                            </span>
                                            <span className="sched-patient">
                                                Patient {truncateId(appt.patientId)}
                                            </span>
                                            <span className="sched-type">
                                                {appt.type === "NEW_SYMPTOM"
                                                    ? "New symptom"
                                                    : "Follow-up"}
                                            </span>
                                            <span className="sched-appt-status">
                                                {appt.status}
                                            </span>
                                            {appt.status === "BOOKED" && (
                                                <div className="sched-appt-action">
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        disabled={noShowBusy[appt.id]}
                                                        onClick={() => handleMarkNoShow(appt.id)}
                                                    >
                                                        {noShowBusy[appt.id]
                                                            ? "Marking…"
                                                            : "Mark no-show"}
                                                    </button>
                                                    {noShowError[appt.id] && (
                                                        <span className="error-hint">
                                                            {noShowError[appt.id]}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </>
                )}
            </main>

            {showCloseDay && (
                <CloseDayDialog
                    date={date}
                    onClose={() => setShowCloseDay(false)}
                    onSuccess={onDialogSuccess}
                />
            )}

            {showBlockWindow && (
                <BlockWindowDialog
                    date={date}
                    onClose={() => setShowBlockWindow(false)}
                    onSuccess={onDialogSuccess}
                />
            )}
        </>
    );
}

function SkeletonSection() {
    return (
        <div className="sched-section" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="sched-slot-row">
                    <span className="skeleton-bar skeleton-bar-narrow" />
                    <span className="skeleton-bar skeleton-bar-narrow" />
                </div>
            ))}
        </div>
    );
}

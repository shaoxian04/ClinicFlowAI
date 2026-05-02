"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUser } from "@/lib/auth";
import { getTodayList, checkIn, type WaitingEntry } from "@/lib/staff";

import StaffNav from "./components/StaffNav";

type RowState = {
    checkedIn: boolean;
    busy: boolean;
    error: string | null;
};

function emptyRowState(): RowState {
    return { checkedIn: false, busy: false, error: null };
}

export default function StaffTodayPage() {
    const router = useRouter();
    const [loading, setLoading] = useState<boolean>(true);
    const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
    const [dataUnavailable, setDataUnavailable] = useState<boolean>(false);
    const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

    useEffect(() => {
        const user = getUser();
        if (!user) {
            router.replace("/login");
            return;
        }
        if (user.role !== "STAFF") {
            router.replace("/login");
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const list = await getTodayList();
                if (!cancelled) {
                    setWaiting(list);
                }
            } catch (err) {
                if (!cancelled) {
                    setDataUnavailable(true);
                    setWaiting([]);
                }
                console.warn("staff/today unavailable", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router]);

    async function onCheckIn(appointmentId: string) {
        setRowStates((prev) => ({
            ...prev,
            [appointmentId]: { ...(prev[appointmentId] ?? emptyRowState()), busy: true, error: null },
        }));
        try {
            await checkIn(appointmentId);
            setRowStates((prev) => ({
                ...prev,
                [appointmentId]: {
                    ...(prev[appointmentId] ?? emptyRowState()),
                    busy: false,
                    checkedIn: true,
                    error: null,
                },
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setRowStates((prev) => ({
                ...prev,
                [appointmentId]: {
                    ...(prev[appointmentId] ?? emptyRowState()),
                    busy: false,
                    error: message,
                },
            }));
        }
    }

    return (
        <>
            <StaffNav active="today" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Front desk</div>
                    <h1 className="page-header-title">Today in the waiting room.</h1>
                    <p className="page-header-sub">
                        Check patients in as they arrive. A pre-visit dot shows whether the
                        doctor already has their intake.
                    </p>
                </header>

                {dataUnavailable && (
                    <div className="ghost-banner" role="status">
                        Data unavailable — showing an empty waiting list until the backend is
                        wired up.
                    </div>
                )}

                {loading ? (
                    <SkeletonRows count={3} />
                ) : waiting.length === 0 ? (
                    <EmptyState
                        title="No one in the waiting room."
                        body="When patients arrive, they'll appear here so you can check them in."
                    />
                ) : (
                    <ul className="waiting-list">
                        {waiting.map((entry) => {
                            const state = rowStates[entry.appointmentId] ?? emptyRowState();
                            const dotClass =
                                entry.preVisitStatus === "pending"
                                    ? "waiting-dot waiting-dot-pending"
                                    : entry.preVisitStatus === "submitted"
                                      ? "waiting-dot waiting-dot-submitted"
                                      : "waiting-dot waiting-dot-none";
                            const statusLabel =
                                entry.preVisitStatus === "pending"
                                    ? "Pre-visit pending"
                                    : entry.preVisitStatus === "submitted"
                                      ? "Pre-visit submitted"
                                      : "No pre-visit";
                            return (
                                <li key={entry.appointmentId} className="waiting-row">
                                    <span
                                        className={dotClass}
                                        title={statusLabel}
                                        aria-label={statusLabel}
                                    />
                                    <div>
                                        <div className="waiting-name">{entry.patientName}</div>
                                        <div className="waiting-meta">{statusLabel}</div>
                                    </div>
                                    <div className="waiting-meta">
                                        {entry.arrivedAt
                                            ? `Arrived ${formatTime(entry.arrivedAt)}`
                                            : `Slot ${formatTime(entry.slotStartAt)}`}
                                    </div>
                                    <div className="waiting-action">
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            disabled={state.busy || state.checkedIn || entry.checkedIn}
                                            onClick={() => onCheckIn(entry.appointmentId)}
                                        >
                                            {state.checkedIn || entry.checkedIn
                                                ? "Checked in"
                                                : state.busy
                                                  ? "Checking in…"
                                                  : "Check in"}
                                        </button>
                                        {state.error && (
                                            <div className="waiting-error">
                                                {state.error}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </main>
        </>
    );
}

function SkeletonRows({ count }: { count: number }) {
    return (
        <ul className="waiting-list" aria-busy="true">
            {Array.from({ length: count }).map((_, i) => (
                <li key={i} className="waiting-row skeleton-row">
                    <span className="waiting-dot waiting-dot-none" />
                    <div>
                        <div className="skeleton-bar skeleton-bar-wide" />
                        <div className="skeleton-bar skeleton-bar-narrow" />
                    </div>
                    <div className="skeleton-bar skeleton-bar-narrow" />
                    <div className="skeleton-bar skeleton-bar-btn" />
                </li>
            ))}
        </ul>
    );
}

function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="empty-state">
            <div className="empty-state-glyph" aria-hidden="true">
                <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" />
                </svg>
            </div>
            <div className="empty-state-title">{title}</div>
            <div className="empty-state-body">{body}</div>
        </div>
    );
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

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { getUser } from "@/lib/auth";
import { getDoctorAppointmentsRange, type Appointment } from "@/lib/appointments";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";

import DoctorNav from "../components/DoctorNav";

const KL_TZ = "Asia/Kuala_Lumpur";
const STRIP_DAYS = 4;

function todayISOInKL(): string {
    const now = new Date();
    const y = now.toLocaleString("en-CA", { timeZone: KL_TZ, year: "numeric" });
    const m = now.toLocaleString("en-CA", { timeZone: KL_TZ, month: "2-digit" });
    const d = now.toLocaleString("en-CA", { timeZone: KL_TZ, day: "2-digit" });
    return `${y}-${m}-${d}`;
}

function addDaysISO(iso: string, days: number): string {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function formatDayHeading(iso: string): string {
    const today = todayISOInKL();
    const tomorrow = addDaysISO(today, 1);
    if (iso === today) return "Today";
    if (iso === tomorrow) return "Tomorrow";
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString("en-MY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    });
}

function formatTime(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: KL_TZ,
        });
    } catch {
        return "—";
    }
}

function localDateOfStartAt(iso: string): string {
    const date = new Date(iso);
    const y = date.toLocaleString("en-CA", { timeZone: KL_TZ, year: "numeric" });
    const m = date.toLocaleString("en-CA", { timeZone: KL_TZ, month: "2-digit" });
    const d = date.toLocaleString("en-CA", { timeZone: KL_TZ, day: "2-digit" });
    return `${y}-${m}-${d}`;
}

function truncateId(id: string): string {
    return id ? `…${id.slice(-8)}` : "—";
}

export default function DoctorTodayPage() {
    const router = useRouter();
    const [fromDate, setFromDate] = useState<string>(todayISOInKL());
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "DOCTOR") router.replace("/login");
    }, [router]);

    const days = useMemo(
        () => Array.from({ length: STRIP_DAYS }, (_, i) => addDaysISO(fromDate, i)),
        [fromDate]
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        const to = days[days.length - 1];
        getDoctorAppointmentsRange(fromDate, to)
            .then((data) => {
                if (!cancelled) setAppointments(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                    setAppointments([]);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [fromDate, days]);

    const grouped = useMemo(() => {
        const byDay: Record<string, Appointment[]> = {};
        for (const d of days) byDay[d] = [];
        for (const a of appointments) {
            const key = localDateOfStartAt(a.startAt);
            if (byDay[key]) byDay[key].push(a);
        }
        return byDay;
    }, [appointments, days]);

    const totalCount = appointments.length;
    const today = todayISOInKL();
    const isOnToday = fromDate === today;

    return (
        <>
            <DoctorNav active="bookings" />
            <main className="max-w-screen-xl mx-auto px-6 py-8">
                <motion.div
                    variants={staggerChildren}
                    initial="initial"
                    animate="animate"
                    className="flex flex-col"
                >
                    <motion.div variants={fadeUp} className="mb-6 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                                Clinician workspace
                            </p>
                            <h1 className="font-display text-3xl text-fog leading-tight">
                                <em className="not-italic text-cyan">Schedule</em>
                                {isOnToday ? null : (
                                    <span className="text-fog"> · {formatDayHeading(fromDate)}</span>
                                )}
                            </h1>
                            <p className="font-sans text-sm text-fog-dim mt-2">
                                {totalCount} booked appointment{totalCount === 1 ? "" : "s"} across the next {STRIP_DAYS} days, ordered by start time.
                            </p>
                        </div>
                        <div className="flex items-end gap-2">
                            <label className="flex flex-col gap-1">
                                <span className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                                    Jump to date
                                </span>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => e.target.value && setFromDate(e.target.value)}
                                    className="bg-ink-well border border-ink-rim rounded-sm px-3 py-2 font-mono text-sm text-fog focus:border-cyan/60 focus:outline-none"
                                />
                            </label>
                            {!isOnToday && (
                                <button
                                    type="button"
                                    onClick={() => setFromDate(today)}
                                    className="bg-ink-well border border-ink-rim rounded-sm px-3 py-2 font-mono text-xs uppercase tracking-widest text-fog-dim hover:text-cyan hover:border-cyan/60 transition-colors"
                                >
                                    Today
                                </button>
                            )}
                        </div>
                    </motion.div>

                    {error && (
                        <motion.div variants={fadeUp}>
                            <div
                                className="flex items-start gap-2 px-4 py-3 bg-crimson/10 border border-crimson/30 rounded-xs text-sm text-crimson font-sans mb-4"
                                role="alert"
                            >
                                {error}
                            </div>
                        </motion.div>
                    )}

                    {loading && (
                        <motion.div variants={fadeUp} className="flex flex-col gap-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="h-14 rounded-xs bg-ink-well/60 animate-pulse"
                                    aria-hidden="true"
                                />
                            ))}
                        </motion.div>
                    )}

                    {!loading && (
                        <motion.div variants={fadeUp} className="flex flex-col gap-8">
                            {days.map((day) => (
                                <DayGroup
                                    key={day}
                                    iso={day}
                                    items={grouped[day] ?? []}
                                />
                            ))}
                        </motion.div>
                    )}
                </motion.div>
            </main>
        </>
    );
}

function DayGroup({ iso, items }: { iso: string; items: Appointment[] }) {
    const heading = formatDayHeading(iso);
    const today = todayISOInKL();
    const isToday = iso === today;
    return (
        <section>
            <header className="flex items-baseline justify-between mb-3 pb-2 border-b border-ink-rim">
                <div className="flex items-baseline gap-3">
                    <h2 className={cn("font-display text-lg", isToday ? "text-cyan" : "text-fog")}>
                        {heading}
                    </h2>
                    <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">{iso}</p>
                </div>
                <p className="font-mono text-xs text-fog-dim uppercase tracking-widest">
                    {items.length} appointment{items.length === 1 ? "" : "s"}
                </p>
            </header>
            {items.length === 0 ? (
                <p className="font-sans text-sm text-fog-dim/60 px-1">No appointments.</p>
            ) : (
                <ul className="flex flex-col gap-1">
                    {items.map((appt) => (
                        <li key={appt.id}>
                            <Link
                                href={`/doctor/visits/${appt.visitId}`}
                                className="group flex items-center gap-4 px-4 py-3 bg-ink-well border border-ink-rim rounded-xs hover:border-cyan/40 transition-colors duration-150"
                            >
                                <span className="font-mono text-sm text-fog-dim w-16 flex-shrink-0">
                                    {formatTime(appt.startAt)}
                                </span>
                                <span className="font-sans text-sm text-fog flex-1 min-w-0 truncate">
                                    {appt.patientName ?? (
                                        <>
                                            Patient{" "}
                                            <span className="font-mono text-fog-dim">{truncateId(appt.patientId)}</span>
                                        </>
                                    )}
                                </span>
                                <span
                                    className={cn(
                                        "flex-shrink-0 px-2 py-0.5 rounded-xs font-mono text-xs uppercase tracking-wider",
                                        appt.type === "NEW_SYMPTOM"
                                            ? "bg-cyan/10 text-cyan border border-cyan/30"
                                            : "bg-fog-dim/10 text-fog-dim border border-fog-dim/20"
                                    )}
                                >
                                    {appt.type === "NEW_SYMPTOM" ? "New" : "Follow-up"}
                                </span>
                                <span className="flex-shrink-0 font-sans text-xs text-fog-dim/60">
                                    {appt.status}
                                </span>
                                <ChevronRightIcon />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function ChevronRightIcon() {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-fog-dim/40 group-hover:text-cyan/60 transition-colors duration-150"
            aria-hidden="true"
        >
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

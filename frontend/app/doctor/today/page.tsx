"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { getUser } from "@/lib/auth";
import { getDoctorToday, type Appointment } from "@/lib/appointments";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";

import DoctorNav from "../components/DoctorNav";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DoctorTodayPage() {
    const router = useRouter();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Auth guard.
    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "DOCTOR") {
            router.replace("/login");
        }
    }, [router]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await getDoctorToday();
                if (!cancelled) setAppointments(data);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

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
                    {/* Page header */}
                    <motion.div variants={fadeUp} className="mb-8">
                        <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                            Clinician workspace
                        </p>
                        <h1 className="font-display text-3xl text-fog leading-tight">
                            Today&apos;s{" "}
                            <em className="not-italic text-cyan">appointments</em>
                        </h1>
                        <p className="font-sans text-sm text-fog-dim mt-2">
                            Upcoming appointments for today, sorted by start time.
                        </p>
                    </motion.div>

                    {/* Error */}
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

                    {/* Loading skeleton */}
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

                    {/* Empty state */}
                    {!loading && !error && appointments.length === 0 && (
                        <motion.div variants={fadeUp}>
                            <div className="flex flex-col items-center py-16 text-center gap-3">
                                <CalendarIcon />
                                <p className="font-sans text-fog-dim text-sm">
                                    No appointments booked for today.
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* Appointment list */}
                    {!loading && appointments.length > 0 && (
                        <motion.div variants={fadeUp} className="flex flex-col gap-1">
                            {appointments.map((appt) => (
                                <Link
                                    key={appt.id}
                                    href={`/doctor/visits/${appt.visitId}`}
                                    className="group flex items-center gap-4 px-4 py-3 bg-ink-well border border-ink-rim rounded-xs hover:border-cyan/40 transition-colors duration-150"
                                >
                                    {/* Time */}
                                    <span className="font-mono text-sm text-fog-dim w-16 flex-shrink-0">
                                        {formatTime(appt.startAt)}
                                    </span>

                                    {/* Patient id */}
                                    <span className="font-sans text-sm text-fog flex-1 min-w-0 truncate">
                                        Patient{" "}
                                        <span className="font-mono text-fog-dim">
                                            {truncateId(appt.patientId)}
                                        </span>
                                    </span>

                                    {/* Type badge */}
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

                                    {/* Status */}
                                    <span className="flex-shrink-0 font-sans text-xs text-fog-dim/60">
                                        {appt.status}
                                    </span>

                                    {/* Chevron */}
                                    <ChevronRightIcon />
                                </Link>
                            ))}
                        </motion.div>
                    )}
                </motion.div>
            </main>
        </>
    );
}

function CalendarIcon() {
    return (
        <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-fog-dim/30"
        >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
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

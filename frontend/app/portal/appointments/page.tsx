"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { fadeUp, staggerChildren } from "@/design/motion";
import { cn } from "@/design/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Separator } from "@/components/ui/Separator";
import { EmptyState } from "@/components/ui/EmptyState";
import { listMine, type Appointment } from "@/lib/appointments";
import { getUser } from "@/lib/auth";

const STATUS_BADGE: Record<Appointment["status"], string> = {
    BOOKED: "text-cyan border-cyan/40 bg-cyan/10",
    COMPLETED: "text-fog-dim border-ink-rim bg-ink-well",
    CANCELLED: "text-crimson border-crimson/40 bg-crimson/10",
    NO_SHOW: "text-fog-dim border-ink-rim bg-ink-well",
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
    BOOKED: "Booked",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    NO_SHOW: "No show",
};

function StatusBadge({ status }: { status: Appointment["status"] }) {
    return (
        <span
            className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-xs border font-mono text-[10px] uppercase tracking-widest",
                STATUS_BADGE[status]
            )}
        >
            {STATUS_LABEL[status]}
        </span>
    );
}

function formatDateTime(iso: string): { date: string; time: string } {
    const d = new Date(iso);
    return {
        date: d.toLocaleDateString("en-MY", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
        }),
        time: d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" }),
    };
}

function AppointmentCard({
    appointment,
    showFollowUp,
}: {
    appointment: Appointment;
    showFollowUp: boolean;
}) {
    const { date, time } = formatDateTime(appointment.startAt);

    return (
        <Card className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display text-base text-fog">{date}</span>
                    <span className="font-sans text-sm text-fog-dim">at {time}</span>
                    <StatusBadge status={appointment.status} />
                </div>
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    {appointment.type === "FOLLOW_UP" ? "Follow-up" : "New visit"}
                </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {showFollowUp && appointment.visitId && (
                    <Button asChild variant="ghost" size="sm">
                        <Link
                            href={`/portal/book/follow-up?parentVisitId=${appointment.visitId}`}
                        >
                            Book follow-up
                        </Link>
                    </Button>
                )}
                <Button asChild variant="ghost" size="sm">
                    <Link href={`/portal/appointments/${appointment.id}`}>View →</Link>
                </Button>
            </div>
        </Card>
    );
}

export default function AppointmentsPage() {
    const router = useRouter();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") {
            router.replace("/login");
            return;
        }
        listMine()
            .then((list) => {
                setAppointments(list);
                setLoaded(true);
            })
            .catch((e) => {
                setError(e instanceof Error ? e.message : "Failed to load appointments");
                setLoaded(true);
            });
    }, [router]);

    const now = Date.now();

    const upcoming = appointments
        .filter((a) => a.status === "BOOKED" && new Date(a.startAt).getTime() > now)
        .sort((a, b) => a.startAt.localeCompare(b.startAt));

    const past = appointments
        .filter((a) => !(a.status === "BOOKED" && new Date(a.startAt).getTime() > now))
        .sort((a, b) => b.startAt.localeCompare(a.startAt));

    return (
        <motion.main
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="max-w-3xl mx-auto px-6 py-10"
        >
            <motion.div variants={fadeUp} className="mb-8">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                    Patient portal
                </p>
                <h1 className="font-display text-3xl text-fog leading-tight">
                    My appointments
                </h1>
                <p className="font-sans text-sm text-fog-dim leading-relaxed mt-2">
                    Manage your upcoming and past visits. Cancel or book a follow-up
                    from here.
                </p>
            </motion.div>

            <Separator className="mb-8" />

            {/* Skeletons */}
            {!loaded && (
                <div className="flex flex-col gap-4">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                    ))}
                </div>
            )}

            {error && (
                <div className="px-4 py-3 border border-crimson/30 bg-crimson/5 rounded-sm mb-6">
                    <p className="font-sans text-sm text-crimson" role="alert">
                        {error}
                    </p>
                </div>
            )}

            {loaded && !error && (
                <motion.div variants={staggerChildren} className="flex flex-col gap-10">
                    {/* Upcoming */}
                    <motion.section variants={fadeUp}>
                        <div className="flex items-baseline justify-between mb-4">
                            <h2 className="font-sans text-sm font-medium uppercase tracking-wider text-fog">
                                Upcoming
                            </h2>
                            <span className="font-mono text-xs text-fog-dim/60">
                                {upcoming.length} scheduled
                            </span>
                        </div>

                        {upcoming.length === 0 ? (
                            <EmptyState
                                title="No upcoming appointments"
                                description="Book a new appointment after completing a pre-visit chat."
                                action={
                                    <Button asChild variant="primary" size="sm">
                                        <Link href="/previsit/new">Start pre-visit chat →</Link>
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="flex flex-col gap-3">
                                {upcoming.map((a) => (
                                    <AppointmentCard
                                        key={a.id}
                                        appointment={a}
                                        showFollowUp={false}
                                    />
                                ))}
                            </div>
                        )}
                    </motion.section>

                    {/* Past */}
                    <motion.section variants={fadeUp}>
                        <div className="flex items-baseline justify-between mb-4">
                            <h2 className="font-sans text-sm font-medium uppercase tracking-wider text-fog">
                                Past
                            </h2>
                            <span className="font-mono text-xs text-fog-dim/60">
                                {past.length} total
                            </span>
                        </div>

                        {past.length === 0 ? (
                            <EmptyState
                                title="No past appointments"
                                description="Your completed or cancelled appointments will appear here."
                            />
                        ) : (
                            <div className="flex flex-col gap-3">
                                {past.map((a) => (
                                    <AppointmentCard
                                        key={a.id}
                                        appointment={a}
                                        showFollowUp={a.status === "COMPLETED"}
                                    />
                                ))}
                            </div>
                        )}
                    </motion.section>
                </motion.div>
            )}
        </motion.main>
    );
}

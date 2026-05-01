"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getUser } from "@/lib/auth";
import { fadeUp, staggerChildren } from "@/design/motion";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import DoctorNav from "../components/DoctorNav";
import { getDoctorQueue, type DoctorQueue } from "@/lib/doctor-queue";

export default function DoctorQueuePage() {
    const router = useRouter();
    const [queue, setQueue] = useState<DoctorQueue | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "DOCTOR") {
            router.replace("/login");
            return;
        }
        getDoctorQueue()
            .then(setQueue)
            .catch((e: Error) => {
                if (e.message === "HTTP 401" || e.message === "HTTP 403") {
                    router.replace("/login");
                    return;
                }
                setError(e.message);
                setQueue({ total: 0, groups: [] });
            });
    }, [router]);

    return (
        <>
            <DoctorNav active="queue" />
            <main className="max-w-screen-xl mx-auto px-6 py-8">
                <motion.div
                    variants={staggerChildren}
                    initial="initial"
                    animate="animate"
                    className="flex flex-col"
                >
                    <motion.div variants={fadeUp} className="mb-8 flex items-baseline justify-between">
                        <div>
                            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                                Clinician workspace
                            </p>
                            <h1 className="font-display text-3xl text-fog leading-tight">
                                Awaiting <em className="not-italic text-cyan">review</em>
                            </h1>
                        </div>
                        {queue && queue.total > 0 && (
                            <p className="font-mono text-xs text-fog-dim uppercase tracking-widest">
                                {queue.total} draft{queue.total === 1 ? "" : "s"} pending
                            </p>
                        )}
                    </motion.div>

                    {error && (
                        <motion.div variants={fadeUp} className="mb-6">
                            <div
                                className="px-4 py-3 bg-crimson/10 border border-crimson/30 rounded-xs text-sm text-crimson font-sans"
                                role="alert"
                            >
                                {error}
                            </div>
                        </motion.div>
                    )}

                    {queue === null && (
                        <motion.div variants={fadeUp} className="flex flex-col gap-3">
                            {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </motion.div>
                    )}

                    {queue !== null && queue.total === 0 && !error && (
                        <motion.div variants={fadeUp}>
                            <EmptyState
                                title="Inbox zero"
                                description="No draft SOAP notes are waiting for your sign-off."
                            />
                        </motion.div>
                    )}

                    {queue !== null && queue.groups.length > 0 && (
                        <motion.div variants={fadeUp} className="flex flex-col gap-8">
                            {queue.groups.map((g) => (
                                <DayGroup key={g.date} date={g.date} count={g.count} items={g.items} />
                            ))}
                        </motion.div>
                    )}
                </motion.div>
            </main>
        </>
    );
}

function DayGroup({
    date,
    count,
    items,
}: {
    date: string;
    count: number;
    items: { visitId: string; patientName: string; subjectivePreview: string; draftedAt: string; minutesSinceDraft: number }[];
}) {
    const heading = formatDayHeading(date);
    return (
        <section>
            <header className="flex items-baseline justify-between mb-3 pb-2 border-b border-ink-rim">
                <div className="flex items-baseline gap-3">
                    <h2 className="font-display text-lg text-fog">{heading}</h2>
                    <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">{date}</p>
                </div>
                <p className="font-mono text-xs text-fog-dim uppercase tracking-widest">
                    {count} draft{count === 1 ? "" : "s"}
                </p>
            </header>
            <ul className="flex flex-col gap-2">
                {items.map((it) => (
                    <li key={it.visitId}>
                        <Link
                            href={`/doctor/visits/${it.visitId}`}
                            className="block bg-ink-well border border-ink-rim hover:border-cyan/60 rounded-sm px-4 py-3 transition-colors"
                        >
                            <div className="flex items-baseline justify-between gap-4">
                                <p className="font-display text-base text-fog">{it.patientName}</p>
                                <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest whitespace-nowrap">
                                    {formatAge(it.minutesSinceDraft)} ago
                                </p>
                            </div>
                            <p className="font-sans text-sm text-fog-dim mt-1 line-clamp-2">
                                {it.subjectivePreview || "No subjective text yet."}
                            </p>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function formatDayHeading(iso: string): string {
    const today = new Date();
    const target = new Date(iso + "T00:00:00");
    const todayKey = today.toISOString().slice(0, 10);
    const yesterdayKey = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
    if (iso === todayKey) return "Today";
    if (iso === yesterdayKey) return "Yesterday";
    return target.toLocaleDateString("en-MY", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });
}

function formatAge(minutes: number): string {
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    const days = Math.floor(hours / 24);
    return `${days} d`;
}

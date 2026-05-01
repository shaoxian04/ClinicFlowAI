"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import DoctorNav from "./components/DoctorNav";
import { NextUpCard } from "./components/NextUpCard";
import { VisitsTrendChart } from "./components/VisitsTrendChart";
import { TodayScheduleRail } from "./components/TodayScheduleRail";
import { ConditionMixDonut } from "./components/ConditionMixDonut";
import { RecentlyFinalizedStrip } from "./components/RecentlyFinalizedStrip";
import { fadeUp, staggerChildren } from "@/design/motion";
import { getUser } from "@/lib/auth";
import {
    getDoctorDashboard,
    getDoctorToday,
    type DoctorDashboard,
    type Appointment,
} from "@/lib/appointments";

export default function DoctorHome() {
    const router = useRouter();
    const [dashboard, setDashboard] = useState<DoctorDashboard | null>(null);
    const [today, setToday] = useState<Appointment[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user) { router.replace("/login"); return; }
        if (user.role !== "DOCTOR") { router.replace("/"); return; }
        Promise.all([getDoctorDashboard(), getDoctorToday()])
            .then(([d, t]) => {
                setDashboard(d);
                setToday(t);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"));
    }, [router]);

    const next =
        today.find((a) => a.status === "BOOKED" && new Date(a.startAt).getTime() > Date.now()) ?? null;

    return (
        <>
            <DoctorNav active="today" />
            <motion.main
                variants={staggerChildren}
                initial="initial"
                animate="animate"
                className="max-w-screen-xl mx-auto px-6 py-8 space-y-5"
            >
                <motion.section variants={fadeUp}>
                    <p className="font-mono text-xs text-cyan/80 uppercase tracking-widest">
                        {new Date().toLocaleDateString("en-MY", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}
                    </p>
                    <h1 className="font-display text-3xl text-fog mt-1">
                        Today, <span className="text-cyan">Dr. Demo</span>.
                    </h1>
                    <p className="font-sans text-sm text-fog-dim mt-2">
                        <strong className="text-fog">{dashboard?.kpis.awaitingReview ?? "—"}</strong> drafts to
                        review · <strong className="text-fog">{dashboard?.kpis.bookedToday ?? "—"}</strong>{" "}
                        bookings on the schedule
                    </p>
                </motion.section>

                {error && (
                    <p className="font-sans text-sm text-crimson" role="alert">
                        {error}
                    </p>
                )}

                <motion.section variants={fadeUp} className="grid grid-cols-1 md:grid-cols-9 gap-4">
                    <div className="md:col-span-5">
                        <NextUpCard next={next} />
                    </div>
                    <div className="md:col-span-4">
                        {dashboard && (
                            <VisitsTrendChart trend={dashboard.visitsTrend} delta={dashboard.trendDelta} />
                        )}
                    </div>
                </motion.section>

                <motion.section variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <KpiTile label="Awaiting review" value={dashboard?.kpis.awaitingReview} accent />
                    <KpiTile label="Today's bookings" value={dashboard?.kpis.bookedToday} />
                    <KpiTile label="Finalized this week" value={dashboard?.kpis.finalizedThisWeek} />
                    <KpiTile
                        label="Avg time-to-finalize"
                        value={
                            dashboard?.kpis.avgTimeToFinalizeMinutes != null
                                ? `${dashboard.kpis.avgTimeToFinalizeMinutes} min`
                                : "—"
                        }
                    />
                </motion.section>

                <motion.section variants={fadeUp} className="grid grid-cols-1 md:grid-cols-9 gap-4">
                    <div className="md:col-span-5">
                        <TodayScheduleRail appointments={today.filter((a) => a.status === "BOOKED")} />
                    </div>
                    <div className="md:col-span-4">
                        {dashboard && <ConditionMixDonut mix={dashboard.conditionMix} />}
                    </div>
                </motion.section>

                {dashboard && (
                    <motion.section variants={fadeUp}>
                        <RecentlyFinalizedStrip recent={dashboard.recentlyFinalized} />
                    </motion.section>
                )}
            </motion.main>
        </>
    );
}

function KpiTile({
    label,
    value,
    accent,
}: {
    label: string;
    value: number | string | undefined;
    accent?: boolean;
}) {
    return (
        <div className="border border-ink-rim rounded-sm p-3">
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">{label}</p>
            <p className={"font-display text-2xl mt-1 " + (accent ? "text-cyan" : "text-fog")}>
                {value ?? "—"}
            </p>
        </div>
    );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { fadeUp, staggerChildren } from "@/design/motion";
import { getUser } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import { getMyProfile } from "@/lib/patient-me";
import { getPatientDashboard, type PatientDashboard } from "@/lib/patient-me";
import { WhatsAppOptInModal } from "@/app/components/schedule/WhatsAppOptInModal";
import { NextAppointmentHero } from "./components/NextAppointmentHero";
import { QuickActionsRow } from "./components/QuickActionsRow";
import { HealthSnapshotStrip } from "./components/HealthSnapshotStrip";
import { VisitTimelineChart } from "./components/VisitTimelineChart";
import { VisitCard } from "./components/VisitCard";

type VisitSummary = {
    visitId: string;
    finalizedAt: string | null;
    summaryEnPreview: string;
    medicationCount: number;
    doctorName?: string | null;
};

export default function PortalHome() {
    const router = useRouter();
    const [dashboard, setDashboard] = useState<PatientDashboard | null>(null);
    const [visits, setVisits] = useState<VisitSummary[]>([]);
    const [firstName, setFirstName] = useState("there");
    const [error, setError] = useState<string | null>(null);
    const [showOptIn, setShowOptIn] = useState(false);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") {
            router.replace("/login");
            return;
        }
        const name = (user.email ?? "there").split("@")[0];
        setFirstName(name.charAt(0).toUpperCase() + name.slice(1));

        // WhatsApp opt-in modal — preserve existing behavior
        try {
            const dismissed = localStorage.getItem(`wa-optin-dismissed-${user.userId ?? user.email}`);
            if (!dismissed) {
                getMyProfile()
                    .then((me) => { if (!me.whatsappConsent) setShowOptIn(true); })
                    .catch(() => { /* fail closed */ });
            }
        } catch { /* private mode */ }

        Promise.all([getPatientDashboard(), apiGet<VisitSummary[]>("/patient/visits")])
            .then(([d, v]) => {
                setDashboard(d);
                setVisits(v.slice(0, 3));
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"));
    }, [router]);

    return (
        <>
            <motion.main
                variants={staggerChildren}
                initial="initial"
                animate="animate"
                className="max-w-3xl mx-auto px-6 py-10 space-y-5"
            >
                <motion.section variants={fadeUp}>
                    <p className="font-mono text-xs text-cyan/80 uppercase tracking-widest">Patient portal</p>
                    <h1 className="font-display text-3xl text-fog mt-1">
                        Welcome back, <span className="text-cyan">{firstName}</span>.
                    </h1>
                    {dashboard?.nextAppointment && (
                        <p className="font-sans text-sm text-fog-dim mt-2">
                            Your next visit is in{" "}
                            <strong className="text-fog">
                                {Math.max(
                                    0,
                                    Math.round(
                                        (new Date(dashboard.nextAppointment.startAt).getTime() - Date.now()) /
                                            86400000
                                    )
                                )}{" "}
                                days
                            </strong>
                            . Here&apos;s what&apos;s on deck.
                        </p>
                    )}
                </motion.section>

                {error && (
                    <p className="font-sans text-sm text-crimson" role="alert">
                        {error}
                    </p>
                )}

                <motion.section variants={fadeUp}>
                    <NextAppointmentHero next={dashboard?.nextAppointment ?? null} />
                </motion.section>

                <motion.section variants={fadeUp}>
                    <QuickActionsRow />
                </motion.section>

                <motion.section variants={fadeUp}>
                    <HealthSnapshotStrip stats={dashboard?.stats ?? null} />
                </motion.section>

                <motion.section variants={fadeUp}>
                    <VisitTimelineChart timeline={dashboard?.timeline ?? []} />
                </motion.section>

                <motion.section variants={fadeUp}>
                    <div className="flex justify-between items-baseline mb-3">
                        <h2 className="font-display text-lg text-fog">Previous consultations</h2>
                        <Link href="/portal/visits" className="font-sans text-sm text-cyan hover:underline">
                            View all →
                        </Link>
                    </div>
                    {visits.length === 0 ? (
                        <p className="font-sans text-sm text-fog-dim/60">No consultations yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {visits.map((v) => (
                                <VisitCard
                                    key={v.visitId}
                                    visitId={v.visitId}
                                    date={v.finalizedAt ?? ""}
                                    summaryPreview={v.summaryEnPreview}
                                    doctorName={v.doctorName}
                                    status="finalized"
                                />
                            ))}
                        </div>
                    )}
                </motion.section>
            </motion.main>
            {showOptIn && (
                <WhatsAppOptInModal
                    userId={(getUser()?.userId ?? getUser()?.email) ?? ""}
                    onClose={() => setShowOptIn(false)}
                />
            )}
        </>
    );
}

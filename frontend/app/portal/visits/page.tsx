"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { fadeUp, staggerChildren } from "@/design/motion";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

type VisitSummary = {
    visitId: string;
    finalizedAt: string | null;
    summaryEnPreview: string;
    medicationCount: number;
    doctorName?: string | null;
};

export default function VisitHistoryPage() {
    const router = useRouter();
    const [visits, setVisits] = useState<VisitSummary[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") {
            router.replace("/login");
            return;
        }
        apiGet<VisitSummary[]>("/patient/visits")
            .then(setVisits)
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load visits"));
    }, [router]);

    return (
        <>
            <motion.main
                variants={staggerChildren}
                initial="initial"
                animate="animate"
                className="max-w-3xl mx-auto px-6 py-10"
            >
                <motion.section variants={fadeUp}>
                    <p className="font-mono text-xs text-cyan/80 uppercase tracking-widest">Visit history</p>
                    <h1 className="font-display text-3xl text-fog mt-1">All your consultations</h1>
                    <p className="font-sans text-sm text-fog-dim mt-2">
                        Every finalized visit your doctor has signed off, newest first.
                    </p>
                </motion.section>

                {error && (
                    <motion.p variants={fadeUp} className="font-sans text-sm text-crimson mt-6" role="alert">
                        {error}
                    </motion.p>
                )}

                <motion.section variants={fadeUp} className="mt-8 space-y-3">
                    {visits.length === 0 && !error && (
                        <p className="font-sans text-sm text-fog-dim/60">No visits yet.</p>
                    )}
                    {visits.map((v) => (
                        <Link
                            key={v.visitId}
                            href={`/portal/visits/${v.visitId}`}
                            className="block border border-ink-rim bg-ink-well rounded-sm p-4 hover:border-cyan/60"
                        >
                            <div className="flex justify-between items-baseline">
                                <p className="font-display text-base text-fog">
                                    {v.finalizedAt
                                        ? new Date(v.finalizedAt).toLocaleDateString("en-MY", {
                                              day: "numeric",
                                              month: "long",
                                              year: "numeric",
                                          })
                                        : "Pending"}
                                </p>
                                <span className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                                    {v.medicationCount} med{v.medicationCount === 1 ? "" : "s"}
                                </span>
                            </div>
                            <p className="font-sans text-sm text-fog-dim mt-1 line-clamp-2">
                                {v.summaryEnPreview || "Summary will appear once the doctor finalizes this visit."}
                            </p>
                        </Link>
                    ))}
                </motion.section>
            </motion.main>
        </>
    );
}

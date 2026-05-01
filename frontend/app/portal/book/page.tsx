"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

import { fadeUp, staggerChildren } from "@/design/motion";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Separator";
import { AvailabilityCalendar } from "@/app/components/schedule/AvailabilityCalendar";
import { bookAppointment, type Slot } from "@/lib/appointments";
import { getUser } from "@/lib/auth";

export default function BookPage() {
    const router = useRouter();
    const params = useSearchParams();
    const visitId = params.get("visitId");

    const [selected, setSelected] = useState<Slot | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { from, to } = useMemo(() => {
        const t = new Date();
        const fromStr = t.toISOString().slice(0, 10);
        const e = new Date(t);
        e.setDate(e.getDate() + 13); // 14-day window inclusive
        const toStr = e.toISOString().slice(0, 10);
        return { from: fromStr, to: toStr };
    }, []);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") router.replace("/login");
    }, [router]);

    if (!visitId) {
        return (
            <div className="max-w-3xl mx-auto px-6 py-12">
                <p className="font-sans text-sm text-crimson">
                    Missing visit context. Please complete a pre-visit chat first.
                </p>
                <Link
                    href="/portal"
                    className="font-sans text-sm text-cyan hover:underline mt-4 inline-block"
                >
                    ← Back to portal
                </Link>
            </div>
        );
    }

    async function confirm() {
        if (!selected || !visitId) return;
        setBusy(true);
        setError(null);
        try {
            const apptId = await bookAppointment({
                slotId: selected.id,
                type: "NEW_SYMPTOM",
                visitId,
            });
            router.push(`/portal/appointments/${apptId}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Booking failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <motion.main
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="max-w-5xl mx-auto px-6 py-10"
        >
            <motion.div variants={fadeUp}>
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                    Book appointment
                </p>
                <h1 className="font-display text-3xl text-fog leading-tight">
                    Pick a time that works for you
                </h1>
                <p className="font-sans text-sm text-fog-dim leading-relaxed mt-2">
                    Slots refresh every minute. Confirmation will be sent via WhatsApp
                    if you&apos;ve consented.
                </p>
            </motion.div>

            <Separator className="my-8" />

            <motion.div variants={fadeUp}>
                <AvailabilityCalendar from={from} to={to} onSelect={setSelected} />
            </motion.div>

            {selected && (
                <SlotConfirmModal
                    slot={selected}
                    busy={busy}
                    error={error}
                    onConfirm={confirm}
                    onCancel={() => {
                        setSelected(null);
                        setError(null);
                    }}
                />
            )}
        </motion.main>
    );
}

function SlotConfirmModal({
    slot,
    busy,
    error,
    onConfirm,
    onCancel,
}: {
    slot: Slot;
    busy: boolean;
    error: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const start = new Date(slot.startAt);
    const date = start.toLocaleDateString("en-MY", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
    const time = start.toLocaleTimeString("en-MY", {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm px-4"
            role="dialog"
            aria-modal="true"
        >
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-md bg-ink-well border border-ink-rim rounded-sm p-6"
            >
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                    Confirm booking
                </p>
                <h2 className="font-display text-xl text-fog leading-tight">{date}</h2>
                <p className="font-sans text-sm text-fog-dim mt-1">at {time}</p>

                {error && (
                    <p className="font-sans text-sm text-crimson mt-3" role="alert">
                        {error}
                    </p>
                )}

                <div className="flex gap-2 mt-6">
                    <Button
                        onClick={onConfirm}
                        loading={busy}
                        variant="primary"
                        className="flex-1"
                    >
                        Confirm booking
                    </Button>
                    <Button onClick={onCancel} variant="ghost" className="flex-1">
                        Pick different slot
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}

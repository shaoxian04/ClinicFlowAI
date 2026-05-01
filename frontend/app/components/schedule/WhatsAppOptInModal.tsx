"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/Button";
import { apiPutVoid } from "@/lib/api";

type Props = {
    userId: string;
    onClose: () => void;
};

export function WhatsAppOptInModal({ userId, onClose }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsPhone, setNeedsPhone] = useState(false);

    function dismiss() {
        try {
            localStorage.setItem(`wa-optin-dismissed-${userId}`, "1");
        } catch { /* private mode */ }
        onClose();
    }

    async function optIn() {
        setBusy(true);
        setError(null);
        setNeedsPhone(false);
        try {
            await apiPutVoid("/patients/me/whatsapp-consent", { consent: true });
            dismiss();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Couldn't enable reminders.";
            // The PatientWriteAppService maps "phone required..." IllegalStateException
            // → BusinessException(BAD_REQUEST). Surface the message and the profile link.
            if (/phone/i.test(msg)) {
                setNeedsPhone(true);
            } else {
                setError(msg);
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 backdrop-blur-sm px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-modal-title"
        >
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="w-full max-w-md bg-ink-well border border-ink-rim rounded-sm p-6"
            >
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                    WhatsApp reminders
                </p>
                <h2 id="wa-modal-title" className="font-display text-xl text-fog leading-tight">
                    Stay on top of your visits
                </h2>
                <p className="font-sans text-sm text-fog-dim leading-relaxed mt-3">
                    We can send appointment confirmations, medication instructions, and follow-up
                    reminders to your WhatsApp. You can withdraw consent any time in profile settings.
                </p>

                {needsPhone && (
                    <p className="font-sans text-sm text-fog-dim mt-4 p-3 bg-obsidian/40 border border-ink-rim rounded-xs">
                        Please add a phone number first.{" "}
                        <Link href="/portal/profile" className="text-cyan hover:underline" onClick={dismiss}>
                            Go to profile →
                        </Link>
                    </p>
                )}
                {error && (
                    <p className="font-sans text-sm text-crimson mt-3" role="alert">{error}</p>
                )}

                <div className="flex gap-2 mt-6">
                    <Button onClick={optIn} loading={busy} variant="primary" className="flex-1">
                        Yes, send me reminders
                    </Button>
                    <Button onClick={dismiss} variant="ghost" className="flex-1">
                        Maybe later
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}

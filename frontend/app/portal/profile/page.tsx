"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { fadeUp, staggerChildren } from "@/design/motion";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Separator } from "@/components/ui/Separator";
import { apiPutVoid } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/patient-me";

const PHONE_RE = /^\+?[0-9]{6,20}$/;

export default function ProfilePage() {
    const router = useRouter();
    const [phone, setPhone] = useState("");
    const [whatsappOn, setWhatsappOn] = useState(false);
    const [phoneSaved, setPhoneSaved] = useState<string | null>(null);
    const [busyPhone, setBusyPhone] = useState(false);
    const [busyConsent, setBusyConsent] = useState(false);
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [consentError, setConsentError] = useState<string | null>(null);
    const [phoneToast, setPhoneToast] = useState<string | null>(null);
    const [consentToast, setConsentToast] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") router.replace("/login");
    }, [router]);

    useEffect(() => {
        let cancelled = false;
        getMyProfile()
            .then((me) => {
                if (cancelled) return;
                if (me.phone) {
                    setPhone(me.phone);
                    setPhoneSaved(me.phone);
                }
                setWhatsappOn(me.whatsappConsent);
            })
            .catch(() => {
                // Silently ignore — first-load, blank form is fine
            });
        return () => { cancelled = true; };
    }, []);

    async function savePhone(e: React.FormEvent) {
        e.preventDefault();
        setPhoneError(null);
        setPhoneToast(null);
        const trimmed = phone.trim();
        if (trimmed && !PHONE_RE.test(trimmed)) {
            setPhoneError("Use E.164 format, e.g. +60 12 345 6789.");
            return;
        }
        setBusyPhone(true);
        try {
            await apiPutVoid("/patients/me/phone", { phone: trimmed || null });
            setPhoneSaved(trimmed);
            setPhoneToast(trimmed ? "Phone updated." : "Phone cleared.");
        } catch (err) {
            setPhoneError(err instanceof Error ? err.message : "Failed to save phone.");
        } finally {
            setBusyPhone(false);
        }
    }

    async function toggleConsent(next: boolean) {
        setConsentError(null);
        setConsentToast(null);
        if (next && !phoneSaved) {
            setConsentError("Please save a phone number first.");
            return;
        }
        setBusyConsent(true);
        try {
            await apiPutVoid("/patients/me/whatsapp-consent", { consent: next });
            setWhatsappOn(next);
            setConsentToast(next ? "WhatsApp reminders on." : "WhatsApp reminders off.");
        } catch (err) {
            setConsentError(err instanceof Error ? err.message : "Failed to update consent.");
        } finally {
            setBusyConsent(false);
        }
    }

    return (
        <motion.div
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="max-w-2xl mx-auto px-6 py-10"
        >
            <motion.div variants={fadeUp}>
                <Link href="/portal" className="font-sans text-sm text-fog-dim hover:text-cyan inline-flex items-center gap-1.5">
                    <span aria-hidden="true">←</span> Back to portal
                </Link>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-8">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                    Profile
                </p>
                <h1 className="font-display text-3xl text-fog leading-tight">
                    Phone &amp; WhatsApp preferences
                </h1>
                <p className="font-sans text-sm text-fog-dim leading-relaxed mt-2">
                    We use your phone only to send appointment reminders. You can withdraw consent any time.
                </p>
            </motion.div>

            <Separator className="my-8" />

            <motion.form variants={fadeUp} onSubmit={savePhone} className="space-y-5">
                <Field label="Phone number" hint="E.164 format with leading +" htmlFor="phone">
                    <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+60 12 345 6789"
                        type="tel"
                    />
                </Field>
                {phoneError && (
                    <p className="font-sans text-sm text-crimson" role="alert">
                        {phoneError}
                    </p>
                )}
                {phoneToast && (
                    <p className="font-sans text-sm text-cyan">{phoneToast}</p>
                )}
                <Button type="submit" loading={busyPhone} variant="primary">
                    Save phone
                </Button>
            </motion.form>

            <Separator className="my-10" />

            <motion.div variants={fadeUp}>
                <p className="font-sans text-sm text-fog leading-relaxed">
                    WhatsApp reminders
                </p>
                <p className="font-sans text-xs text-fog-dim mt-1 mb-4">
                    Appointment confirmations, medication summaries, and follow-up reminders.
                </p>
                <ConsentToggle
                    on={whatsappOn}
                    disabled={!phoneSaved || busyConsent}
                    onChange={toggleConsent}
                />
                {consentError && (
                    <p className="font-sans text-sm text-crimson mt-3" role="alert">
                        {consentError}
                    </p>
                )}
                {consentToast && (
                    <p className="font-sans text-sm text-cyan mt-3">{consentToast}</p>
                )}
            </motion.div>
        </motion.div>
    );
}

function ConsentToggle({
    on,
    disabled,
    onChange,
}: {
    on: boolean;
    disabled: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(!on)}
            className={
                "inline-flex items-center gap-3 px-3 py-2 rounded-sm border border-ink-rim bg-ink-well " +
                "hover:border-cyan/60 hover:ring-1 hover:ring-cyan/40 transition-colors " +
                "disabled:opacity-50 disabled:cursor-not-allowed"
            }
        >
            <span
                className={
                    "inline-block w-9 h-5 rounded-sm border border-ink-rim relative transition-colors " +
                    (on ? "bg-cyan/40" : "bg-ink-well")
                }
                aria-hidden="true"
            >
                <span
                    className={
                        "absolute top-0.5 h-3.5 w-3.5 rounded-xs bg-fog transition-all " +
                        (on ? "left-[calc(100%-1rem-2px)]" : "left-0.5")
                    }
                />
            </span>
            <span className="font-sans text-sm text-fog">
                {on ? "On" : "Off"}
            </span>
        </button>
    );
}

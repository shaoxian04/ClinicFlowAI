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
import {
    getMyClinicalProfile,
    updateMyClinicalProfile,
    type AllergyItem,
    type ConditionItem,
    type MedicationItem,
} from "@/lib/patient-clinical-profile";

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

    // Medical history (allergies, conditions, regular medications)
    const [patientId, setPatientId] = useState<string | null>(null);
    const [allergiesText, setAllergiesText] = useState("");
    const [conditionsText, setConditionsText] = useState("");
    const [medicationsText, setMedicationsText] = useState("");
    const [busyHistory, setBusyHistory] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [historyToast, setHistoryToast] = useState<string | null>(null);
    const [historyUpdatedAt, setHistoryUpdatedAt] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") router.replace("/login");
    }, [router]);

    useEffect(() => {
        let cancelled = false;
        getMyProfile()
            .then(async (me) => {
                if (cancelled) return;
                if (me.phone) {
                    setPhone(me.phone);
                    setPhoneSaved(me.phone);
                }
                setWhatsappOn(me.whatsappConsent);
                setPatientId(me.patientId);
                try {
                    const cp = await getMyClinicalProfile(me.patientId);
                    if (cancelled) return;
                    setAllergiesText((cp.drugAllergies ?? []).map((a) => a.name).join(", "));
                    setConditionsText((cp.chronicConditions ?? []).map((c) => c.name).join(", "));
                    setMedicationsText(formatMedications(cp.regularMedications ?? []));
                    setHistoryUpdatedAt(
                        latestUpdatedAt(
                            cp.drugAllergiesUpdatedAt,
                            cp.chronicConditionsUpdatedAt,
                            cp.regularMedicationsUpdatedAt,
                        ),
                    );
                } catch {
                    // First-time profile — empty form is fine.
                }
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

    async function saveMedicalHistory(e: React.FormEvent) {
        e.preventDefault();
        setHistoryError(null);
        setHistoryToast(null);
        if (!patientId) {
            setHistoryError("Profile not loaded yet — please refresh.");
            return;
        }
        const drugAllergies: AllergyItem[] = parseCommaList(allergiesText)
            .map((name) => ({ name, severity: "UNKNOWN" }));
        const chronicConditions: ConditionItem[] = parseCommaList(conditionsText)
            .map((name) => ({ name }));
        const regularMedications: MedicationItem[] = parseMedications(medicationsText);
        setBusyHistory(true);
        try {
            await updateMyClinicalProfile(patientId, {
                drugAllergies, chronicConditions, regularMedications,
            });
            setHistoryToast("Medical history updated.");
            setHistoryUpdatedAt(new Date().toISOString());
        } catch (err) {
            setHistoryError(err instanceof Error ? err.message : "Failed to save medical history.");
        } finally {
            setBusyHistory(false);
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
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                    Medical history
                </p>
                <h2 className="font-display text-xl text-fog leading-tight">
                    Allergies, conditions, regular medications
                </h2>
                <p className="font-sans text-sm text-fog-dim leading-relaxed mt-2">
                    Helps your doctor&apos;s AI assistant flag drug interactions, allergy collisions, and dose risks
                    before any prescription is finalised. Updates take effect on your next visit.
                </p>
                {historyUpdatedAt && (
                    <p className="font-mono text-xs text-fog-dim/60 mt-2">
                        Last updated {new Date(historyUpdatedAt).toLocaleString()}
                    </p>
                )}
            </motion.div>

            <motion.form variants={fadeUp} onSubmit={saveMedicalHistory} className="space-y-5 mt-6">
                <Field
                    label="Drug allergies"
                    hint="Comma-separated, e.g. Penicillin, Aspirin, Peanuts"
                    htmlFor="allergies"
                >
                    <Input
                        id="allergies"
                        value={allergiesText}
                        onChange={(e) => setAllergiesText(e.target.value)}
                        placeholder="Penicillin, Aspirin"
                    />
                </Field>
                <Field
                    label="Chronic conditions"
                    hint="Comma-separated, e.g. Type 2 Diabetes, Hypertension"
                    htmlFor="conditions"
                >
                    <Input
                        id="conditions"
                        value={conditionsText}
                        onChange={(e) => setConditionsText(e.target.value)}
                        placeholder="Type 2 Diabetes, Hypertension"
                    />
                </Field>
                <Field
                    label="Regular medications"
                    hint="Comma-separated. Optional dose/frequency in parens, e.g. Metformin (500mg, BD), Atorvastatin (20mg, ON)"
                    htmlFor="medications"
                >
                    <Input
                        id="medications"
                        value={medicationsText}
                        onChange={(e) => setMedicationsText(e.target.value)}
                        placeholder="Metformin (500mg, BD), Atorvastatin"
                    />
                </Field>
                {historyError && (
                    <p className="font-sans text-sm text-crimson" role="alert">
                        {historyError}
                    </p>
                )}
                {historyToast && (
                    <p className="font-sans text-sm text-cyan">{historyToast}</p>
                )}
                <Button type="submit" loading={busyHistory} variant="primary" disabled={!patientId}>
                    Save medical history
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

function parseCommaList(raw: string): string[] {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// Split on commas at paren-depth 0 only, so "Metformin (500mg, BD)"
// stays as a single chunk.
function splitTopLevelCommas(raw: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let buf = "";
    for (const ch of raw) {
        if (ch === "(") { depth++; buf += ch; continue; }
        if (ch === ")") { if (depth > 0) depth--; buf += ch; continue; }
        if (ch === "," && depth === 0) {
            const t = buf.trim();
            if (t) out.push(t);
            buf = "";
            continue;
        }
        buf += ch;
    }
    const tail = buf.trim();
    if (tail) out.push(tail);
    return out;
}

// "Metformin (500mg, BD)" → { name: "Metformin", dose: "500mg", frequency: "BD" }
// "Atorvastatin"          → { name: "Atorvastatin" }
function parseMedications(raw: string): MedicationItem[] {
    const items: MedicationItem[] = [];
    for (const chunk of splitTopLevelCommas(raw)) {
        const m = chunk.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
        if (!m) {
            items.push({ name: chunk });
            continue;
        }
        const name = m[1].trim();
        const inside = m[2].split(",").map((s) => s.trim()).filter(Boolean);
        const med: MedicationItem = { name };
        if (inside[0]) med.dose = inside[0];
        if (inside[1]) med.frequency = inside[1];
        items.push(med);
    }
    return items;
}

function formatMedications(items: MedicationItem[]): string {
    return items.map((m) => {
        const inside = [m.dose, m.frequency].filter(Boolean).join(", ");
        return inside ? `${m.name} (${inside})` : m.name;
    }).join(", ");
}

function latestUpdatedAt(...timestamps: (string | null)[]): string | null {
    const valid = timestamps.filter((t): t is string => Boolean(t));
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
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

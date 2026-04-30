"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { apiPost } from "../../../lib/api";
import { saveAuth, type AuthUser } from "../../../lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Separator } from "@/components/ui/Separator";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";

type RegisterResponse = AuthUser & { token: string; patientId: string };

const CONSENT_VERSION = "v1";

const SELECT_CLASSES =
  "h-10 w-full rounded-sm border border-ink-rim bg-ink-well px-3 text-sm font-sans text-fog focus:outline-none focus:ring-1 focus:ring-cyan/40 disabled:opacity-50 appearance-none";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"" | "MALE" | "FEMALE" | "OTHER">("");
  const [nationalId, setNationalId] = useState("");
  const [language, setLanguage] = useState<"en" | "ms" | "zh">("en");
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Please accept the privacy notice to continue.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const clinicalBaseline: Record<string, unknown> = {};
      const allergyList = allergies
        .split(",").map((s) => s.trim()).filter(Boolean)
        .map((name) => ({ name, severity: "UNKNOWN" }));
      if (allergyList.length) clinicalBaseline.drugAllergies = allergyList;
      const conditionList = conditions
        .split(",").map((s) => s.trim()).filter(Boolean)
        .map((name) => ({ name }));
      if (conditionList.length) clinicalBaseline.chronicConditions = conditionList;

      const data = await apiPost<RegisterResponse>("/auth/register/patient", {
        email,
        password,
        fullName,
        dateOfBirth: dob || null,
        gender: gender || null,
        phone: phone || null,
        preferredLanguage: language,
        nationalId: nationalId || null,
        consentVersion: CONSENT_VERSION,
        clinicalBaseline: Object.keys(clinicalBaseline).length ? clinicalBaseline : null,
      });
      const { token, patientId: _patientId, ...user } = data;
      saveAuth(token, user);
      router.replace("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-obsidian flex flex-col">
      <div className="h-[2px] bg-cyan w-full" aria-hidden="true" />

      <div className="max-w-md mx-auto w-full px-6 pt-8">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-fog-dim hover:text-cyan transition-colors duration-150"
        >
          <span aria-hidden="true">←</span>
          Back to sign in
        </Link>
      </div>

      <div className="flex-1 flex items-start justify-center px-6 pt-10 pb-16">
        <motion.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="w-full max-w-md"
        >
          <motion.div variants={fadeUp} className="mb-8">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
              New patient
            </p>
            <h1 className="font-display text-3xl text-fog leading-tight">
              Create your CliniFlow account
            </h1>
            <p className="font-sans text-sm text-fog-dim leading-relaxed mt-2">
              We collect a small amount of clinical context now so the pre-visit assistant
              can tailor your visit. You can fill in more later — or the AI will ask.
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className={cn(
              "bg-ink-well border border-ink-rim rounded-sm p-6",
              "shadow-card"
            )}
          >
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Field label="Full name" htmlFor="reg-name">
                <Input id="reg-name" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} required maxLength={255} />
              </Field>

              <Field label="Email" htmlFor="reg-email">
                <Input id="reg-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </Field>

              <Field label="Password" hint="At least 8 characters" htmlFor="reg-pwd">
                <Input id="reg-pwd" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password" required minLength={8} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of birth" htmlFor="reg-dob">
                  <Input id="reg-dob" type="date" value={dob}
                    onChange={(e) => setDob(e.target.value)} />
                </Field>
                <Field label="Gender" htmlFor="reg-gender">
                  <select id="reg-gender" className={SELECT_CLASSES}
                    value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
                    <option value="">—</option>
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
              </div>

              <Field label="Phone" hint="Optional, e.g. +60123456789" htmlFor="reg-phone">
                <Input id="reg-phone" value={phone}
                  onChange={(e) => setPhone(e.target.value)} maxLength={20} />
              </Field>

              <Field label="NRIC / National ID" hint="Optional" htmlFor="reg-nric">
                <Input id="reg-nric" value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)} maxLength={32}
                  placeholder="e.g. 850501-10-1234" />
              </Field>

              <Field label="Preferred language" htmlFor="reg-lang">
                <select id="reg-lang" className={SELECT_CLASSES}
                  value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
                  <option value="en">English</option>
                  <option value="ms">Bahasa Malaysia</option>
                  <option value="zh">中文</option>
                </select>
              </Field>

              <Separator className="my-1" />

              <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                Clinical baseline · optional
              </p>

              <Field label="Drug allergies" hint="Comma-separated" htmlFor="reg-allergies">
                <Input id="reg-allergies" value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="penicillin, sulfa" />
              </Field>

              <Field label="Chronic conditions" hint="Comma-separated" htmlFor="reg-conditions">
                <Input id="reg-conditions" value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder="hypertension, diabetes" />
              </Field>

              <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
                <input type="checkbox" checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded-xs border border-ink-rim bg-ink-well accent-cyan focus:outline-none focus:ring-1 focus:ring-cyan/40"
                  required />
                <span className="font-sans text-xs text-fog-dim leading-relaxed">
                  I agree to CliniFlow&apos;s{" "}
                  <Link href="/privacy" className="text-cyan hover:underline">
                    privacy notice
                  </Link>
                  {" "}and consent to my health data being processed under PDPA.
                </span>
              </label>

              {error && (
                <p className="text-sm text-crimson font-sans" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={busy}
                className="mt-1 w-full"
              >
                Create account
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-fog-dim">
              Already registered?{" "}
              <Link href="/login" className="text-cyan hover:underline">
                Sign in
              </Link>
            </p>
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="text-center mt-5 font-sans text-xs text-fog-dim/60"
          >
            <Link
              href="/privacy"
              className="hover:text-cyan transition-colors duration-150"
            >
              Privacy policy
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}

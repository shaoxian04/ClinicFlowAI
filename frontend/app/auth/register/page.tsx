"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiPost } from "../../../lib/api";
import { saveAuth, type AuthUser } from "../../../lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

type RegisterResponse = AuthUser & { token: string; patientId: string };

const CONSENT_VERSION = "v1";

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
      setError("You must accept the privacy notice to register.");
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
        .split(",").map(s => s.trim()).filter(Boolean)
        .map(name => ({ name, severity: "UNKNOWN" }));
      if (allergyList.length) clinicalBaseline.drugAllergies = allergyList;
      const conditionList = conditions
        .split(",").map(s => s.trim()).filter(Boolean)
        .map(name => ({ name }));
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
      const { token, patientId, ...user } = data;
      saveAuth(token, user);
      router.replace("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-xl bg-white shadow-md rounded-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900">Create your CliniFlow account</h1>
        <p className="mt-2 text-sm text-slate-600">
          We collect a small amount of clinical context now so the AI can tailor your visit.
          You can fill in more later, or the pre-visit assistant will ask you.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Field label="Full name">
            <Input value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={255} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password (at least 8 chars)">
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of birth">
              <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </Field>
            <Field label="Gender">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={gender} onChange={e => setGender(e.target.value as typeof gender)}>
                <option value="">—</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
          </div>
          <Field label="Phone (optional, +60xxxxxxxxx)">
            <Input value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} />
          </Field>
          <Field label="NRIC / National ID (optional)">
            <Input value={nationalId} onChange={e => setNationalId(e.target.value)} maxLength={32}
              placeholder="e.g. 850501-10-1234" />
          </Field>
          <Field label="Preferred language">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={language} onChange={e => setLanguage(e.target.value as typeof language)}>
              <option value="en">English</option>
              <option value="ms">Bahasa Malaysia</option>
              <option value="zh">中文</option>
            </select>
          </Field>
          <hr className="my-2" />
          <p className="text-sm font-medium text-slate-700">Clinical baseline (optional)</p>
          <Field label="Drug allergies (comma-separated)">
            <Input value={allergies} onChange={e => setAllergies(e.target.value)}
              placeholder="penicillin, sulfa" />
          </Field>
          <Field label="Chronic conditions (comma-separated)">
            <Input value={conditions} onChange={e => setConditions(e.target.value)}
              placeholder="hypertension, diabetes" />
          </Field>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
              className="mt-1" required />
            <span>
              I agree to CliniFlow's{" "}
              <Link href="/privacy" className="text-blue-600 underline">privacy notice</Link>
              {" "}and consent to my health data being processed under PDPA.
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-sm text-slate-600 text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

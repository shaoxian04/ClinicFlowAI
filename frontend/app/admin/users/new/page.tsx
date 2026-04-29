"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiPost } from "../../../../lib/api";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

type CreatedUser = { userId: string; role: string; tempPassword?: string };

export default function CreateUserPage() {
  const router = useRouter();
  const [role, setRole] = useState<"STAFF" | "DOCTOR" | "ADMIN">("STAFF");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [mmcNumber, setMmcNumber] = useState("");
  const [specialty, setSpecialty] = useState("General Practice");
  const [signatureImageUrl, setSignatureImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreatedUser | null>(null);
  const [busy, setBusy] = useState(false);

  function generatePassword() {
    const r = Math.random().toString(36).slice(2, 14) + "Aa1!";
    setTempPassword(r);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (tempPassword.length < 12) {
      setError("Temporary password must be at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        role, email, tempPassword, fullName, phone: phone || null
      };
      if (role === "STAFF") body.employeeId = employeeId || null;
      if (role === "DOCTOR") {
        body.mmcNumber = mmcNumber;
        body.specialty = specialty;
        body.signatureImageUrl = signatureImageUrl || null;
      }
      const data = await apiPost<CreatedUser>("/admin/users", body);
      setSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create user failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Create user</h1>
          <Button variant="secondary" onClick={() => router.push("/admin")}>Back</Button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Role">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={role} onChange={e => setRole(e.target.value as typeof role)}>
              <option value="STAFF">Staff / Receptionist</option>
              <option value="DOCTOR">Doctor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field label="Full name">
            <Input value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={255} />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} />
          </Field>
          {role === "STAFF" && (
            <Field label="Employee ID (optional)">
              <Input value={employeeId} onChange={e => setEmployeeId(e.target.value)} maxLength={32} />
            </Field>
          )}
          {role === "DOCTOR" && (
            <>
              <Field label="MMC Number">
                <Input value={mmcNumber} onChange={e => setMmcNumber(e.target.value)} required maxLength={32} />
              </Field>
              <Field label="Specialty">
                <Input value={specialty} onChange={e => setSpecialty(e.target.value)} required maxLength={64} />
              </Field>
              <Field label="Signature image URL (optional)">
                <Input value={signatureImageUrl} onChange={e => setSignatureImageUrl(e.target.value)}
                  maxLength={512} />
              </Field>
            </>
          )}
          <Field label="Temporary password (≥12 chars)">
            <div className="flex gap-2">
              <Input value={tempPassword} onChange={e => setTempPassword(e.target.value)}
                minLength={12} required />
              <Button type="button" variant="secondary" onClick={generatePassword}>Generate</Button>
            </div>
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && (
            <div className="border border-green-300 bg-green-50 rounded-md p-4">
              <p className="text-sm font-medium text-green-800">User created — id {success.userId}</p>
              <p className="mt-1 text-xs text-green-700">
                Hand the user this temporary password. They will be required to change it on first login.
              </p>
              <code className="mt-2 block bg-white border border-green-200 rounded px-2 py-1 text-sm">
                {tempPassword}
              </code>
            </div>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create user"}
          </Button>
        </form>
      </div>
    </div>
  );
}

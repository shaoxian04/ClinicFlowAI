"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { apiPostVoid } from "../../../lib/api";
import { getUser } from "../../../lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await apiPostVoid("/auth/forced-password-change", {
        currentPassword,
        newPassword,
      });
      const user = getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      if (user.role === "DOCTOR") router.replace("/doctor");
      else if (user.role === "STAFF") router.replace("/staff");
      else if (user.role === "ADMIN") router.replace("/admin");
      else router.replace("/portal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-8">
        <h1 className="text-2xl font-bold text-slate-900">Change your password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your administrator gave you a temporary password. Choose a new one before continuing.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Current (temporary) password">
            <Input type="password" value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)} required />
          </Field>
          <Field label="New password (at least 12 chars)">
            <Input type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} minLength={12} required />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)} minLength={12} required />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </div>
    </div>
  );
}

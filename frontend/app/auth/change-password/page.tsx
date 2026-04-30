"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { apiPostVoid } from "../../../lib/api";
import { getUser, clearAuth } from "../../../lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";

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

  function onCancel() {
    clearAuth();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-obsidian flex flex-col">
      <div className="h-[2px] bg-cyan w-full" aria-hidden="true" />

      <div className="flex-1 flex items-start justify-center px-6 pt-16 pb-16">
        <motion.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="w-full max-w-sm"
        >
          <motion.div variants={fadeUp} className="mb-8">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
              First-login security
            </p>
            <h1 className="font-display text-3xl text-fog leading-tight">
              Set a new password
            </h1>
            <p className="font-sans text-sm text-fog-dim leading-relaxed mt-2">
              Your administrator handed you a temporary password. Choose a permanent one
              before continuing — at least 12 characters.
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
              <Field label="Current (temporary) password" htmlFor="cp-current">
                <Input id="cp-current" type="password" value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password" required />
              </Field>

              <Field label="New password" hint="At least 12 characters" htmlFor="cp-new">
                <Input id="cp-new" type="password" value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password" minLength={12} required />
              </Field>

              <Field label="Confirm new password" htmlFor="cp-confirm">
                <Input id="cp-confirm" type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password" minLength={12} required />
              </Field>

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
                Save new password
              </Button>

              <button
                type="button"
                onClick={onCancel}
                className="font-sans text-xs text-fog-dim/60 hover:text-cyan transition-colors duration-150 mt-1"
              >
                Cancel and sign out
              </button>
            </form>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

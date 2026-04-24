"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { apiPost } from "../../lib/api";
import { saveAuth, type AuthUser } from "../../lib/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Separator } from "@/components/ui/Separator";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";

type LoginResponse = AuthUser & { token: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("patient@demo.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await apiPost<LoginResponse>("/auth/login", { email, password });
      const { token, ...user } = data;
      saveAuth(token, user);
      if (user.role === "PATIENT") router.replace("/portal");
      else if (user.role === "DOCTOR") router.replace("/doctor");
      else if (user.role === "STAFF") router.replace("/staff");
      else if (user.role === "ADMIN") router.replace("/admin");
      else router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Top hairline accent */}
      <div className="h-[2px] bg-oxblood w-full" aria-hidden="true" />

      {/* Back link row */}
      <div className="max-w-sm mx-auto w-full px-6 pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-ink-soft hover:text-oxblood transition-colors duration-150"
        >
          <span aria-hidden="true">←</span>
          Back home
        </Link>
      </div>

      {/* Centered card area */}
      <div className="flex-1 flex items-start justify-center px-6 pt-12 pb-16">
        <motion.div
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="w-full max-w-sm"
        >
          {/* Header */}
          <motion.div variants={fadeUp} className="mb-8">
            <p className="font-mono text-xs text-ink-soft/60 uppercase tracking-widest mb-3">
              Welcome back
            </p>
            <h1 className="font-display text-3xl text-ink leading-tight">
              Sign in to CliniFlow
            </h1>
            <p className="font-sans text-sm text-ink-soft leading-relaxed mt-2">
              One sign-in for all three phases of the visit — pre-visit, consultation, and summary.
            </p>
          </motion.div>

          {/* Form card */}
          <motion.div
            variants={fadeUp}
            className={cn(
              "bg-paper border border-hairline rounded-sm p-6",
              "shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            )}
          >
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Field label="Email" htmlFor="login-email">
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>

              <Field label="Password" htmlFor="login-password">
                <Input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>

              {error && (
                <p className="text-sm text-crimson font-sans mt-1" role="alert">
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
                Sign in
              </Button>
            </form>

            <Separator className="mt-5 mb-4" />

            {/* Demo credentials */}
            <details className="group">
              <summary className="font-sans text-xs text-ink-soft/60 cursor-pointer hover:text-ink-soft transition-colors duration-150 select-none list-none flex items-center gap-1.5">
                <span
                  className="font-mono inline-block transition-transform duration-150 group-open:rotate-90"
                  aria-hidden="true"
                >
                  ▶
                </span>
                Demo credentials
              </summary>
              <div className="mt-3 flex flex-col gap-1.5 pl-4 border-l border-hairline">
                <p className="font-sans text-xs text-ink-soft">
                  Demo patient:{" "}
                  <code className="font-mono text-ink bg-bone px-1 rounded-xs">
                    patient@demo.local
                  </code>
                </p>
                <p className="font-sans text-xs text-ink-soft">
                  Demo doctor:{" "}
                  <code className="font-mono text-ink bg-bone px-1 rounded-xs">
                    doctor@demo.local
                  </code>
                </p>
                <p className="font-sans text-xs text-ink-soft">
                  Password for both:{" "}
                  <code className="font-mono text-ink bg-bone px-1 rounded-xs">
                    password
                  </code>
                </p>
              </div>
            </details>
          </motion.div>

          {/* Footer note */}
          <motion.p
            variants={fadeUp}
            className="text-center mt-5 font-sans text-xs text-ink-soft/60"
          >
            <Link
              href="/privacy"
              className="hover:text-oxblood transition-colors duration-150"
            >
              Privacy policy
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}

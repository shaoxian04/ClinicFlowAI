"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiPost } from "../../lib/api";
import { saveAuth, type AuthUser } from "../../lib/auth";

type LoginResponse = AuthUser & { token: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("patient@demo.local");
  const [password, setPassword] = useState("password");
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
      else router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <Link href="/" className="back-to-home">← Back home</Link>
      <span className="eyebrow">Welcome back</span>
      <h1 className="auth-title">
        Sign in to <em>CliniFlow</em>
      </h1>
      <p className="auth-sub">
        Clinicians draft and sign. Patients read their summaries. One sign-in for all three phases of the visit.
      </p>

      <section className="auth-card" data-delay="1">
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "14px" }}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: 4 }}>
            {busy ? "Signing in…" : "Sign in →"}
          </button>
          {error && <div className="banner banner-error">{error}</div>}
        </form>

        <div className="auth-meta">
          <span>
            Demo patient: <code>patient@demo.local</code>
          </span>
          <span>
            Demo doctor: <code>doctor@demo.local</code>
          </span>
          <span>
            Password for both: <code>password</code>
          </span>
        </div>
      </section>
    </main>
  );
}

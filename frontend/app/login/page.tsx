"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiPost } from "../../lib/api";
import { saveAuth, type AuthUser } from "../../lib/auth";
import { HeroEmblem } from "../components/HeroEmblem";
import { LeafGlyph } from "../components/Leaf";

type LoginResponse = AuthUser & { token: string };

const TRUST_PILLS = [
  "Private by design",
  "Doctor-reviewed",
  "Bilingual summaries",
] as const;

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
    <div className="auth-grid">
      {/* Left decorative rail */}
      <aside className="auth-left">
        <HeroEmblem size={220} />
        <p className="auth-left-quote">
          &ldquo;More minutes with your doctor. Fewer on paperwork.&rdquo;
        </p>
        <div className="auth-left-pills">
          {TRUST_PILLS.map((label) => (
            <span key={label} className="pill">
              <LeafGlyph size={12} />
              {label}
            </span>
          ))}
        </div>
      </aside>

      {/* Right login rail */}
      <main className="auth-right">
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

          <details className="demo-creds">
            <summary>Demo credentials</summary>
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
          </details>
        </section>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12.5, color: "var(--ink-3)" }}>
          <Link href="/privacy" style={{ color: "var(--ink-3)" }}>
            Privacy Policy
          </Link>
        </p>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
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
            setError(err instanceof Error ? err.message : "login failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ maxWidth: 380, margin: "4rem auto", fontFamily: "system-ui" }}>
            <h1>Sign in</h1>
            <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
                <label>
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ width: "100%", padding: "0.5rem" }}
                        required
                    />
                </label>
                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: "100%", padding: "0.5rem" }}
                        required
                    />
                </label>
                <button type="submit" disabled={busy} style={{ padding: "0.5rem" }}>
                    {busy ? "Signing in…" : "Sign in"}
                </button>
                {error && <p style={{ color: "crimson" }}>{error}</p>}
                <small>
                    Demo: <code>patient@demo.local</code> / <code>doctor@demo.local</code>,
                    password <code>password</code>
                </small>
            </form>
        </main>
    );
}

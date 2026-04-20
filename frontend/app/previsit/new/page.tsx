"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { apiPost } from "../../../lib/api";
import { getToken } from "../../../lib/auth";

type Session = {
    visitId: string;
    assistantMessage: string;
    structured: {
        history: Array<{ role: string; content: string }>;
        fields: Record<string, unknown>;
        done: boolean;
    };
    done: boolean;
};

type Message = { role: "assistant" | "user"; content: string };

export default function PreVisitNewPage() {
    const router = useRouter();
    const [visitId, setVisitId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [fields, setFields] = useState<Record<string, unknown>>({});
    const [done, setDone] = useState(false);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    useEffect(() => {
        if (!getToken()) {
            router.push("/login");
            return;
        }
        if (started.current) return;
        started.current = true;
        (async () => {
            try {
                setBusy(true);
                const s = await apiPost<Session>("/previsit/sessions", {});
                setVisitId(s.visitId);
                setMessages([{ role: "assistant", content: s.assistantMessage }]);
            } catch (err) {
                setError(err instanceof Error ? err.message : "failed to start session");
            } finally {
                setBusy(false);
            }
        })();
    }, [router]);

    async function send(e: React.FormEvent) {
        e.preventDefault();
        if (!visitId || !input.trim() || done) return;
        const userMsg = input.trim();
        setInput("");
        setMessages((m) => [...m, { role: "user", content: userMsg }]);
        setBusy(true);
        setError(null);
        try {
            const s = await apiPost<Session>(`/previsit/sessions/${visitId}/turn`, {
                userMessage: userMsg,
            });
            setMessages((m) => [...m, { role: "assistant", content: s.assistantMessage }]);
            setFields(s.structured.fields);
            setDone(s.done);
        } catch (err) {
            setError(err instanceof Error ? err.message : "turn failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui" }}>
            <h1>Pre-visit intake</h1>
            <div
                style={{
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: "1rem",
                    minHeight: 300,
                    display: "grid",
                    gap: "0.5rem",
                }}
            >
                {messages.map((m, i) => (
                    <div
                        key={i}
                        style={{
                            justifySelf: m.role === "user" ? "end" : "start",
                            background: m.role === "user" ? "#e0f2fe" : "#f1f5f9",
                            padding: "0.5rem 0.75rem",
                            borderRadius: 12,
                            maxWidth: "80%",
                        }}
                    >
                        {m.content}
                    </div>
                ))}
                {busy && <div style={{ justifySelf: "start", color: "#888" }}>…</div>}
            </div>

            {!done && (
                <form onSubmit={send} style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        disabled={busy || !visitId}
                        placeholder="Type your answer…"
                        style={{ flex: 1, padding: "0.5rem" }}
                    />
                    <button type="submit" disabled={busy || !visitId || !input.trim()}>
                        Send
                    </button>
                </form>
            )}

            {done && (
                <section
                    style={{
                        marginTop: "1.5rem",
                        padding: "1rem",
                        background: "#f0fdf4",
                        borderRadius: 8,
                    }}
                >
                    <h2>Thanks! Here&apos;s what the doctor will see:</h2>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(fields, null, 2)}</pre>
                </section>
            )}

            {error && <p style={{ color: "crimson" }}>{error}</p>}
        </main>
    );
}

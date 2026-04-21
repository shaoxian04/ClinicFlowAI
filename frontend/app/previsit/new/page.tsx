"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiPost } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { PageHeader } from "../../components/PageHeader";

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
  const paneRef = useRef<HTMLDivElement>(null);

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
        setError(err instanceof Error ? err.message : "Failed to start session");
      } finally {
        setBusy(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    const el = paneRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

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
      setError(err instanceof Error ? err.message : "Turn failed");
    } finally {
      setBusy(false);
    }
  }

  const fieldEntries = Object.entries(fields);

  return (
    <main className="shell shell-narrow">
      <Link href="/portal" className="back-link">← Back to portal</Link>
      <div style={{ marginTop: 18 }}>
        <PageHeader
          eyebrow="Pre-visit intake"
          title={<>Tell us how you&apos;re <em>feeling</em></>}
          sub="Answer a short, guided conversation. Your doctor walks into the room already knowing your chief complaint, duration, and any red flags — so the visit is for care, not clerical work."
        />
      </div>

      <section className="card chat-card" data-delay="1">
        <div className="chat-head">
          <span className="chat-head-title">
            Intake <em>assistant</em>
          </span>
          <span className="card-idx">
            {visitId ? `VISIT ${visitId.slice(0, 8).toUpperCase()}` : "STARTING…"}
          </span>
        </div>
        <div className="chat-pane" ref={paneRef}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={`chat-bubble ${m.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}`}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="chat-typing" aria-label="Assistant is typing">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
        {!done && (
          <form onSubmit={send} className="chat-form">
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy || !visitId}
              placeholder="Type your answer…"
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !visitId || !input.trim()}
            >
              Send →
            </button>
          </form>
        )}
      </section>

      {done && (
        <section className="card intake-summary" data-delay="2">
          <div className="card-head">
            <h2>What your doctor will see</h2>
            <span className="card-idx">READY</span>
          </div>
          <p>
            Thank you. This structured intake has been saved against your visit — your doctor will review it before
            you meet.
          </p>
          {fieldEntries.length > 0 && (
            <ul className="intake-fields">
              {fieldEntries.map(([k, v]) => (
                <li key={k}>
                  <strong>{k.replace(/_/g, " ")}</strong>
                  <span className="field-value">
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row" style={{ marginTop: 18 }}>
            <Link href="/portal" className="btn btn-primary">
              Return to portal
            </Link>
          </div>
        </section>
      )}

      {error && <div className="banner banner-error">{error}</div>}
    </main>
  );
}

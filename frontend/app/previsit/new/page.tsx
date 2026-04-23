"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiPost } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { HeroEmblem } from "../../components/HeroEmblem";
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

const STEPS = ["Symptoms", "Duration", "History", "Allergies", "Ready"] as const;

const FIELD_TO_STEP: Record<string, number> = {
  symptoms: 0,
  symptomDescription: 0,
  duration: 1,
  durationDays: 1,
  medications: 2,
  currentMedications: 2,
  allergies: 3,
  done: 4,
};

const FIELD_TO_SECTION: Record<string, string> = {
  symptoms: "What's bothering you",
  symptomDescription: "What's bothering you",
  duration: "How long",
  durationDays: "How long",
  medications: "Your medicines",
  currentMedications: "Your medicines",
  allergies: "Any allergies",
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
  const chatCardRef = useRef<HTMLElement>(null);

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
    chatCardRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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

  // Group structured fields into readable sections for the completion card
  const sectionMap: Map<string, Array<{ key: string; value: unknown }>> = new Map();
  for (const [key, value] of fieldEntries) {
    const section = FIELD_TO_SECTION[key];
    if (section) {
      const existing = sectionMap.get(section) ?? [];
      existing.push({ key, value });
      sectionMap.set(section, existing);
    }
  }

  const activeStep = done
    ? 4
    : Object.keys(fields).reduce(
        (max, key) => Math.max(max, FIELD_TO_STEP[key] ?? -1),
        -1
      );

  return (
    <main className="shell previsit-shell">
      <Link href="/portal" className="back-link">← Back to portal</Link>
      <div style={{ marginTop: 18, textAlign: "center" }}>
        <PageHeader
          eyebrow="Pre-visit intake"
          title={<>Tell us how you&apos;re <em>feeling</em></>}
          sub="Answer a short, guided conversation. Your doctor walks into the room already knowing your chief complaint, duration, and any red flags — so the visit is for care, not clerical work."
        />
      </div>

      {/* Intake partners strip */}
      <div className="intake-partners">
        <div className="intake-partner-avatar" title="You">You</div>
        <span className="intake-partner-sep">→</span>
        <div className="intake-partner-avatar" title="Intake assistant">AI</div>
        <span className="intake-partner-sep">→</span>
        <div className="intake-partner-avatar" title="Your doctor">Dr</div>
      </div>

      {/* Progress indicator */}
      <div className="intake-progress" role="list" aria-label="Intake progress">
        {STEPS.map((label, idx) => {
          const isDone = idx < activeStep || (idx === 4 && done);
          const isActive = idx === activeStep && !isDone;
          const cls = `intake-step${isDone ? " is-done" : isActive ? " is-active" : ""}`;
          return (
            <div key={label} className={cls} role="listitem">
              <span className="intake-dot" />
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      <section className="card chat-card" data-delay="1" ref={chatCardRef}>
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
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
              <span className="chat-typing-dot" />
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
        <div className="intake-completion-card">
          <div className="intake-completion-header">
            <HeroEmblem size={80} />
            <div>
              <p className="intake-completion-title">Your intake is ready.</p>
              <p className="intake-completion-sub">Your doctor will see this before you arrive.</p>
            </div>
          </div>
          <div className="intake-completion-sections">
            {Array.from(sectionMap.entries()).map(([section, items]) => (
              <div key={section}>
                <p className="intake-section-label">{section}</p>
                {items.map(({ key, value }) => (
                  <p key={key} className="intake-section-value">
                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 18 }}>
            <Link href="/portal" className="btn btn-primary">
              Return to portal
            </Link>
          </div>
        </div>
      )}

      {error && <div className="banner banner-error">{error}</div>}
    </main>
  );
}

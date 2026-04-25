"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { apiPost } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { cn } from "@/design/cn";
import { fadeUp, staggerChildren } from "@/design/motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

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

/* ─── Typing indicator ──────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-fog-dim/40 animate-pulse"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

/* ─── Step progress ─────────────────────────────────────────────────────── */
function StepProgress({
  steps,
  activeStep,
}: {
  steps: readonly string[];
  activeStep: number;
}) {
  return (
    <div
      role="list"
      aria-label="Intake progress"
      className="flex items-center gap-0 mb-8"
    >
      {steps.map((label, idx) => {
        const isDone = idx < activeStep || (idx === 4 && activeStep >= 4);
        const isActive = idx === activeStep && !isDone;
        return (
          <div key={label} role="listitem" className="flex items-center gap-0 flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-2 h-2 rounded-full transition-colors duration-300",
                  isDone
                    ? "bg-lime"
                    : isActive
                    ? "bg-cyan"
                    : "bg-ink-rim"
                )}
              />
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-widest whitespace-nowrap transition-colors duration-300",
                  isDone
                    ? "text-lime"
                    : isActive
                    ? "text-cyan font-medium"
                    : "text-fog-dim/40"
                )}
              >
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-[1px] mx-1 mb-5 transition-colors duration-300",
                  idx < activeStep ? "bg-lime/40" : "bg-ink-rim"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Send icon ─────────────────────────────────────────────────────────── */
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8h12M8 2l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Check icon ────────────────────────────────────────────────────────── */
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
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
  const chatCardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <motion.main
      variants={staggerChildren}
      initial="initial"
      animate="animate"
    >
      {/* Back link — editorial typographic style */}
      <motion.div variants={fadeUp}>
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 font-sans text-sm text-fog-dim hover:text-cyan transition-colors duration-150 group mb-8 block"
        >
          <span className="font-mono" aria-hidden="true">←</span>
          <span className="border-b border-transparent group-hover:border-cyan transition-colors duration-150">
            Return to portal
          </span>
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div variants={fadeUp} className="mb-8">
        <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
          Pre-visit intake
        </p>
        <h1 className="font-display text-3xl md:text-4xl text-fog leading-[1.1] tracking-tight">
          Tell us how you&apos;re{" "}
          <em className="not-italic text-cyan">feeling</em>
        </h1>
        <p className="font-sans text-sm text-fog-dim leading-relaxed mt-3 max-w-prose">
          Answer a short, guided conversation. Your doctor walks into the room
          already knowing your chief complaint — so the visit is for care, not
          clerical work.
        </p>
      </motion.div>

      {/* Step progress */}
      <motion.div variants={fadeUp}>
        <StepProgress steps={STEPS} activeStep={activeStep} />
      </motion.div>

      {/* Chat panel */}
      <motion.div variants={fadeUp} ref={chatCardRef}>
        <Card variant="paper" className="p-0 overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-rim bg-mica/30">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-lime animate-pulse" />
              <span className="font-sans text-sm font-medium text-fog">
                Intake <em className="not-italic text-fog-dim font-normal">assistant</em>
              </span>
            </div>
            {visitId && (
              <span className="font-mono text-xs text-fog-dim/50 tracking-widest">
                VISIT {visitId.slice(0, 8).toUpperCase()}
              </span>
            )}
            {!visitId && (
              <span className="font-mono text-xs text-fog-dim/40 tracking-widest">
                STARTING…
              </span>
            )}
          </div>

          {/* Messages */}
          <div
            ref={paneRef}
            className="flex flex-col gap-3 p-5 min-h-[240px] max-h-[400px] overflow-y-auto"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[82%] rounded-md px-4 py-2.5 font-sans text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-mica text-fog border border-ink-rim"
                      : "bg-ink-well text-fog border-l-2 border-l-coral border border-ink-rim"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start">
                <div className="bg-ink-well border-l-2 border-l-coral border border-ink-rim rounded-md">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          {!done && (
            <form
              onSubmit={send}
              className="flex items-center gap-2 px-4 py-3 border-t border-ink-rim bg-ink-well"
            >
              <input
                ref={inputRef}
                className={cn(
                  "flex-1 h-9 bg-transparent font-sans text-sm text-fog placeholder:text-fog-dim/40",
                  "focus:outline-none"
                )}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={busy || !visitId}
                placeholder="Type your answer…"
                autoFocus
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={busy || !visitId || !input.trim()}
                icon={<SendIcon />}
              >
                Send
              </Button>
            </form>
          )}
        </Card>
      </motion.div>

      {/* Completion card */}
      {done && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mt-6"
        >
          <Card variant="bone" className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-sm bg-lime/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckIcon />
              </div>
              <div>
                <p className="font-display text-lg text-fog leading-tight">
                  Your intake is ready.
                </p>
                <p className="font-sans text-sm text-fog-dim mt-0.5">
                  Your doctor will see this before you arrive.
                </p>
              </div>
            </div>

            {/* Collected sections */}
            {sectionMap.size > 0 && (
              <div className="border-t border-ink-rim pt-4 space-y-4">
                {Array.from(sectionMap.entries()).map(([section, items]) => (
                  <div key={section}>
                    <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-1.5">
                      {section}
                    </p>
                    {items.map(({ key, value }) => (
                      <p key={key} className="font-sans text-sm text-fog">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1">
              <Button asChild variant="primary" size="md">
                <Link href="/portal">Return to portal</Link>
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mt-4 px-4 py-3 border border-crimson/30 bg-crimson/5 rounded-sm">
          <p className="font-sans text-sm text-crimson">{error}</p>
        </div>
      )}
    </motion.main>
  );
}

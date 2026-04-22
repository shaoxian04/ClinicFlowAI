// frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx
"use client";
import { useState } from "react";
import type { ChatTurn, Clarification } from "@/lib/types/report";

export interface ReportChatPanelProps {
  turns: ChatTurn[];
  clarification: Clarification | null;
  editing: boolean;
  onSubmit: (text: string) => Promise<void>;
  locked: boolean;
}

export function ReportChatPanel({ turns, clarification, editing, onSubmit, locked }: ReportChatPanelProps) {
  const [draft, setDraft] = useState("");

  async function handle() {
    if (!draft.trim() || editing || locked) return;
    const text = draft;
    setDraft("");
    console.info("[REVIEW] chat submit len=", text.length, "clarification=", clarification?.field ?? null);
    await onSubmit(text);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handle();
    }
  }

  const placeholder = clarification
    ? `Answer: ${clarification.prompt}`
    : "Ask the agent to edit something…";

  return (
    <section className="chat-panel">
      <div className="card-head"><h2>Assistant</h2></div>
      <ol className="chat-thread">
        {turns.map((t) => (
          <li key={t.turnIndex} data-role={t.role}>
            <div className="chat-role">{t.role === "user" ? "You" : "Assistant"}</div>
            <div className="chat-content">{t.content}</div>
          </li>
        ))}
        {editing && (
          <li data-role="assistant" aria-live="polite">
            <div className="chat-role">Assistant</div>
            <div className="chat-content muted">Thinking…</div>
          </li>
        )}
      </ol>
      <div className="chat-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={editing || locked}
          rows={2}
        />
        <button type="button" onClick={handle} disabled={editing || locked || !draft.trim()}>Send</button>
      </div>
    </section>
  );
}

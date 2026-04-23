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

function prettify(turn: ChatTurn): ChatTurn {
  if (turn.role !== "user") return turn;
  let content = turn.content;
  // Strip outer agent prefix: "Visit {uuid} — transcript / edit input:\n\n..."
  const m = content.match(/^Visit [0-9a-f-]+ — transcript \/ edit input:\n\n([\s\S]*)$/);
  if (m) content = m[1];
  // Strip edit prefix: "Doctor edit request:\n..."
  const m2 = content.match(/^Doctor edit request:\n([\s\S]*)$/);
  if (m2) content = m2[1];
  return { ...turn, content };
}

export function ReportChatPanel({ turns, clarification, editing, onSubmit, locked }: ReportChatPanelProps) {
  const [draft, setDraft] = useState("");

  async function handle() {
    if (!draft.trim() || editing || locked) return;
    const text = draft;
    setDraft("");
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

  const visibleTurns = turns
    .filter(t => t.content && t.content.trim().length > 0)
    .map(prettify);

  return (
    <section className="chat-panel">
      <div className="card-head"><h2>Assistant</h2></div>
      <ol className="chat-thread">
        {visibleTurns.map((t) => (
          <li key={t.turnIndex} data-role={t.role}>
            <div className="chat-role">{t.role === "user" ? "You" : "Assistant"}</div>
            <div className="chat-content">{t.content}</div>
          </li>
        ))}
        {/* Show clarification question as a visible bubble, not just placeholder */}
        {clarification && !editing && (
          <li data-role="assistant">
            <div className="chat-role">Assistant</div>
            <div className="chat-content">{clarification.prompt}</div>
          </li>
        )}
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
          placeholder={clarification ? "Type your answer…" : "Ask the agent to edit something…"}
          disabled={editing || locked}
          rows={2}
        />
        <button type="button" onClick={handle} disabled={editing || locked || !draft.trim()}>Send</button>
      </div>
    </section>
  );
}

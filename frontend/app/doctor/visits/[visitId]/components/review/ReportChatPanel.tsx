// frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx
"use client";
import { useState } from "react";
import type { ChatTurn, Clarification } from "@/lib/types/report";
import { cn } from "@/design/cn";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
    <section className="bg-paper rounded-sm border border-hairline flex flex-col h-full min-h-[400px]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-hairline flex-shrink-0">
        <SectionHeader title="Assistant" className="text-ink/70" />
      </div>

      {/* Chat thread */}
      <ol className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
        {visibleTurns.map((t) => (
          <li
            key={t.turnIndex}
            className={cn(
              "flex flex-col gap-0.5",
              t.role === "user" ? "items-end" : "items-start"
            )}
          >
            <span className="font-mono text-[10px] text-ink-soft/50 uppercase tracking-widest">
              {t.role === "user" ? "You" : "Assistant"}
            </span>
            <div
              className={cn(
                "rounded-md px-3 py-2 text-sm font-sans leading-relaxed max-w-[88%]",
                t.role === "user"
                  ? "bg-bone text-ink"
                  : "bg-paper border border-hairline border-l-2 border-l-oxblood text-ink"
              )}
            >
              {t.content}
            </div>
          </li>
        ))}

        {/* Show clarification question as a visible assistant bubble */}
        {clarification && !editing && (
          <li className="flex flex-col gap-0.5 items-start">
            <span className="font-mono text-[10px] text-ink-soft/50 uppercase tracking-widest">
              Assistant
            </span>
            <div className="rounded-md px-3 py-2 text-sm font-sans leading-relaxed max-w-[88%] bg-ochre/5 border border-ochre/20 text-ink">
              {clarification.prompt}
            </div>
          </li>
        )}

        {editing && (
          <li className="flex flex-col gap-0.5 items-start" aria-live="polite">
            <span className="font-mono text-[10px] text-ink-soft/50 uppercase tracking-widest">
              Assistant
            </span>
            <div className="rounded-md px-3 py-2 text-sm font-sans text-ink-soft italic bg-paper border border-hairline">
              Thinking…
            </div>
          </li>
        )}
      </ol>

      {/* Chat input */}
      <div className="flex-shrink-0 border-t border-hairline p-3 flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={editing || locked}
          rows={2}
          className="flex-1 rounded-xs border border-hairline bg-paper px-3 py-2 text-sm font-sans text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-1 focus:ring-oxblood/40 resize-none disabled:opacity-50"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handle}
          disabled={editing || locked || !draft.trim()}
        >
          Send
        </Button>
      </div>
    </section>
  );
}

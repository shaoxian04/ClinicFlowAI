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

const TRANSCRIPT_WRAPPER = /^Visit [0-9a-f-]+ — transcript \/ edit input:\n\n([\s\S]*)$/;
const EDIT_REQUEST = /^Doctor edit request:\n([\s\S]*)$/;

type RenderKind = "transcript" | "message";
interface RenderTurn extends ChatTurn {
  kind: RenderKind;
  wordCount?: number;
}

/**
 * Normalise turns for rendering. The agent wraps every user input with
 * "Visit UUID — transcript / edit input:\n\n<body>". If the <body> is a
 * "Doctor edit request: …" it's a chat-initiated edit; otherwise it's the
 * raw transcript submitted from the GenerateBar. We collapse transcript
 * submissions into a compact marker so the chat doesn't dump ~500 words.
 */
function normalise(turn: ChatTurn): RenderTurn {
  if (turn.role !== "user") return { ...turn, kind: "message" };
  let content = turn.content;
  const outer = content.match(TRANSCRIPT_WRAPPER);
  if (outer) content = outer[1];
  const edit = content.match(EDIT_REQUEST);
  if (edit) {
    return { ...turn, content: edit[1], kind: "message" };
  }
  // Raw body with no edit-request prefix ⇒ this is a transcript/initial
  // submission. Render as a compact marker instead of a full bubble.
  if (outer) {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    return { ...turn, content, kind: "transcript", wordCount: words };
  }
  return { ...turn, content, kind: "message" };
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
    .map(normalise);

  return (
    <section className="bg-ink-well rounded-sm border border-ink-rim flex flex-col h-full min-h-[400px] max-h-[inherit]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-ink-rim flex-shrink-0">
        <SectionHeader title="Assistant" className="text-fog/70" />
      </div>

      {/* Chat thread */}
      <ol className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
        {visibleTurns.map((t) => {
          if (t.kind === "transcript") {
            return (
              <li key={t.turnIndex} className="flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-xs border border-ink-rim bg-mica px-2.5 py-1 font-mono text-[10px] text-fog-dim uppercase tracking-widest">
                  <span className="h-1 w-1 rounded-full bg-coral" aria-hidden />
                  Transcript submitted
                  {t.wordCount != null && (
                    <span className="text-fog-dim/60 normal-case tracking-normal">· {t.wordCount} words</span>
                  )}
                </span>
              </li>
            );
          }
          return (
            <li
              key={t.turnIndex}
              className={cn(
                "flex flex-col gap-0.5",
                t.role === "user" ? "items-end" : "items-start"
              )}
            >
              <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">
                {t.role === "user" ? "You" : "Assistant"}
              </span>
              <div
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-sans leading-relaxed max-w-[88%]",
                  t.role === "user"
                    ? "bg-mica text-fog"
                    : "bg-ink-well border border-ink-rim border-l-2 border-l-coral text-fog"
                )}
              >
                {t.content}
              </div>
            </li>
          );
        })}

        {/* Show clarification question as a visible assistant bubble */}
        {clarification && !editing && (
          <li className="flex flex-col gap-0.5 items-start">
            <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">
              Assistant
            </span>
            <div className="rounded-md px-3 py-2 text-sm font-sans leading-relaxed max-w-[88%] bg-amber/5 border border-amber/20 text-fog">
              {clarification.prompt}
            </div>
          </li>
        )}

        {editing && (
          <li className="flex flex-col gap-0.5 items-start" aria-live="polite">
            <span className="font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest">
              Assistant
            </span>
            <div className="rounded-md px-3 py-2 text-sm font-sans text-fog-dim italic bg-ink-well border border-ink-rim">
              Thinking…
            </div>
          </li>
        )}
      </ol>

      {/* Chat input */}
      <div className="flex-shrink-0 border-t border-ink-rim p-3 flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={editing || locked}
          rows={2}
          className="flex-1 rounded-xs border border-ink-rim bg-ink-well px-3 py-2 text-sm font-sans text-fog placeholder:text-fog-dim/50 focus:outline-none focus:ring-1 focus:ring-cyan/40 resize-none disabled:opacity-50"
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

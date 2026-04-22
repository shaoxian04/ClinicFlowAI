"use client";

import { useEffect, useState } from "react";

export type ReasoningEntry = {
  kind: "reasoning" | "tool_call" | "tool_result";
  text: string;
};

export function ReasoningPanel({
  entries,
  turnActive,
}: {
  entries: ReasoningEntry[];
  turnActive: boolean;
}) {
  const [visible, setVisible] = useState<ReasoningEntry[]>([]);

  useEffect(() => {
    if (turnActive) {
      setVisible(entries);
      return;
    }
    const timer = setTimeout(() => setVisible([]), 400);
    return () => clearTimeout(timer);
  }, [entries, turnActive]);

  if (visible.length === 0) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900">
      <div className="mb-2 font-semibold text-indigo-800">Thinking…</div>
      <ul className="space-y-1">
        {visible.map((e, i) => (
          <li key={i}>
            <span className="font-mono text-indigo-600">
              {e.kind === "reasoning" ? "›" : e.kind === "tool_call" ? "→" : "←"}
            </span>{" "}
            {e.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import Link from "next/link";
import type { Appointment } from "@/lib/appointments";

type Props = { next: Appointment | null };

export function NextUpCard({ next }: Props) {
    if (!next) {
        return (
            <div className="border border-ink-rim bg-ink-well rounded-sm p-6">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">Next up</p>
                <p className="font-display text-xl text-fog mt-3">No more appointments today</p>
                <p className="font-sans text-sm text-fog-dim mt-2">
                    The schedule is clear. Use the time to clear the review queue.
                </p>
            </div>
        );
    }
    const start = new Date(next.startAt);
    const minutesUntil = Math.round((start.getTime() - Date.now()) / 60000);
    const eyebrow = minutesUntil < 0 ? "STARTED" : `IN ${minutesUntil} MIN`;
    const time = start.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });

    return (
        <div
            className="rounded-sm p-6"
            style={{
                border: "1px solid rgba(45,212,191,0.4)",
                background: "linear-gradient(135deg, rgba(45,212,191,0.10) 0%, rgba(45,212,191,0.04) 100%)",
            }}
        >
            <div className="flex justify-between items-start">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Next up · {time}
                </p>
                <p className="font-mono text-xs text-cyan uppercase tracking-widest">{eyebrow}</p>
            </div>
            <p className="font-display text-2xl text-fog mt-3">
                {next.patientName ?? next.patientId.slice(0, 8)}
            </p>
            <p className="font-sans text-xs text-fog-dim mt-1">
                {next.type === "NEW_SYMPTOM" ? "NEW symptom" : "Follow-up"} · 30 min
            </p>
            <Link
                href={`/doctor/visits/${next.visitId}`}
                className="inline-block mt-4 px-4 py-2 rounded-sm bg-cyan text-obsidian font-sans text-sm font-semibold hover:bg-cyan/90"
            >
                Open chart →
            </Link>
        </div>
    );
}

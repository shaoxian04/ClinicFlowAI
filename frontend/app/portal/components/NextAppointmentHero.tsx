"use client";

import Link from "next/link";
import type { Appointment } from "@/lib/appointments";

type Props = { next: Appointment | null };

export function NextAppointmentHero({ next }: Props) {
    if (!next) {
        return (
            <div className="border border-ink-rim bg-ink-well rounded-sm p-6">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Your next appointment
                </p>
                <p className="font-display text-2xl text-fog mt-3">No upcoming appointments</p>
                <p className="font-sans text-sm text-fog-dim mt-2">
                    Start a pre-visit chat first, then book a slot when you&apos;re ready.
                </p>
                <Link
                    href="/previsit/new"
                    className="inline-block mt-4 px-4 py-2 rounded-sm bg-cyan text-obsidian font-sans text-sm font-semibold hover:bg-cyan/90"
                >
                    Start pre-visit chat →
                </Link>
            </div>
        );
    }
    const start = new Date(next.startAt);
    const days = Math.max(0, Math.round((start.getTime() - Date.now()) / 86400000));
    const eyebrow = days === 0 ? "TODAY" : days === 1 ? "TOMORROW" : `IN ${days} DAYS`;
    const date = start.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
    const time = start.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
    const cancellable = next.status === "BOOKED" && start.getTime() - Date.now() > 2 * 3600 * 1000;

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
                    Your next appointment
                </p>
                <p className="font-mono text-xs text-cyan uppercase tracking-widest">{eyebrow}</p>
            </div>
            <p className="font-display text-2xl text-fog mt-3">
                {date} · <span className="text-cyan">{time}</span>
            </p>
            <p className="font-sans text-sm text-fog-dim mt-1">
                with <strong className="text-fog">Dr. Demo</strong> · 30 min ·{" "}
                {next.type === "NEW_SYMPTOM" ? "NEW symptom" : "Follow-up"}
            </p>
            <div className="flex gap-2 mt-5">
                <Link
                    href={`/portal/appointments/${next.id}`}
                    className="px-4 py-2 rounded-sm bg-cyan text-obsidian font-sans text-sm font-semibold hover:bg-cyan/90"
                >
                    View details →
                </Link>
                {cancellable && (
                    <Link
                        href={`/portal/appointments/${next.id}`}
                        className="px-4 py-2 rounded-sm border border-ink-rim text-fog-dim font-sans text-sm hover:text-fog"
                    >
                        Cancel
                    </Link>
                )}
            </div>
        </div>
    );
}

"use client";

import type { Appointment } from "@/lib/appointments";

type Props = { appointments: Appointment[] };

export function TodayScheduleRail({ appointments }: Props) {
    if (appointments.length === 0) {
        return (
            <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                    Today&apos;s schedule
                </p>
                <p className="font-sans text-sm text-fog-dim">Today&apos;s grid is clear.</p>
            </div>
        );
    }

    const now = Date.now();
    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-4">
                Today&apos;s schedule
            </p>
            <div className="relative pl-5 border-l border-ink-rim space-y-3">
                {appointments.map((a) => {
                    const start = new Date(a.startAt);
                    const isPast = start.getTime() < now;
                    const isCurrent = !isPast && start.getTime() - now < 30 * 60 * 1000;
                    return (
                        <div key={a.id} className="flex items-center gap-3">
                            <span
                                className={
                                    "absolute left-[-6px] w-3 h-3 rounded-full " +
                                    (isCurrent
                                        ? "bg-cyan ring-4 ring-cyan/20"
                                        : isPast
                                        ? "bg-ink-rim"
                                        : "bg-ink-rim")
                                }
                                aria-hidden="true"
                            />
                            <span
                                className={
                                    "font-sans text-sm " +
                                    (isCurrent ? "text-cyan" : isPast ? "text-fog-dim/60" : "text-fog")
                                }
                            >
                                {start.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}{" "}
                                — {a.patientName ?? a.patientId.slice(0, 8)}
                            </span>
                            <span className="ml-auto font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                                {a.type === "NEW_SYMPTOM" ? "NEW" : "F/U"}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

"use client";

import Link from "next/link";
import type { RecentlyFinalized } from "@/lib/appointments";

type Props = { recent: RecentlyFinalized[] };

export function RecentlyFinalizedStrip({ recent }: Props) {
    if (recent.length === 0) {
        return null;
    }
    return (
        <section>
            <div className="flex justify-between items-baseline mb-3">
                <h2 className="font-display text-lg text-fog">Recently finalized</h2>
                <span className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Last {recent.length}
                </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
                {recent.map((r) => {
                    const finalized = new Date(r.finalizedAt);
                    return (
                        <Link
                            key={r.visitId}
                            href={`/doctor/visits/${r.visitId}`}
                            className="flex-shrink-0 w-44 border border-ink-rim bg-ink-well rounded-sm p-3 hover:border-cyan/60"
                        >
                            <div className="font-sans text-sm text-fog font-semibold">{r.patientName}</div>
                            <div className="font-sans text-xs text-fog-dim mt-1">{r.chiefComplaint}</div>
                            <div className="font-mono text-[10px] text-cyan uppercase tracking-widest mt-2">
                                {finalized.toLocaleDateString("en-MY", { day: "numeric", month: "short" })} ·{" "}
                                {finalized.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

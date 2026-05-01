"use client";

import { TimelineChart, type TimelineDot } from "@/components/charts/TimelineChart";
import type { TimelinePoint } from "@/lib/patient-me";

type Props = { timeline: TimelinePoint[] };

export function VisitTimelineChart({ timeline }: Props) {
    const dots: TimelineDot[] = timeline.map((p) => ({
        date: p.date,
        kind: p.kind === "UPCOMING" ? "ring" : "filled",
        label: `${p.date} — ${p.summary}`,
    }));
    const finalized = timeline.filter((p) => p.kind === "FINALIZED").length;
    const upcoming = timeline.filter((p) => p.kind === "UPCOMING").length;

    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <div className="flex justify-between items-baseline mb-3">
                <h2 className="font-sans text-sm font-semibold text-fog">Your journey</h2>
                <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                    {finalized} visits · {upcoming} upcoming
                </p>
            </div>
            <TimelineChart dots={dots} />
        </div>
    );
}

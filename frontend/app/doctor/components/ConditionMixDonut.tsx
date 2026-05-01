"use client";

import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import type { ConditionMixSlice } from "@/lib/appointments";

const PALETTE = ["#2dd4bf", "#56a8b8", "#7ea0a8", "#9aa3b8", "#5a6679"];

type Props = { mix: ConditionMixSlice[] };

export function ConditionMixDonut({ mix }: Props) {
    const slices: DonutSlice[] = mix.map((m, i) => ({
        label: m.label,
        value: m.count,
        color: PALETTE[i % PALETTE.length],
    }));

    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-4">
                Condition mix · 30 days
            </p>
            <div className="flex items-center gap-5">
                <DonutChart slices={slices} size={100} />
                <ul className="flex-1 space-y-1.5 font-sans text-sm" role="list">
                    {mix.length === 0 && (
                        <li className="text-fog-dim/60 text-xs">No finalized visits yet.</li>
                    )}
                    {mix.map((m, i) => (
                        <li key={m.label} className="flex justify-between">
                            <span className="text-fog">
                                <span style={{ color: PALETTE[i % PALETTE.length] }} aria-hidden="true">
                                    ▪
                                </span>{" "}
                                {m.label}
                            </span>
                            <span className="text-fog-dim">{Math.round(m.pct)}%</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

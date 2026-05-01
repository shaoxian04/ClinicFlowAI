"use client";

import { AreaChart } from "@/components/charts/AreaChart";
import type { TrendPoint, TrendDelta } from "@/lib/appointments";

type Props = { trend: TrendPoint[]; delta: TrendDelta };

export function VisitsTrendChart({ trend, delta }: Props) {
    const points = trend.map((p, i) => ({ x: i, y: p.count }));
    const arrow = delta.deltaPct >= 0 ? "↑" : "↓";
    const sign = delta.deltaPct >= 0 ? "" : "-";
    const pctStr = `${sign}${Math.abs(Math.round(delta.deltaPct))}%`;

    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                Visits · last 14 days
            </p>
            <AreaChart points={points} width={400} height={74} className="w-full" />
            <div className="flex justify-between font-mono text-xs text-fog-dim mt-2">
                <span>
                    <strong className="text-fog">{delta.current}</strong> finalized
                </span>
                <span className="text-cyan">
                    {arrow} {pctStr} vs prior
                </span>
            </div>
        </div>
    );
}

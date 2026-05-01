"use client";

import type { PatientDashboardStats } from "@/lib/patient-me";

type Props = { stats: PatientDashboardStats | null };

export function HealthSnapshotStrip({ stats }: Props) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Tile label="Past consultations" value={stats?.pastConsultations} accent />
            <Tile label="Active meds" value={stats?.activeMedications} accent />
            <Tile label="Allergies" value={stats?.allergies} />
            <Tile label="Last visit" value={stats?.lastVisitDate ? formatDate(stats.lastVisitDate) : "—"} small />
        </div>
    );
}

function Tile({
    label,
    value,
    accent,
    small,
}: {
    label: string;
    value: number | string | undefined | null;
    accent?: boolean;
    small?: boolean;
}) {
    return (
        <div className="border border-ink-rim rounded-sm p-3">
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">{label}</p>
            <p
                className={
                    "font-display mt-1 " +
                    (small ? "text-base text-fog" : accent ? "text-2xl text-cyan" : "text-2xl text-fog")
                }
            >
                {value ?? "—"}
            </p>
        </div>
    );
}

function formatDate(iso: string): string {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
    });
}

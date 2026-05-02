"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAnalytics, type Analytics } from "@/lib/admin";
import AdminNav from "../components/AdminNav";

export default function AdminAnalyticsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<Analytics | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "ADMIN") { router.replace("/login"); return; }
        let cancelled = false;
        getAnalytics().then(d => {
            if (!cancelled) { setData(d); setLoading(false); }
        }).catch(err => {
            if (!cancelled) { setError(err instanceof Error ? err.message : String(err)); setLoading(false); }
        });
        return () => { cancelled = true; };
    }, [router]);

    return (
        <>
            <AdminNav active="analytics" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Clinic admin</div>
                    <h1 className="page-header-title">Analytics.</h1>
                    <p className="page-header-sub">
                        Clinic-level KPIs and appointment volume for the last 30 days.
                    </p>
                </header>

                {error && <div className="banner banner-error mt-4">{error}</div>}

                {loading ? (
                    <SkeletonKpis />
                ) : data ? (
                    <>
                        <div className="kpi-grid">
                            <KpiCard
                                value={data.kpis.totalPatients.toLocaleString()}
                                label="Total patients registered"
                            />
                            <KpiCard
                                value={data.kpis.totalAppointments.toLocaleString()}
                                label="Total appointments (active)"
                            />
                            <KpiCard
                                value={data.kpis.appointmentsToday.toLocaleString()}
                                label="Appointments today"
                                highlight
                            />
                            <KpiCard
                                value={data.kpis.finalized30d.toLocaleString()}
                                label="Reports finalized (30 days)"
                            />
                        </div>

                        <Sparkline data={data.appointmentSeries30d} />
                    </>
                ) : null}
            </main>
        </>
    );
}

function KpiCard({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
    return (
        <div className="kpi-card">
            <div className={`kpi-value ${highlight ? "text-cyan" : ""}`}>{value}</div>
            <div className="kpi-label">{label}</div>
        </div>
    );
}

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
    const max = Math.max(...data.map(d => d.count), 1);
    const total = data.reduce((s, d) => s + d.count, 0);

    return (
        <div className="kpi-card mt-4">
            <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-xs text-fog-dim uppercase tracking-widest">
                    Appointments — last 30 days
                </p>
                <span className="text-sm text-fog-dim">{total.toLocaleString()} total</span>
            </div>
            <div className="flex items-end gap-px h-20">
                {data.map((d) => {
                    const pct = (d.count / max) * 100;
                    return (
                        <div
                            key={d.date}
                            className="flex-1 bg-cyan/30 rounded-sm transition-all duration-150 hover:bg-cyan/60"
                            style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 2)}%` }}
                            title={`${d.date}: ${d.count} appointment${d.count !== 1 ? "s" : ""}`}
                            role="img"
                            aria-label={`${d.date}: ${d.count}`}
                        />
                    );
                })}
            </div>
            <div className="flex justify-between mt-1 text-fog-dim" style={{ fontSize: 10 }}>
                <span className="font-mono">{data[0]?.date?.slice(5) ?? ""}</span>
                <span className="font-mono">{data[data.length - 1]?.date?.slice(5) ?? ""}</span>
            </div>
        </div>
    );
}

function SkeletonKpis() {
    return (
        <div className="kpi-grid mt-4" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="kpi-card">
                    <span className="skeleton-bar skeleton-bar-narrow" style={{ height: 32, borderRadius: 4 }} />
                    <span className="skeleton-bar skeleton-bar-wide mt-2" />
                </div>
            ))}
        </div>
    );
}

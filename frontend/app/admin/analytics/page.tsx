"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getUser } from "@/lib/auth";
import { apiGet } from "@/lib/api";

import AdminNav from "../components/AdminNav";

type AnalyticsData = {
    visitsThisWeek: number | null;
    avgReviewTimeMin: number | null;
    aiAcceptanceRate: number | null;
    patientsThisMonth: number | null;
};

const STUB_VALUES: AnalyticsData = {
    visitsThisWeek: null,
    avgReviewTimeMin: null,
    aiAcceptanceRate: null,
    patientsThisMonth: null,
};

function formatMinutes(val: number | null): string {
    if (val === null) return "—";
    return `${val} min`;
}

function formatPercent(val: number | null): string {
    if (val === null) return "—";
    return `${val}%`;
}

function formatNumber(val: number | null): string {
    if (val === null) return "—";
    return String(val);
}

export default function AdminAnalyticsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState<boolean>(true);
    const [data, setData] = useState<AnalyticsData>(STUB_VALUES);
    const [stub, setStub] = useState<boolean>(false);

    useEffect(() => {
        const user = getUser();
        if (!user) {
            router.replace("/login");
            return;
        }
        if (user.role !== "ADMIN") {
            router.replace("/login");
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const result = await apiGet<AnalyticsData>("/admin/analytics");
                if (!cancelled) {
                    setData(result);
                }
            } catch (err) {
                if (!cancelled) {
                    setStub(true);
                    setData(STUB_VALUES);
                }
                console.warn("admin/analytics unavailable", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router]);

    return (
        <>
            <AdminNav active="analytics" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Clinic admin</div>
                    <h1 className="page-header-title">Analytics.</h1>
                    <p className="page-header-sub">
                        Key performance indicators for the clinic. Updated each time the page
                        loads.
                    </p>
                </header>

                {stub && (
                    <div className="ghost-banner" role="status">
                        Stub — backend pending. Showing placeholder values until the API is wired
                        up.
                    </div>
                )}

                {loading ? (
                    <KpiSkeleton />
                ) : (
                    <div className="kpi-grid">
                        <div className="kpi-card">
                            <div className="kpi-value">
                                {formatNumber(data.visitsThisWeek)}
                            </div>
                            <div className="kpi-label">Visits finalized this week</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-value">
                                {formatMinutes(data.avgReviewTimeMin)}
                            </div>
                            <div className="kpi-label">Avg doctor review time</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-value">
                                {formatPercent(data.aiAcceptanceRate)}
                            </div>
                            <div className="kpi-label">AI draft acceptance rate</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-value">
                                {formatNumber(data.patientsThisMonth)}
                            </div>
                            <div className="kpi-label">Patients served this month</div>
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}

function KpiSkeleton() {
    return (
        <div className="kpi-grid" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="kpi-card">
                    <div className="skeleton-bar skeleton-bar-wide" style={{ height: 36, marginBottom: 8 }} />
                    <div className="skeleton-bar skeleton-bar-narrow" />
                </div>
            ))}
        </div>
    );
}

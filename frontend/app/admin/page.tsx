"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { getUser } from "@/lib/auth";

import AdminNav from "./components/AdminNav";

export default function AdminOverviewPage() {
    const router = useRouter();

    useEffect(() => {
        const user = getUser();
        if (!user) {
            router.replace("/login");
            return;
        }
        if (user.role !== "ADMIN") {
            router.replace("/login");
        }
    }, [router]);

    return (
        <>
            <AdminNav active="overview" />
            <main className="shell shell-narrow portal-shell staff-shell">
                <header className="page-header">
                    <div className="page-header-eyebrow">Clinic admin</div>
                    <h1 className="page-header-title">Admin workspace.</h1>
                    <p className="page-header-sub">
                        Manage users, review clinic performance, and monitor the PDPA-compliant
                        audit trail.
                    </p>
                </header>

                <div className="admin-cards">
                    <Link href="/admin/users" className="admin-card" aria-label="User management">
                        <div className="admin-card-icon" aria-hidden="true">
                            <UsersIcon />
                        </div>
                        <div className="admin-card-title">User management</div>
                        <div className="admin-card-body">
                            Create accounts, assign roles, and manage clinic staff, doctors, and
                            patients.
                        </div>
                    </Link>

                    <Link
                        href="/admin/analytics"
                        className="admin-card"
                        aria-label="Analytics"
                    >
                        <div className="admin-card-icon" aria-hidden="true">
                            <ChartIcon />
                        </div>
                        <div className="admin-card-title">Analytics</div>
                        <div className="admin-card-body">
                            KPI cards showing visit throughput, AI draft acceptance rate, and
                            patient service metrics.
                        </div>
                    </Link>

                    <Link href="/admin/audit" className="admin-card" aria-label="Audit log">
                        <div className="admin-card-icon" aria-hidden="true">
                            <AuditIcon />
                        </div>
                        <div className="admin-card-title">Audit log</div>
                        <div className="admin-card-body">
                            PDPA-compliant append-only log of all actions. Read-only, paginated,
                            filterable.
                        </div>
                    </Link>
                </div>
            </main>
        </>
    );
}

function UsersIcon() {
    return (
        <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function ChartIcon() {
    return (
        <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
            <line x1="2" y1="20" x2="22" y2="20" />
        </svg>
    );
}

function AuditIcon() {
    return (
        <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    );
}

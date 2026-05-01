"use client";

import Link from "next/link";

export type AdminNavTab = "overview" | "users" | "analytics" | "audit" | "schedule-template";

type Tab = { key: AdminNavTab; label: string; href: string };

const TABS: Tab[] = [
    { key: "overview", label: "Overview", href: "/admin" },
    { key: "users", label: "Users", href: "/admin/users" },
    { key: "analytics", label: "Analytics", href: "/admin/analytics" },
    { key: "audit", label: "Audit", href: "/admin/audit" },
    { key: "schedule-template", label: "Schedule template", href: "/admin/schedule-template" },
];

type Props = { active: AdminNavTab };

export default function AdminNav({ active }: Props) {
    return (
        <nav className="admin-nav">
            <div className="admin-nav-inner">
                <div className="admin-nav-brand">
                    <ShieldGlyph size={14} />
                    <span>Admin workspace</span>
                </div>
                <div className="admin-nav-tabs" role="tablist">
                    {TABS.map((tab) => (
                        <Link
                            key={tab.key}
                            href={tab.href}
                            role="tab"
                            aria-selected={active === tab.key}
                            className={
                                active === tab.key
                                    ? "admin-nav-tab admin-nav-tab-active"
                                    : "admin-nav-tab"
                            }
                        >
                            {tab.label}
                        </Link>
                    ))}
                </div>
            </div>
        </nav>
    );
}

function ShieldGlyph({ size = 14 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ color: "var(--primary, #1d4d42)" }}
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    );
}

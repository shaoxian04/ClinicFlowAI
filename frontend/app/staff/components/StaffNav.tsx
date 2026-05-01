"use client";

import Link from "next/link";

export type StaffNavTab = "today" | "patients" | "schedule";

type Tab = { key: StaffNavTab; label: string; href: string };

const TABS: Tab[] = [
    { key: "today", label: "Today", href: "/staff" },
    { key: "patients", label: "Patients", href: "/staff/patients" },
    { key: "schedule", label: "Schedule", href: "/staff/schedule" },
];

type Props = { active: StaffNavTab };

export default function StaffNav({ active }: Props) {
    return (
        <nav className="staff-nav">
            <div className="staff-nav-inner">
                <div className="staff-nav-brand">
                    <LeafGlyph size={14} />
                    <span>Staff workspace</span>
                </div>
                <div className="staff-nav-tabs" role="tablist">
                    {TABS.map((tab) => (
                        <Link
                            key={tab.key}
                            href={tab.href}
                            role="tab"
                            aria-selected={active === tab.key}
                            className={
                                active === tab.key
                                    ? "staff-nav-tab staff-nav-tab-active"
                                    : "staff-nav-tab"
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

function LeafGlyph({ size = 14 }: { size?: number }) {
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
            style={{ color: "var(--primary, #2f855a)" }}
        >
            <path d="M11 20A7 7 0 0 1 4 13V5a9 9 0 0 1 9 9 7 7 0 0 1-2 5z" />
            <path d="M4 4c4 4 9 9 9 16" />
        </svg>
    );
}

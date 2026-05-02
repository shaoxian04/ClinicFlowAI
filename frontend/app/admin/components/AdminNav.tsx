"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/design/cn";

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
    const pathname = usePathname();

    function isActive(tab: Tab): boolean {
        if (tab.key === "overview") return pathname === "/admin";
        return pathname.startsWith(tab.href);
    }

    return (
        <nav className="bg-ink-well border-b border-ink-rim">
            <div className="max-w-screen-xl mx-auto px-6 flex items-center gap-6 h-11">
                <div className="flex items-center gap-2 mr-4 flex-shrink-0">
                    <ShieldGlyph size={13} />
                    <span className="font-mono text-xs text-fog-dim uppercase tracking-widest">
                        Admin workspace
                    </span>
                </div>
                <div className="flex items-center gap-0" role="tablist">
                    {TABS.map((tab) => {
                        const tabActive = isActive(tab);
                        return (
                            <Link
                                key={tab.key}
                                href={tab.href}
                                role="tab"
                                aria-selected={tabActive}
                                className={cn(
                                    "px-4 py-2 text-sm font-sans transition-colors duration-150 border-b-2 -mb-px",
                                    tabActive
                                        ? "text-cyan border-cyan"
                                        : "text-fog-dim border-transparent hover:text-fog"
                                )}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
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
            className="text-cyan/70"
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    );
}

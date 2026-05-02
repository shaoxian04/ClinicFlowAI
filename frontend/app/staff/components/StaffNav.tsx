"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/design/cn";

export type StaffNavTab = "today" | "patients" | "schedule";

type Tab = { key: StaffNavTab; label: string; href: string };

const TABS: Tab[] = [
    { key: "today", label: "Today", href: "/staff" },
    { key: "patients", label: "Patients", href: "/staff/patients" },
    { key: "schedule", label: "Schedule", href: "/staff/schedule" },
];

type Props = { active: StaffNavTab };

export default function StaffNav({ active }: Props) {
    const pathname = usePathname();

    function isActive(tab: Tab): boolean {
        if (tab.key === "today") return pathname === "/staff";
        return active === tab.key;
    }

    return (
        <nav className="bg-ink-well border-b border-ink-rim">
            <div className="max-w-screen-xl mx-auto px-6 flex items-center gap-6 h-11">
                <div className="flex items-center gap-2 mr-4 flex-shrink-0">
                    <FrontDeskGlyph size={13} />
                    <span className="font-mono text-xs text-fog-dim uppercase tracking-widest">
                        Staff workspace
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

function FrontDeskGlyph({ size = 14 }: { size?: number }) {
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
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            <line x1="12" y1="12" x2="12" y2="16" />
            <line x1="10" y1="14" x2="14" y2="14" />
        </svg>
    );
}

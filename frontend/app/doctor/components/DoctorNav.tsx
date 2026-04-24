"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/design/cn";

export type DoctorNavTab = "today" | "queue" | "finalized" | "patients";

type Tab =
  | { key: DoctorNavTab; label: string; href: string; disabled?: false }
  | { key: DoctorNavTab; label: string; disabled: true };

const TABS: Tab[] = [
  { key: "today", label: "Today", href: "/doctor" },
  { key: "queue", label: "Queue", href: "/doctor/queue" },
  { key: "finalized", label: "Finalized", href: "/doctor/finalized" },
  { key: "patients", label: "Patients", disabled: true },
];

type Props = { active: DoctorNavTab };

export default function DoctorNav({ active }: Props) {
  const pathname = usePathname();

  function isActive(tab: Tab): boolean {
    if (tab.key === "today") {
      return pathname === "/doctor" || pathname.startsWith("/doctor/visits/");
    }
    return active === tab.key;
  }

  return (
    <nav className="bg-slate border-b border-slate/80">
      <div className="max-w-screen-xl mx-auto px-6 flex items-center gap-6 h-11">
        <div className="flex items-center gap-2 mr-4 flex-shrink-0">
          <StethoscopeGlyph size={13} />
          <span className="font-mono text-xs text-paper/60 uppercase tracking-widest">
            Clinician workspace
          </span>
        </div>
        <div className="flex items-center gap-0" role="tablist">
          {TABS.map((tab) => {
            if (tab.disabled) {
              return (
                <span
                  key={tab.key}
                  role="tab"
                  aria-selected={false}
                  aria-disabled="true"
                  className="px-4 py-2 text-sm font-sans text-paper/30 cursor-not-allowed"
                >
                  {tab.label}
                </span>
              );
            }
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
                    ? "text-paper border-paper/70"
                    : "text-paper/60 border-transparent hover:text-paper/90"
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

function StethoscopeGlyph({ size = 14 }: { size?: number }) {
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
      className="text-paper/50"
    >
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

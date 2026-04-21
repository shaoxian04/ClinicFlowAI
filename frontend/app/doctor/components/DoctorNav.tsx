"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      return (
        pathname === "/doctor" || pathname.startsWith("/doctor/visits/")
      );
    }
    return active === tab.key;
  }

  return (
    <nav className="staff-nav doctor-nav">
      <div className="staff-nav-inner">
        <div className="staff-nav-brand">
          <StethoscopeGlyph size={14} />
          <span>Clinician workspace</span>
        </div>
        <div className="staff-nav-tabs" role="tablist">
          {TABS.map((tab) => {
            if (tab.disabled) {
              return (
                <span
                  key={tab.key}
                  role="tab"
                  aria-selected={false}
                  aria-disabled="true"
                  className="staff-nav-tab doctor-nav-tab-disabled"
                >
                  {tab.label}
                </span>
              );
            }
            const active = isActive(tab);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                role="tab"
                aria-selected={active}
                className={
                  active
                    ? "staff-nav-tab staff-nav-tab-active"
                    : "staff-nav-tab"
                }
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
      style={{ color: "var(--primary, #1d4d42)" }}
    >
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/design/cn";

const TABS: { label: string; href: string }[] = [
  { label: "Home", href: "/portal" },
  { label: "Appointments", href: "/portal/appointments" },
  { label: "Visit history", href: "/portal/visits" },
  { label: "Profile", href: "/portal/profile" },
];

export function PortalNav({ active }: { active?: string } = {}) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-14 z-40 bg-ink-well/70 backdrop-blur-sm border-b border-ink-rim"
      aria-label="Patient portal navigation"
    >
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-11 gap-6">
        <span className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
          Your portal
        </span>
        <ul className="flex items-center gap-0" role="list">
          {TABS.map((t) => {
            const isActive =
              active != null
                ? active === t.href.replace("/portal", "").replace("/", "") ||
                  (active === "home" && t.href === "/portal")
                : pathname === t.href || pathname?.startsWith(t.href + "/");
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={cn(
                    "inline-flex items-center h-11 px-3 font-sans text-xs transition-colors duration-150 border-b-2",
                    isActive
                      ? "text-cyan border-cyan"
                      : "text-fog-dim/70 border-transparent hover:text-fog hover:border-ink-rim"
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/previsit/new"
          className="inline-flex items-center px-3 py-1.5 rounded-sm bg-cyan text-obsidian font-sans text-xs font-semibold hover:bg-cyan/90"
        >
          Start pre-visit chat →
        </Link>
      </div>
    </nav>
  );
}

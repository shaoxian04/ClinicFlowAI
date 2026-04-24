"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/design/cn";

const TABS: { label: string; href: string }[] = [
  { label: "Home", href: "/portal" },
  { label: "New pre-visit chat", href: "/previsit/new" },
];

export function PortalNav({ active }: { active?: string } = {}) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-14 z-40 bg-bone/70 backdrop-blur-sm border-b border-hairline"
      aria-label="Patient portal navigation"
    >
      <div className="max-w-2xl mx-auto px-6 flex items-center justify-between h-10">
        {/* Brand */}
        <span className="font-mono text-xs text-ink-soft/60 uppercase tracking-widest">
          Your portal
        </span>

        {/* Nav tabs */}
        <ul className="flex items-center gap-0" role="list">
          {TABS.map((t) => {
            const isActive =
              active != null
                ? active === t.href.replace("/", "").split("/")[0] ||
                  (active === "home" && t.href === "/portal") ||
                  (active === "new" && t.href === "/previsit/new")
                : pathname === t.href || pathname?.startsWith(t.href + "/");
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={cn(
                    "inline-flex items-center h-10 px-4 font-sans text-xs transition-colors duration-150 border-b-2",
                    isActive
                      ? "text-oxblood border-oxblood"
                      : "text-ink-soft/70 border-transparent hover:text-ink hover:border-hairline"
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

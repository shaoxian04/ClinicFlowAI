"use client";

import Link from "next/link";
import { LeafGlyph } from "./Leaf";

type Active = "home" | "new" | "history";

const TABS: { key: Active; label: string; href: string }[] = [
  { key: "home", label: "Home", href: "/portal" },
  { key: "new", label: "New pre-visit chat", href: "/previsit/new" },
  { key: "history", label: "Past consultations", href: "/portal#history" },
];

export function PortalNav({ active }: { active: Active }) {
  return (
    <nav className="portal-nav" aria-label="Patient portal navigation">
      <div className="portal-nav-inner">
        <span className="portal-nav-brand">
          <LeafGlyph size={14} color="var(--primary)" />
          Your portal
        </span>
        <ul className="portal-nav-tabs">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                className={`portal-nav-tab${t.key === active ? " is-active" : ""}`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth, getUser, type AuthUser } from "../../lib/auth";
import { cn } from "@/design/cn";

const HIDDEN_ON: RegExp[] = [/^\/$/, /^\/login$/];

const HOME_BY_ROLE: Record<string, string> = {
  PATIENT: "/portal",
  DOCTOR: "/doctor",
  STAFF: "/staff",
  ADMIN: "/admin",
};

const ROLE_LABELS: Record<string, string> = {
  PATIENT: "Patient",
  DOCTOR: "Doctor",
  STAFF: "Staff",
  ADMIN: "Admin",
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUser(getUser());
  }, [pathname]);

  if (!mounted) return <div className="h-14" aria-hidden="true" />;
  if (HIDDEN_ON.some((re) => re.test(pathname ?? ""))) return null;
  if (!user) return null;

  function onSignOut() {
    clearAuth();
    router.replace("/login");
  }

  const home = HOME_BY_ROLE[user.role] ?? "/";
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  return (
    <>
      <header
        className={cn(
          "fixed top-0 w-full z-50 h-14",
          "bg-ink-well/95 backdrop-blur-sm border-b border-ink-rim",
          "flex items-center"
        )}
      >
        <div className="w-full max-w-6xl mx-auto px-6 flex items-center justify-between gap-6">
          {/* Wordmark */}
          <Link
            href={home}
            className="font-display text-lg text-fog tracking-tight hover:text-cyan transition-colors duration-150"
          >
            CliniFlow
          </Link>

          {/* Right nav */}
          <nav className="flex items-center gap-5">
            <span className="font-mono text-xs text-fog-dim/60 tracking-widest uppercase">
              {roleLabel}
            </span>
            <span className="text-ink-rim select-none" aria-hidden="true">|</span>
            <span className="font-sans text-sm text-fog-dim truncate max-w-[180px]">
              {user.email}
            </span>
            <span
              className="hidden md:inline-flex items-center gap-1 font-mono text-[10px] text-fog-dim/50 uppercase tracking-widest"
              aria-hidden="true"
              title="Open command palette"
            >
              <kbd className="px-1.5 py-0.5 rounded-xs border border-ink-rim bg-obsidian/50 text-fog-dim/70">⌘K</kbd>
              <span className="opacity-70">palette</span>
            </span>
            <button
              onClick={onSignOut}
              className="font-sans text-sm text-fog-dim hover:text-cyan transition-colors duration-150 cursor-pointer"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      {/* Spacer so content isn't hidden behind fixed header */}
      <div className="h-14" aria-hidden="true" />
    </>
  );
}

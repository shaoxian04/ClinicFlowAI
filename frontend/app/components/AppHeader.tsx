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
          "bg-paper/95 backdrop-blur-sm border-b border-hairline",
          "flex items-center"
        )}
      >
        <div className="w-full max-w-6xl mx-auto px-6 flex items-center justify-between gap-6">
          {/* Wordmark */}
          <Link
            href={home}
            className="font-display text-lg text-ink tracking-tight hover:text-oxblood transition-colors duration-150"
          >
            CliniFlow
          </Link>

          {/* Right nav */}
          <nav className="flex items-center gap-5">
            <span className="font-mono text-xs text-ink-soft/60 tracking-widest uppercase">
              {roleLabel}
            </span>
            <span className="text-hairline select-none" aria-hidden="true">|</span>
            <span className="font-sans text-sm text-ink-soft truncate max-w-[180px]">
              {user.email}
            </span>
            <button
              onClick={onSignOut}
              className="font-sans text-sm text-ink-soft hover:text-oxblood transition-colors duration-150 cursor-pointer"
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

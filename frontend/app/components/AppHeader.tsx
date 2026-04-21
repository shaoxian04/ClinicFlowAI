"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAuth, getUser, type AuthUser } from "../../lib/auth";

const HIDDEN_ON: RegExp[] = [/^\/$/, /^\/login$/];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUser(getUser());
  }, [pathname]);

  if (!mounted) return null;
  if (HIDDEN_ON.some((re) => re.test(pathname ?? ""))) return null;
  if (!user) return null;

  function onSignOut() {
    clearAuth();
    router.replace("/login");
  }

  const home =
    user.role === "DOCTOR" ? "/doctor" : user.role === "PATIENT" ? "/portal" : "/";

  return (
    <header className="app-header">
      <Link href={home} className="app-header-brand">
        Clini<em>Flow</em>
      </Link>
      <div className="app-header-right">
        <span className="app-header-role">{user.role}</span>
        <span className="app-header-email">{user.email}</span>
        <button className="app-header-signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}

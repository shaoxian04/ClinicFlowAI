"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { clearAuth, getUser, type AuthUser } from "../../lib/auth";
import { RoleChip } from "./RoleChip";

const HIDDEN_ON: RegExp[] = [/^\/$/, /^\/login$/];

type AppHeaderProps = {
  children?: ReactNode;
};

export function AppHeader({ children }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setUser(getUser());
  }, [pathname]);

  useEffect(() => {
    if (!mounted) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sentinel sits above the sticky header. When it leaves the viewport
        // the header has "stuck" to the top — toggle the shadow class then.
        setStuck(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "0px 0px 0px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [mounted, user]);

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
    <>
      <div ref={sentinelRef} className="app-header-sentinel" aria-hidden="true" />
      <header className={`app-header${stuck ? " is-stuck" : ""}`}>
        <div className="app-header-row">
          <Link href={home} className="app-header-brand">
            Clini<em>Flow</em>
          </Link>
          <div className="app-header-right">
            <RoleChip role={user.role} />
            <span className="app-header-email">{user.email}</span>
            <button className="app-header-signout" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
        {children ? <div className="app-header-subnav">{children}</div> : null}
      </header>
    </>
  );
}

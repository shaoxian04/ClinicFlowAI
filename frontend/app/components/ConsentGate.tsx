"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "../../lib/auth";

type Props = {
  children: React.ReactNode;
};

export function ConsentGate({ children }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "PATIENT" && !user.consentGiven) {
      router.replace("/consent");
    }
  }, [router]);

  // Return null on first render to match SSR output (no window) — prevents hydration mismatch.
  if (!mounted) return null;

  const user = getUser();
  if (!user) return null;
  if (user.role === "PATIENT" && !user.consentGiven) return null;

  return <>{children}</>;
}

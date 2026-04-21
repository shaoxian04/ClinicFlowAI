"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "../../lib/auth";

type Props = {
  children: React.ReactNode;
};

export function ConsentGate({ children }: Props) {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role === "PATIENT" && !user.consentGiven) {
      router.replace("/consent");
    }
  }, [router]);

  const user = typeof window !== "undefined" ? getUser() : null;

  // Render nothing while redirect is in flight for unauthenticated or non-consented patients
  if (!user) return null;
  if (user.role === "PATIENT" && !user.consentGiven) return null;

  return <>{children}</>;
}

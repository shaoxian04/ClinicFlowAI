"use client";

import { usePathname } from "next/navigation";

export function AuroraMesh() {
  const pathname = usePathname();

  if (pathname.startsWith("/staff") || pathname.startsWith("/admin")) {
    return null;
  }

  return <div className="aurora-mesh" aria-hidden="true" />;
}

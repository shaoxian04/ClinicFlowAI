"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "STAFF") {
            router.replace("/login");
        }
    }, [router]);

    return <>{children}</>;
}

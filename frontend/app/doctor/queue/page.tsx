"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Stethoscope } from "@/app/components/Illustration";
import DoctorNav from "../components/DoctorNav";

export default function DoctorQueuePage() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); }
  }, [router]);

  return (
    <main className="shell">
      <DoctorNav active="queue" />
      <div style={{ marginTop: 24 }}>
        <PageHeader eyebrow="Clinician workspace" title="Queue" />
      </div>
      <EmptyState
        glyph={<Stethoscope size={56} />}
        title="No queued visits"
        body="Incoming visit requests will appear here. Coming soon."
      />
    </main>
  );
}

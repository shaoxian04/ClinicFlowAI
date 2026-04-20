"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

type VisitSummary = {
  visitId: string;
  patientId: string;
  patientName: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINALIZED" | "CANCELLED";
  preVisitDone: boolean;
  soapFinalized: boolean;
  createdAt: string;
};

export default function DoctorDashboard() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "DOCTOR") { router.replace("/"); return; }
    apiGet<VisitSummary[]>("/visits")
      .then(setVisits)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div style={{ padding: 24 }}>Loading visits…</div>;
  if (error) return <div style={{ padding: 24, color: "crimson" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Doctor Dashboard</h1>
      <p>Visits assigned to you:</p>
      {visits.length === 0 ? (
        <p style={{ color: "#666" }}>No visits yet. Ask a patient to complete a pre-visit intake.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: 8 }}>Patient</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Pre-visit</th>
              <th style={{ padding: 8 }}>SOAP</th>
              <th style={{ padding: 8 }}>Created</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.visitId} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{v.patientName}</td>
                <td style={{ padding: 8 }}>{v.status}</td>
                <td style={{ padding: 8 }}>{v.preVisitDone ? "✓" : "…"}</td>
                <td style={{ padding: 8 }}>{v.soapFinalized ? "✓ finalized" : "draft"}</td>
                <td style={{ padding: 8 }}>{new Date(v.createdAt).toLocaleString()}</td>
                <td style={{ padding: 8 }}>
                  <Link href={`/doctor/visits/${v.visitId}`}>Open →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

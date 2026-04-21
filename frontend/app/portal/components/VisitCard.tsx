import Link from "next/link";

export type VisitCardProps = {
  visitId: string;
  date: string;           // ISO date string (finalizedAt)
  summaryPreview?: string; // first ~80 chars of EN summary, may be absent
  doctorName?: string | null;
  status: "finalized" | "draft" | "pending";
};

function extractTag(preview: string | undefined): string {
  if (!preview?.trim()) return "General visit";
  const words = preview.trim().split(/\s+/);
  return words.slice(0, 3).join(" ");
}

function doctorBadge(name: string | null | undefined): string {
  if (!name) return "—";
  // strip "Dr. " prefix, get initials
  const clean = name.replace(/^Dr\.?\s*/i, "").trim();
  const parts = clean.split(/\s+/);
  return parts.map(p => p[0]?.toUpperCase() ?? "").filter(Boolean).slice(0, 2).join("");
}

export function VisitCard({
  visitId,
  date,
  summaryPreview,
  doctorName,
  status,
}: VisitCardProps) {
  const tag = extractTag(summaryPreview);
  const badge = doctorBadge(doctorName);
  const displayDate = date ? new Date(date).toLocaleString() : "—";

  return (
    <Link
      href={`/portal/visits/${visitId}`}
      className="visit-tile visit-card"
    >
      {/* Doctor initial badge — top-right */}
      <span className="visit-doctor-badge" title={doctorName ?? "Doctor not assigned"}>
        {badge}
      </span>

      <div className="visit-tile-head">
        <span className="visit-tile-title">
          Visit <em>{visitId.slice(0, 8)}</em>
        </span>
        <span className="visit-tile-date">{displayDate}</span>
      </div>

      {/* Symptom tag chip */}
      <span className="visit-chip">{tag}</span>

      <p className="visit-tile-preview">
        {summaryPreview || "(summary being prepared…)"}
      </p>

      <div className="visit-tile-meta">
        <span className="pill pill-primary pill-status" data-status={status}>
          {status}
        </span>
        <span>Tap to read full summary →</span>
      </div>
    </Link>
  );
}

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/design/cn";

export type VisitCardProps = {
  visitId: string;
  date: string;
  summaryPreview?: string;
  doctorName?: string | null;
  status: "finalized" | "draft" | "pending";
};

function doctorBadge(name: string | null | undefined): string {
  if (!name) return "—";
  const clean = name.replace(/^Dr\.?\s*/i, "").trim();
  const parts = clean.split(/\s+/);
  return parts
    .map((p) => p[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("");
}

const STATUS_BADGE: Record<
  VisitCardProps["status"],
  "published" | "review" | "neutral"
> = {
  finalized: "published",
  draft: "review",
  pending: "neutral",
};

export function VisitCard({
  visitId,
  date,
  summaryPreview,
  doctorName,
  status,
}: VisitCardProps) {
  const badge = doctorBadge(doctorName);
  const displayDate = date
    ? new Date(date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  return (
    <Link
      href={`/portal/visits/${visitId}`}
      className="block group"
    >
      <Card
        variant="glass"
        className={cn(
          "transition-shadow duration-150 group-hover:shadow-elevated",
          "relative"
        )}
      >
        {/* Doctor initials — top right */}
        {badge !== "—" && (
          <span
            className="absolute top-5 right-5 w-7 h-7 rounded-sm bg-mica flex items-center justify-center font-mono text-xs text-fog-dim"
            title={doctorName ?? "Doctor not assigned"}
          >
            {badge}
          </span>
        )}

        <div className="space-y-2 pr-10">
          {/* Date + status row */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-fog-dim/60 tracking-wider">
              {displayDate}
            </span>
            <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
          </div>

          {/* Preview */}
          <p className="font-sans text-sm text-fog-dim leading-relaxed line-clamp-2">
            {summaryPreview || "(summary being prepared…)"}
          </p>

          {/* Tap hint */}
          <p className="font-sans text-xs text-fog-dim/40 mt-1 group-hover:text-cyan/60 transition-colors duration-150">
            Read full summary →
          </p>
        </div>
      </Card>
    </Link>
  );
}

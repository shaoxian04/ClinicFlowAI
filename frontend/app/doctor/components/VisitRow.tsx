import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/design/cn";

export type VisitRowProps = {
  visitId: string;
  patientName: string;
  date: string;
  preVisitDone: boolean;
  visitDone: boolean;
  postVisitDone: boolean;
  awaitingReview: boolean;
};

type PhaseDotProps = {
  done: boolean;
  label: string;
};

function PhaseDot({ done, label }: PhaseDotProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          done ? "bg-sage" : "bg-hairline"
        )}
        aria-label={`${label}: ${done ? "done" : "pending"}`}
      />
      <span className="font-mono text-[9px] text-ink-soft/50 uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

export default function VisitRow({
  visitId,
  patientName,
  date,
  preVisitDone,
  visitDone,
  postVisitDone,
  awaitingReview,
}: VisitRowProps) {
  const initial = patientName.trim().charAt(0).toUpperCase();
  const formattedDate = new Date(date).toLocaleString("en-MY", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Link
      href={`/doctor/visits/${visitId}`}
      className="flex items-center gap-4 px-4 py-3 border-b border-hairline hover:bg-bone/40 transition-colors duration-150 group"
      aria-label={`Visit with ${patientName}`}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-8 h-8 rounded-xs bg-oxblood/10 text-oxblood font-sans font-medium text-sm flex items-center justify-center"
        aria-hidden="true"
      >
        {initial}
      </div>

      {/* Name + date */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-sans text-sm text-ink group-hover:text-oxblood transition-colors duration-150 truncate">
            {patientName}
          </span>
          {awaitingReview && (
            <Badge variant="draft">AI draft</Badge>
          )}
        </div>
        <span className="font-mono text-xs text-ink-soft/60 mt-0.5 block">
          {formattedDate}
        </span>
      </div>

      {/* Phase dots */}
      <div className="flex items-center gap-3 flex-shrink-0" aria-label="Phase completion">
        <PhaseDot done={preVisitDone} label="Pre" />
        <PhaseDot done={visitDone} label="Visit" />
        <PhaseDot done={postVisitDone} label="Post" />
      </div>

      {/* Arrow */}
      <span className="font-mono text-xs text-ink-soft/40 flex-shrink-0 group-hover:text-oxblood transition-colors duration-150" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

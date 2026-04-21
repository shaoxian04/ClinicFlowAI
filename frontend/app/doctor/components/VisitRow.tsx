import Link from "next/link";

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
    <div className="visit-dot-group">
      <div className={`visit-dot${done ? " is-done" : ""}`} aria-label={`${label}: ${done ? "done" : "pending"}`} />
      <span className="visit-dot-label">{label}</span>
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
    <Link href={`/doctor/visits/${visitId}`} className="visit-row">
      <div className="visit-row-avatar" aria-hidden="true">
        {initial}
      </div>

      <div className="visit-row-info">
        <span className="visit-row-name">
          {patientName}
          {awaitingReview && (
            <span className="pill pill-warn visit-row-badge">AI draft</span>
          )}
        </span>
        <span className="visit-row-date">{formattedDate}</span>
      </div>

      <div className="visit-row-dots" aria-label="Phase completion">
        <PhaseDot done={preVisitDone} label="Pre" />
        <PhaseDot done={visitDone} label="Visit" />
        <PhaseDot done={postVisitDone} label="Post" />
      </div>
    </Link>
  );
}

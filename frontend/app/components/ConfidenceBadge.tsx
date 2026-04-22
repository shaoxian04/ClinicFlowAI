export type ConfidenceFlag = "extracted" | "inferred" | "confirmed";

const STYLES: Record<ConfidenceFlag, string> = {
  extracted: "bg-slate-200 text-slate-800",
  inferred: "bg-amber-200 text-amber-900",
  confirmed: "bg-emerald-200 text-emerald-900",
};

const LABELS: Record<ConfidenceFlag, string> = {
  extracted: "From transcript",
  inferred: "AI inferred",
  confirmed: "Doctor confirmed",
};

export function ConfidenceBadge({ flag }: { flag: ConfidenceFlag | undefined }) {
  if (!flag) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLES[flag]}`}
    >
      {LABELS[flag]}
    </span>
  );
}

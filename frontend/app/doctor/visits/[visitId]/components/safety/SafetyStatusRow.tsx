import { Badge } from "@/components/ui/Badge";
import type { Category, Finding, Severity } from "./types";

const CATEGORY_LABEL: Record<Category, string> = {
  DRUG_ALLERGY: "Allergy",
  DDI: "DDI",
  PREGNANCY: "Pregnancy",
  DOSE: "Dose",
  HALLUCINATION: "Hallucination",
  COMPLETENESS: "Completeness",
};

const SEV_RANK: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function variantFor(sev: Severity | undefined) {
  if (sev === "CRITICAL") return "danger" as const;
  if (sev === "HIGH") return "warn" as const;
  if (sev === "MEDIUM") return "primary" as const;
  if (sev === "LOW") return "neutral" as const;
  return "good" as const;
}

export function SafetyStatusRow({
  findings,
  validatorsRun,
}: {
  findings: Finding[];
  validatorsRun: Category[];
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Safety check summary">
      {validatorsRun.map((cat) => {
        const inCat = findings.filter((f) => f.category === cat && !f.acknowledgedAt);
        let topSev: Severity | undefined;
        for (const f of inCat) {
          if (topSev === undefined || SEV_RANK[f.severity] < SEV_RANK[topSev]) {
            topSev = f.severity;
          }
        }
        const label = topSev
          ? `${CATEGORY_LABEL[cat]} · ${inCat.length} ${topSev.toLowerCase()}`
          : `${CATEGORY_LABEL[cat]} · clear`;
        return (
          <Badge key={cat} variant={variantFor(topSev)}>
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

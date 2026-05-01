export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Category =
  | "DRUG_ALLERGY"
  | "DDI"
  | "PREGNANCY"
  | "DOSE"
  | "HALLUCINATION"
  | "COMPLETENESS";

export interface Finding {
  id: string;
  visitId?: string;
  category: Category;
  severity: Severity;
  fieldPath: string | null;
  message: string;
  details: Record<string, unknown>;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgementReason: string | null;
  gmtCreate: string;
}

export type Availability = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

export interface EvaluatorState {
  findings: Finding[];
  availability: Availability;
  loading: boolean;
  error?: string;
}

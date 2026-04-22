// frontend/lib/types/report.ts
// Mirror of agent/app/schemas/report.py::MedicalReport and
// backend/.../MedicalReportDto.java. Field names are camelCase at this layer
// (the backend remaps snake_case to camelCase in its DTO).
//
// See spec §4.7 — single source of truth. Do not drift.

export type ConfidenceFlag = "extracted" | "inferred" | "confirmed";

export interface MedicationOrder {
  drugName: string;
  dose: string;
  frequency: string;
  duration: string;
  route?: string | null;
}

export interface FollowUp {
  needed: boolean;
  timeframe?: string | null;
  reason?: string | null;
}

export interface Subjective {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  symptomDuration?: string | null;
  associatedSymptoms: string[];
  relevantHistory: string[];
}

export interface Objective {
  vitalSigns: Record<string, string>;
  physicalExam?: string | null;
}

export interface Assessment {
  primaryDiagnosis: string;
  differentialDiagnoses: string[];
  icd10Codes: string[];
}

export interface Plan {
  medications: MedicationOrder[];
  investigations: string[];
  lifestyleAdvice: string[];
  followUp: FollowUp;
  redFlags: string[];
}

export interface MedicalReport {
  subjective: Subjective;
  objective: Objective;
  assessment: Assessment;
  plan: Plan;
  confidenceFlags: Record<string, ConfidenceFlag>;
}

export interface Clarification {
  field: string;
  prompt: string;
  context: string;
}

export type ReviewStatus = "complete" | "clarification_pending" | "error";

export interface ReportReviewResult {
  status: ReviewStatus;
  report: MedicalReport | null;
  clarification: Clarification | null;
}

export interface ChatTurn {
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  toolCallName?: string | null;
  createdAt?: string | null;
}

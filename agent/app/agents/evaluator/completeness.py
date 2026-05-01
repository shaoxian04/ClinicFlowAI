from __future__ import annotations

from app.schemas.evaluator import Finding
from app.schemas.report import MedicalReport


def run_completeness(report: MedicalReport) -> list[Finding]:
    findings: list[Finding] = []

    if not report.subjective.chief_complaint.strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="subjective.chief_complaint",
            message="Required field 'subjective.chief_complaint' is empty.",
        ))
    if not report.subjective.history_of_present_illness.strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="subjective.history_of_present_illness",
            message="Required field 'subjective.history_of_present_illness' is empty.",
        ))
    if not report.assessment.primary_diagnosis.strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="assessment.primary_diagnosis",
            message="Required field 'assessment.primary_diagnosis' is empty.",
        ))
    for i, med in enumerate(report.plan.medications):
        for attr in ("drug_name", "dose", "frequency", "duration"):
            if not (getattr(med, attr) or "").strip():
                findings.append(Finding(
                    category="COMPLETENESS", severity="MEDIUM",
                    field_path=f"plan.medications[{i}].{attr}",
                    message=f"Medication entry {i} missing '{attr}'.",
                ))
                break
    fu = report.plan.follow_up
    if fu.needed and not (fu.timeframe or "").strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="plan.follow_up.timeframe",
            message="Follow-up needed but timeframe missing.",
        ))
    return findings

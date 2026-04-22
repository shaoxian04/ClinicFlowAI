from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ConfidenceFlag = Literal["extracted", "inferred", "confirmed"]


class MedicationOrder(BaseModel):
    drug_name: str
    dose: str
    frequency: str
    duration: str
    route: str | None = None


class FollowUp(BaseModel):
    needed: bool
    timeframe: str | None = None
    reason: str | None = None


class Subjective(BaseModel):
    chief_complaint: str
    history_of_present_illness: str
    symptom_duration: str | None = None
    associated_symptoms: list[str] = Field(default_factory=list)
    relevant_history: list[str] = Field(default_factory=list)


class Objective(BaseModel):
    vital_signs: dict[str, str] = Field(default_factory=dict)
    physical_exam: str | None = None


class Assessment(BaseModel):
    primary_diagnosis: str
    differential_diagnoses: list[str] = Field(default_factory=list)
    icd10_codes: list[str] = Field(default_factory=list)


class Plan(BaseModel):
    medications: list[MedicationOrder] = Field(default_factory=list)
    investigations: list[str] = Field(default_factory=list)
    lifestyle_advice: list[str] = Field(default_factory=list)
    follow_up: FollowUp
    red_flags: list[str] = Field(default_factory=list)


class MedicalReport(BaseModel):
    subjective: Subjective
    objective: Objective = Field(default_factory=Objective)
    assessment: Assessment
    plan: Plan
    confidence_flags: dict[str, ConfidenceFlag] = Field(default_factory=dict)


def required_field_is_missing(report: MedicalReport) -> str | None:
    """Return the first required field that is blank/empty, or None if complete."""
    if not report.subjective.chief_complaint.strip():
        return "subjective.chief_complaint"
    if not report.subjective.history_of_present_illness.strip():
        return "subjective.history_of_present_illness"
    if not report.assessment.primary_diagnosis.strip():
        return "assessment.primary_diagnosis"
    for med in report.plan.medications:
        for attr in ("drug_name", "dose", "frequency", "duration"):
            if not getattr(med, attr).strip():
                return "plan.medications"
    if report.plan.follow_up.needed and not (report.plan.follow_up.timeframe or "").strip():
        return "plan.follow_up.needed"
    return None

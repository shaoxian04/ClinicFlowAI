from app.schemas.report import (
    MedicalReport, Subjective, Objective, Assessment, Plan, FollowUp, MedicationOrder,
)
from app.agents.evaluator.completeness import run_completeness


def _draft(**overrides) -> MedicalReport:
    base = MedicalReport(
        subjective=Subjective(chief_complaint="cough", history_of_present_illness="3 days"),
        objective=Objective(),
        assessment=Assessment(primary_diagnosis="URTI"),
        plan=Plan(follow_up=FollowUp(needed=False)),
    )
    if "subjective" in overrides:
        base.subjective = overrides["subjective"]
    if "assessment" in overrides:
        base.assessment = overrides["assessment"]
    if "plan" in overrides:
        base.plan = overrides["plan"]
    return base


def test_clean_draft_no_findings():
    findings = run_completeness(_draft())
    assert findings == []


def test_missing_chief_complaint():
    d = _draft(subjective=Subjective(chief_complaint="", history_of_present_illness="3 days"))
    findings = run_completeness(d)
    assert any(f.field_path == "subjective.chief_complaint" and f.severity == "MEDIUM" for f in findings)


def test_missing_primary_diagnosis():
    d = _draft(assessment=Assessment(primary_diagnosis=""))
    findings = run_completeness(d)
    assert any(f.field_path == "assessment.primary_diagnosis" and f.severity == "MEDIUM" for f in findings)


def test_incomplete_medication():
    d = _draft(plan=Plan(
        follow_up=FollowUp(needed=False),
        medications=[MedicationOrder(drug_name="amoxicillin", dose="", frequency="TDS", duration="5 days")],
    ))
    findings = run_completeness(d)
    assert any(f.field_path.startswith("plan.medications") and f.severity == "MEDIUM" for f in findings)


def test_followup_needed_without_timeframe():
    d = _draft(plan=Plan(follow_up=FollowUp(needed=True, timeframe="")))
    findings = run_completeness(d)
    assert any(f.field_path == "plan.follow_up.timeframe" and f.severity == "MEDIUM" for f in findings)

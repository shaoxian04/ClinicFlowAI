import pytest
from app.graph.queries.dose_range import fetch_dose_rules


@pytest.mark.asyncio
async def test_returns_rule_for_paracetamol_adult():
    rules = await fetch_dose_rules([{"name": "paracetamol", "route": "oral"}],
                                   patient_age_years=30, patient_weight_kg=70)
    assert any(r["drug"] == "paracetamol" and r["max_dose_mg"] == 1000 for r in rules)


@pytest.mark.asyncio
async def test_no_rule_for_paediatric_age():
    rules = await fetch_dose_rules([{"name": "paracetamol", "route": "oral"}],
                                   patient_age_years=5, patient_weight_kg=20)
    # Adult-only rule has min_age 12; should not match for 5yr old
    assert all(r["min_age_years"] is None or r["min_age_years"] <= 5 for r in rules) or rules == []


@pytest.mark.asyncio
async def test_unknown_drug_returns_empty():
    rules = await fetch_dose_rules([{"name": "mystery-drug", "route": "oral"}],
                                   patient_age_years=30, patient_weight_kg=70)
    assert rules == []

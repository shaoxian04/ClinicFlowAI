"""End-to-end evaluator test against real Neo4j (seeded) + real Postgres.

Skipped automatically if DATABASE_URL is not set.
"""
from __future__ import annotations

import json
import os
from uuid import uuid4

import pytest
import pytest_asyncio

from app.agents.evaluator_agent import EvaluatorAgent, EvaluatorContext
from app.persistence import postgres
from app.agents.evaluator import hallucination as halluc_mod
from unittest.mock import AsyncMock

pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"), reason="requires real Postgres"
)


@pytest_asyncio.fixture
async def open_pool():
    pool = await postgres.open_pool()
    yield pool
    await postgres.close_pool()


@pytest.mark.asyncio
async def test_e2e_warfarin_ibuprofen_critical(open_pool, monkeypatch):
    pool = open_pool
    visit_id = uuid4()
    patient_id = uuid4()
    doctor_id = uuid4()

    # Mock the hallucination LLM call so the e2e doesn't need a live LLM
    fake_resp = type("R", (), {"text": json.dumps({"unsupported": []})})()
    monkeypatch.setattr(halluc_mod, "_client_chat", AsyncMock(return_value=fake_resp))

    await pool.execute(
        "INSERT INTO users (id, email, password_hash, role, full_name) "
        "VALUES ($1, $2, 'x', 'DOCTOR', 'Test Doc') ON CONFLICT DO NOTHING",
        doctor_id, f"doc-{doctor_id}@test",
    )
    await pool.execute(
        "INSERT INTO patients (id, full_name, pregnancy_status, weight_kg, date_of_birth) "
        "VALUES ($1, 'Test Patient', 'NOT_PREGNANT', 70, '1990-01-01')",
        patient_id,
    )
    await pool.execute(
        "INSERT INTO visits (id, patient_id, doctor_id, status) VALUES ($1, $2, $3, 'IN_PROGRESS')",
        visit_id, patient_id, doctor_id,
    )
    draft = {
        "subjective": {"chief_complaint": "headache", "history_of_present_illness": "since morning",
                       "associated_symptoms": [], "relevant_history": []},
        "objective": {"vital_signs": {}, "physical_exam": None},
        "assessment": {"primary_diagnosis": "Tension headache",
                       "differential_diagnoses": [], "icd10_codes": []},
        "plan": {
            "medications": [
                {"drug_name": "warfarin", "dose": "5mg", "frequency": "OD", "duration": "30 days"},
                {"drug_name": "ibuprofen", "dose": "400mg", "frequency": "TDS", "duration": "5 days"},
            ],
            "investigations": [], "lifestyle_advice": [],
            "follow_up": {"needed": False}, "red_flags": [],
        },
    }
    await pool.execute(
        "UPDATE visits SET report_draft=$1::jsonb, report_confidence_flags='{}'::jsonb WHERE id=$2",
        json.dumps(draft), visit_id,
    )

    agent = EvaluatorAgent()
    result = await agent.evaluate(EvaluatorContext(visit_id=visit_id, patient_id=patient_id))

    assert any(f.category == "DDI" and f.severity == "CRITICAL" for f in result.findings), \
        f"expected CRITICAL DDI, got: {[f.model_dump() for f in result.findings]}"

    # Cleanup
    await pool.execute("DELETE FROM evaluator_findings WHERE visit_id=$1", visit_id)
    await pool.execute("DELETE FROM visits WHERE id=$1", visit_id)
    await pool.execute("DELETE FROM patients WHERE id=$1", patient_id)
    await pool.execute("DELETE FROM users WHERE id=$1", doctor_id)

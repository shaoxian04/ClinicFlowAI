import uuid
import json

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.persistence import postgres


@pytest.mark.asyncio(loop_scope="module")
async def test_finalize_returns_summary_but_does_not_touch_visits_status(wired_pool, monkeypatch):
    visit_id = uuid.uuid4()
    pool = postgres.get_pool()
    draft = {
        "subjective": {"chief_complaint": "cough", "history_of_present_illness": "3 days"},
        "objective": {}, "assessment": {"primary_diagnosis": "bronchitis"},
        "plan": {"medications": [], "follow_up": {"needed": False}},
    }
    await pool.execute(
        "INSERT INTO visits(id, patient_id, status) VALUES ($1, $2, 'IN_PROGRESS')",
        visit_id, uuid.uuid4(),
    )
    await pool.execute(
        "UPDATE visits SET report_draft = $1::jsonb, report_confidence_flags = '{}'::jsonb WHERE id = $2",
        json.dumps(draft), visit_id,
    )

    # Stub the LLM summary call — we only care about the /finalize contract, not LLM output.
    async def fake_summary(inp):
        from app.tools.report_tools import GeneratePatientSummaryOutput
        return GeneratePatientSummaryOutput(summary_en="EN", summary_ms="MS")

    monkeypatch.setattr("app.routes.report._h_generate_patient_summary", fake_summary)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/agents/report/finalize",
            headers={"X-Service-Token": "change-me"},
            json={"visit_id": str(visit_id)},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary_en"] == "EN"
    assert body["summary_ms"] == "MS"
    assert "report" in body  # must now return the validated draft
    assert body["report"]["subjective"]["chief_complaint"] == "cough"
    assert body["report"]["assessment"]["primary_diagnosis"] == "bronchitis"
    assert "confidence_flags" in body["report"]

    # CRITICAL: agent no longer flips visits.status
    row = await pool.fetchrow("SELECT status FROM visits WHERE id = $1", visit_id)
    assert row["status"] == "IN_PROGRESS", "agent must not write visits.status — backend owns it"


@pytest.mark.asyncio(loop_scope="module")
async def test_finalize_404_when_no_draft(wired_pool, monkeypatch):
    """Visit exists but has no report_draft → HTTP 404."""
    visit_id = uuid.uuid4()
    pool = postgres.get_pool()
    await pool.execute(
        "INSERT INTO visits(id, patient_id, status) VALUES ($1, $2, 'IN_PROGRESS')",
        visit_id, uuid.uuid4(),
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/agents/report/finalize",
            headers={"X-Service-Token": "change-me"},
            json={"visit_id": str(visit_id)},
        )
    assert resp.status_code == 404
    assert "no draft" in resp.json()["detail"].lower()


@pytest.mark.asyncio(loop_scope="module")
async def test_finalize_409_when_required_field_missing(wired_pool, monkeypatch):
    """Draft exists but primary_diagnosis is blank → HTTP 409."""
    visit_id = uuid.uuid4()
    pool = postgres.get_pool()
    bad_draft = {
        "subjective": {"chief_complaint": "cough", "history_of_present_illness": "3d"},
        "objective": {},
        "assessment": {"primary_diagnosis": ""},  # intentionally blank — must trigger 409
        "plan": {"medications": [], "follow_up": {"needed": False}},
    }
    await pool.execute(
        "INSERT INTO visits(id, patient_id, status) VALUES ($1, $2, 'IN_PROGRESS')",
        visit_id, uuid.uuid4(),
    )
    await pool.execute(
        "UPDATE visits SET report_draft = $1::jsonb, report_confidence_flags = '{}'::jsonb WHERE id = $2",
        json.dumps(bad_draft), visit_id,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/agents/report/finalize",
            headers={"X-Service-Token": "change-me"},
            json={"visit_id": str(visit_id)},
        )
    assert resp.status_code == 409
    assert "primary_diagnosis" in resp.json()["detail"]

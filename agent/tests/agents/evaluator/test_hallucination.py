import json
from unittest.mock import AsyncMock, patch
import pytest

from app.schemas.report import MedicalReport, Subjective, Objective, Assessment, Plan, FollowUp
from app.agents.evaluator.hallucination import run_hallucination


def _draft() -> MedicalReport:
    return MedicalReport(
        subjective=Subjective(chief_complaint="cough", history_of_present_illness="3 days"),
        objective=Objective(),
        assessment=Assessment(primary_diagnosis="URTI"),
        plan=Plan(follow_up=FollowUp(needed=False)),
    )


@pytest.mark.asyncio
async def test_returns_no_findings_when_llm_clean():
    fake_resp = type("R", (), {"text": json.dumps({"unsupported": []})})()
    with patch("app.agents.evaluator.hallucination._client_chat", new=AsyncMock(return_value=fake_resp)):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="cough x3 days")
    assert findings == []


@pytest.mark.asyncio
async def test_returns_high_findings_for_unsupported_claims():
    fake_resp = type("R", (), {"text": json.dumps({
        "unsupported": [
            {"field_path": "plan.medications[0].drug_name", "claim": "penicillin", "reason": "not in transcript or context"}
        ]
    })})()
    with patch("app.agents.evaluator.hallucination._client_chat", new=AsyncMock(return_value=fake_resp)):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="cough x3 days")
    assert len(findings) == 1
    assert findings[0].severity == "HIGH"
    assert findings[0].category == "HALLUCINATION"
    assert findings[0].field_path == "plan.medications[0].drug_name"


@pytest.mark.asyncio
async def test_invalid_json_returns_empty():
    fake_resp = type("R", (), {"text": "not json"})()
    with patch("app.agents.evaluator.hallucination._client_chat", new=AsyncMock(return_value=fake_resp)):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="x")
    assert findings == []


@pytest.mark.asyncio
async def test_llm_timeout_returns_empty():
    async def _timeout(*a, **kw):
        raise TimeoutError("simulated")
    with patch("app.agents.evaluator.hallucination._client_chat", new=_timeout):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="x")
    assert findings == []

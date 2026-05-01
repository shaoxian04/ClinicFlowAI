from unittest.mock import AsyncMock, patch
from uuid import uuid4
import pytest

from app.schemas.report import MedicalReport, Subjective, Objective, Assessment, Plan, FollowUp, MedicationOrder
from app.schemas.evaluator import Finding
from app.agents.evaluator_agent import EvaluatorAgent, EvaluatorContext


def _ctx():
    return EvaluatorContext(visit_id=uuid4(), patient_id=uuid4())


def _draft_with_meds():
    return MedicalReport(
        subjective=Subjective(chief_complaint="pain", history_of_present_illness="2 days"),
        objective=Objective(),
        assessment=Assessment(primary_diagnosis="back pain"),
        plan=Plan(
            follow_up=FollowUp(needed=False),
            medications=[MedicationOrder(drug_name="ibuprofen", dose="400mg", frequency="TDS", duration="5 days")],
        ),
    )


@pytest.mark.asyncio
async def test_orchestrator_collects_findings_and_persists():
    agent = EvaluatorAgent()
    with patch.object(agent, "_load_draft", AsyncMock(return_value=_draft_with_meds())), \
         patch.object(agent, "_load_patient_state", AsyncMock(return_value={
             "age_years": 30, "weight_kg": 70.0, "pregnancy_status": "NOT_PREGNANT",
         })), \
         patch.object(agent, "_load_patient_context", AsyncMock(return_value={})), \
         patch.object(agent, "_load_transcript", AsyncMock(return_value="back pain 2 days")), \
         patch("app.agents.evaluator_agent.check_drug_allergy_interaction", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.check_drug_drug_interactions", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_pregnancy_categories", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_dose_rules", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.run_hallucination", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.supersede_active", AsyncMock()), \
         patch("app.agents.evaluator_agent.insert_findings", AsyncMock()) as ins, \
         patch("app.agents.evaluator_agent.get_pool") as gp:
        # Mock pool/conn so the persist block doesn't actually hit Postgres in this unit test
        conn = AsyncMock()
        conn.execute = AsyncMock()
        tx = AsyncMock()
        tx.__aenter__ = AsyncMock(return_value=tx)
        tx.__aexit__ = AsyncMock(return_value=None)
        conn.transaction = lambda: tx
        acq = AsyncMock()
        acq.__aenter__ = AsyncMock(return_value=conn)
        acq.__aexit__ = AsyncMock(return_value=None)
        pool = AsyncMock()
        pool.acquire = lambda: acq
        gp.return_value = pool
        result = await agent.evaluate(_ctx())
    assert result.findings == []
    assert "DRUG_ALLERGY" in result.validators_run
    assert "COMPLETENESS" in result.validators_run
    assert ins.await_count == 1


@pytest.mark.asyncio
async def test_orchestrator_skips_pregnancy_when_not_pregnant():
    agent = EvaluatorAgent()
    pregnancy_mock = AsyncMock(return_value=[])
    with patch.object(agent, "_load_draft", AsyncMock(return_value=_draft_with_meds())), \
         patch.object(agent, "_load_patient_state", AsyncMock(return_value={
             "age_years": 30, "weight_kg": 70.0, "pregnancy_status": "NOT_PREGNANT",
         })), \
         patch.object(agent, "_load_patient_context", AsyncMock(return_value={})), \
         patch.object(agent, "_load_transcript", AsyncMock(return_value="x")), \
         patch("app.agents.evaluator_agent.check_drug_allergy_interaction", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.check_drug_drug_interactions", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_pregnancy_categories", pregnancy_mock), \
         patch("app.agents.evaluator_agent.fetch_dose_rules", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.run_hallucination", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.supersede_active", AsyncMock()), \
         patch("app.agents.evaluator_agent.insert_findings", AsyncMock()), \
         patch("app.agents.evaluator_agent.get_pool") as gp:
        conn = AsyncMock(); conn.execute = AsyncMock()
        tx = AsyncMock(); tx.__aenter__ = AsyncMock(return_value=tx); tx.__aexit__ = AsyncMock(return_value=None)
        conn.transaction = lambda: tx
        acq = AsyncMock(); acq.__aenter__ = AsyncMock(return_value=conn); acq.__aexit__ = AsyncMock(return_value=None)
        pool = AsyncMock(); pool.acquire = lambda: acq
        gp.return_value = pool
        result = await agent.evaluate(_ctx())
    pregnancy_mock.assert_not_awaited()
    assert "PREGNANCY" not in result.validators_run


@pytest.mark.asyncio
async def test_orchestrator_marks_validator_unavailable_on_exception():
    agent = EvaluatorAgent()
    with patch.object(agent, "_load_draft", AsyncMock(return_value=_draft_with_meds())), \
         patch.object(agent, "_load_patient_state", AsyncMock(return_value={
             "age_years": 30, "weight_kg": 70.0, "pregnancy_status": "NOT_PREGNANT",
         })), \
         patch.object(agent, "_load_patient_context", AsyncMock(return_value={})), \
         patch.object(agent, "_load_transcript", AsyncMock(return_value="x")), \
         patch("app.agents.evaluator_agent.check_drug_allergy_interaction", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.check_drug_drug_interactions",
               AsyncMock(side_effect=RuntimeError("neo4j down"))), \
         patch("app.agents.evaluator_agent.fetch_pregnancy_categories", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_dose_rules", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.run_hallucination", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.supersede_active", AsyncMock()), \
         patch("app.agents.evaluator_agent.insert_findings", AsyncMock()), \
         patch("app.agents.evaluator_agent.get_pool") as gp:
        conn = AsyncMock(); conn.execute = AsyncMock()
        tx = AsyncMock(); tx.__aenter__ = AsyncMock(return_value=tx); tx.__aexit__ = AsyncMock(return_value=None)
        conn.transaction = lambda: tx
        acq = AsyncMock(); acq.__aenter__ = AsyncMock(return_value=conn); acq.__aexit__ = AsyncMock(return_value=None)
        pool = AsyncMock(); pool.acquire = lambda: acq
        gp.return_value = pool
        result = await agent.evaluate(_ctx())
    assert any(cat == "DDI" for cat, _ in result.validators_unavailable)

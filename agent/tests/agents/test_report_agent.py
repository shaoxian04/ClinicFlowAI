import json
import uuid
from dataclasses import replace

import pytest
from testcontainers.postgres import PostgresContainer

from app.agents.base import AgentContext
from app.agents.report_agent import ReportAgent
from app.llm.client import ChatResponse, ToolCall
from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository
from app.tools.clinical_tools import TOOL_CLINICAL_DICTIONARY_EXTRACT
from app.tools.graph_tools import TOOL_GET_PATIENT_CONTEXT
from app.tools.meta_tools import TOOL_EMIT_REASONING
from app.tools.report_tools import TOOL_UPDATE_SOAP_DRAFT
from app.tools.spec import ToolRegistry


class FakeLLM:
    def __init__(self, responses): self._responses = list(responses)
    async def chat(self, messages, tools): return self._responses.pop(0)
    async def chat_stream(self, messages, tools):  # pragma: no cover
        raise NotImplementedError


@pytest.fixture(scope="module")
def pg():
    with PostgresContainer("postgres:16-alpine") as pgc:
        yield pgc


@pytest.fixture
async def wired(pg, monkeypatch):
    monkeypatch.setattr("app.config.settings.postgres_dsn", pg.get_connection_url().replace("+psycopg2", ""))
    pool = await postgres.open_pool()
    async with pool.acquire() as c:
        await c.execute("""
        CREATE TABLE IF NOT EXISTS visits(
          id UUID PRIMARY KEY,
          report_draft JSONB,
          report_confidence_flags JSONB
        );
        CREATE TABLE IF NOT EXISTS agent_turns (
          id BIGSERIAL PRIMARY KEY, visit_id UUID NOT NULL, agent_type VARCHAR(32) NOT NULL,
          turn_index INTEGER NOT NULL, role VARCHAR(16) NOT NULL, content TEXT NOT NULL,
          reasoning TEXT, tool_call_name VARCHAR(64), tool_call_args JSONB, tool_result JSONB,
          created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (visit_id, agent_type, turn_index));
        """)
    yield
    await postgres.close_pool()


@pytest.mark.asyncio
async def test_report_agent_happy_path_persists_draft(wired, monkeypatch):
    vid = uuid.uuid4()
    pid = uuid.uuid4()
    async with postgres.get_pool().acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", vid)

    async def fake_patient_ctx(_inp):
        from app.tools.graph_tools import GetPatientContextOutput
        return GetPatientContextOutput(
            patient_id=str(pid), allergies=["Penicillin"], conditions=[], medications=[],
        )

    patient_ctx_tool = replace(TOOL_GET_PATIENT_CONTEXT, handler=fake_patient_ctx)

    draft_json = json.dumps({
        "subjective": {"chief_complaint": "Fever", "history_of_present_illness": "3 days of fever"},
        "objective": {"vital_signs": {}, "physical_exam": None},
        "assessment": {"primary_diagnosis": "Viral URTI", "differential_diagnoses": [], "icd10_codes": ["J06.9"]},
        "plan": {"medications": [], "investigations": [], "lifestyle_advice": [],
                 "follow_up": {"needed": False, "timeframe": None, "reason": None}, "red_flags": []},
        "confidence_flags": {},
    })

    llm = FakeLLM([
        ChatResponse(text="", tool_calls=[
            ToolCall(id="a", name="get_patient_context", arguments={"patient_id": str(pid)}),
        ], finish_reason="tool_calls"),
        ChatResponse(text="", tool_calls=[
            ToolCall(id="b", name="clinical_dictionary_extract", arguments={"text": "fever 3 days J06.9"}),
        ], finish_reason="tool_calls"),
        ChatResponse(text="", tool_calls=[
            ToolCall(id="c", name="update_soap_draft",
                     arguments={"visit_id": str(vid), "report": json.loads(draft_json)}),
        ], finish_reason="tool_calls"),
        ChatResponse(text="Draft complete.", tool_calls=[], finish_reason="stop"),
    ])

    reg = ToolRegistry([
        patient_ctx_tool,
        TOOL_CLINICAL_DICTIONARY_EXTRACT,
        TOOL_UPDATE_SOAP_DRAFT,
        TOOL_EMIT_REASONING,
    ])
    reg.register_allowlist("report", [
        "get_patient_context", "clinical_dictionary_extract",
        "update_soap_draft", "emit_reasoning",
    ])

    agent = ReportAgent(llm=llm, registry=reg, turns=AgentTurnRepository())
    ctx = AgentContext(visit_id=vid, patient_id=pid, doctor_id=uuid.uuid4())

    events = []
    async for ev in agent.step(ctx, user_input="Transcript: fever 3 days"):
        events.append(ev)

    kinds = [e.event for e in events]
    assert kinds.count("tool.call") == 3
    assert kinds.count("tool.result") == 3
    assert "turn.complete" in kinds

    async with postgres.get_pool().acquire() as c:
        row = await c.fetchrow("SELECT report_draft FROM visits WHERE id=$1", vid)
    stored = json.loads(row["report_draft"])
    assert stored["subjective"]["chief_complaint"] == "Fever"
    assert stored["assessment"]["primary_diagnosis"] == "Viral URTI"


import pytest as _pytest  # noqa: E402
from app.agents.base import ClarificationRequested  # noqa: E402


@pytest.mark.asyncio
async def test_report_agent_clarification_pauses_before_completing(wired, monkeypatch):
    vid = uuid.uuid4()
    pid = uuid.uuid4()
    async with postgres.get_pool().acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", vid)

    async def fake_patient_ctx(_inp):
        from app.tools.graph_tools import GetPatientContextOutput
        return GetPatientContextOutput(patient_id=str(pid))

    patient_ctx_tool = replace(TOOL_GET_PATIENT_CONTEXT, handler=fake_patient_ctx)

    from app.tools.report_tools import TOOL_ASK_DOCTOR_CLARIFICATION
    llm = FakeLLM([
        ChatResponse(text="", tool_calls=[
            ToolCall(id="a", name="get_patient_context", arguments={"patient_id": str(pid)}),
        ], finish_reason="tool_calls"),
        ChatResponse(text="", tool_calls=[
            ToolCall(id="b", name="ask_doctor_clarification",
                     arguments={
                         "field": "assessment.primary_diagnosis",
                         "prompt": "What was your primary diagnosis?",
                         "context": "Transcript mentions fever but no diagnosis stated.",
                     }),
        ], finish_reason="tool_calls"),
    ])

    reg = ToolRegistry([patient_ctx_tool, TOOL_ASK_DOCTOR_CLARIFICATION])
    reg.register_allowlist("report", ["get_patient_context", "ask_doctor_clarification"])

    agent = ReportAgent(llm=llm, registry=reg, turns=AgentTurnRepository())
    ctx = AgentContext(visit_id=vid, patient_id=pid, doctor_id=uuid.uuid4())

    events: list = []
    with _pytest.raises(ClarificationRequested) as exc_info:
        async for ev in agent.step(ctx, user_input="Transcript: fever only"):
            events.append(ev)

    assert exc_info.value.call.arguments["field"] == "assessment.primary_diagnosis"
    kinds = [e.event for e in events]
    assert "tool.call" in kinds
    assert "turn.complete" in kinds

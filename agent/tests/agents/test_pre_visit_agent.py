import json
import uuid
from dataclasses import replace

import pytest
from testcontainers.postgres import PostgresContainer

from app.agents.pre_visit_agent import PreVisitIntakeAgent
from app.agents.base import AgentContext
from app.llm.client import ChatResponse, ToolCall
from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository
from app.tools.spec import ToolRegistry
from app.tools.graph_tools import TOOL_GET_PATIENT_CONTEXT, TOOL_GET_VISIT_HISTORY


class FakeLLM:
    def __init__(self, responses: list[ChatResponse]) -> None:
        self._responses = list(responses)

    async def chat(self, messages, tools):  # noqa: ARG002
        return self._responses.pop(0)

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
        CREATE TABLE IF NOT EXISTS visits(id UUID PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS agent_turns (
          id BIGSERIAL PRIMARY KEY, visit_id UUID NOT NULL, agent_type VARCHAR(32) NOT NULL,
          turn_index INTEGER NOT NULL, role VARCHAR(16) NOT NULL, content TEXT NOT NULL,
          reasoning TEXT, tool_call_name VARCHAR(64), tool_call_args JSONB, tool_result JSONB,
          created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (visit_id, agent_type, turn_index));
        """)
    yield
    await postgres.close_pool()


@pytest.mark.asyncio
async def test_pre_visit_first_turn_calls_graph_tools_then_asks_confirmation(wired, monkeypatch):
    vid = uuid.uuid4()
    pid = uuid.uuid4()
    async with postgres.get_pool().acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", vid)

    async def fake_patient_ctx(_inp):
        from app.tools.graph_tools import GetPatientContextOutput
        return GetPatientContextOutput(
            patient_id=str(pid), demographics={"full_name": "Siti"},
            allergies=["Penicillin"], conditions=[], medications=["Metformin 500mg"],
        )

    async def fake_history(_inp):
        from app.tools.graph_tools import GetVisitHistoryOutput
        return GetVisitHistoryOutput(entries=[])

    patient_ctx_tool = replace(TOOL_GET_PATIENT_CONTEXT, handler=fake_patient_ctx)
    history_tool = replace(TOOL_GET_VISIT_HISTORY, handler=fake_history)

    llm = FakeLLM([
        ChatResponse(
            text="<thinking>I need context first.</thinking>",
            tool_calls=[
                ToolCall(id="c1", name="get_patient_context", arguments={"patient_id": str(pid)}),
                ToolCall(id="c2", name="get_visit_history", arguments={"patient_id": str(pid), "limit": 5}),
            ],
            finish_reason="tool_calls",
        ),
        ChatResponse(
            text="<thinking>Confirm penicillin allergy first.</thinking>Hi Siti — our records show you're allergic to Penicillin. Is that still correct? (yes / no / update)",
            tool_calls=[],
            finish_reason="stop",
        ),
    ])

    reg = ToolRegistry([patient_ctx_tool, history_tool])
    reg.register_allowlist("pre_visit", ["get_patient_context", "get_visit_history"])

    agent = PreVisitIntakeAgent(llm=llm, registry=reg, turns=AgentTurnRepository())
    ctx = AgentContext(visit_id=vid, patient_id=pid, doctor_id=None)

    events = []
    async for ev in agent.step(ctx, user_input=""):
        events.append(ev)

    event_kinds = [e.event for e in events]
    assert "tool.call" in event_kinds
    assert "tool.result" in event_kinds
    assert "message.delta" in event_kinds
    final_msg = next(e for e in events if e.event == "message.delta")
    assert "Penicillin" in final_msg.data["text"]
    assert "still correct" in final_msg.data["text"]

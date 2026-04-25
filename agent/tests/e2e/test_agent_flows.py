import json
import uuid
from pathlib import Path

import httpx
import pytest
import respx
from testcontainers.postgres import PostgresContainer

from app.agents.base import AgentContext
from app.agents.report_agent import ReportAgent
from app.llm.openai_client import OpenAIClient
from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository
from app.tools.registry import build_registry


@pytest.fixture(scope="module")
def pg():
    with PostgresContainer("postgres:16-alpine") as c:
        yield c


@pytest.fixture
async def wired(pg, monkeypatch):
    monkeypatch.setattr(
        "app.config.settings.postgres_dsn",
        pg.get_connection_url().replace("+psycopg2", ""),
    )
    pool = await postgres.open_pool()
    async with pool.acquire() as c:
        await c.execute(
            """
            CREATE TABLE IF NOT EXISTS visits(
              id UUID PRIMARY KEY,
              report_draft JSONB,
              report_confidence_flags JSONB
            );
            CREATE TABLE IF NOT EXISTS agent_turns (
              id BIGSERIAL PRIMARY KEY,
              visit_id UUID NOT NULL,
              agent_type VARCHAR(32) NOT NULL,
              turn_index INTEGER NOT NULL,
              role VARCHAR(16) NOT NULL,
              content TEXT NOT NULL,
              reasoning TEXT,
              tool_call_name VARCHAR(64),
              tool_call_args JSONB,
              tool_result JSONB,
              created_at TIMESTAMPTZ DEFAULT now(),
              UNIQUE (visit_id, agent_type, turn_index)
            );
            """
        )
    yield
    await postgres.close_pool()


def _to_sse_stream(fixture: dict) -> bytes:
    # OpenAIClient.chat() reads SSE; convert a non-streaming completion fixture
    # into a single delta chunk + [DONE] sentinel.
    msg = fixture["choices"][0]["message"]
    finish = fixture["choices"][0].get("finish_reason", "stop")
    delta_chunk = {
        "choices": [
            {
                "index": 0,
                "delta": {"content": msg.get("content", "")},
                "finish_reason": None,
            }
        ]
    }
    final_chunk = {
        "choices": [{"index": 0, "delta": {}, "finish_reason": finish}]
    }
    return (
        f"data: {json.dumps(delta_chunk)}\n\n"
        f"data: {json.dumps(final_chunk)}\n\n"
        f"data: [DONE]\n\n"
    ).encode()


@pytest.mark.asyncio
async def test_report_agent_wiremock_happy_path(wired):
    vid = uuid.uuid4()
    pid = uuid.uuid4()
    did = uuid.uuid4()
    async with postgres.get_pool().acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", vid)

    fixture = json.loads(
        (Path(__file__).parent / "wiremock" / "openai_generate.json").read_text()
    )
    sse_body = _to_sse_stream(fixture)

    with respx.mock(base_url="https://api.openai.com/v1") as mock:
        mock.post("/chat/completions").mock(
            return_value=httpx.Response(
                200,
                content=sse_body,
                headers={"content-type": "text/event-stream"},
            )
        )

        llm = OpenAIClient(
            api_key="sk-test",
            base_url="https://api.openai.com/v1",
            model="gpt-4o-mini",
        )
        registry = build_registry()
        agent = ReportAgent(llm=llm, registry=registry, turns=AgentTurnRepository())
        ctx = AgentContext(visit_id=vid, patient_id=pid, doctor_id=did)

        events = []
        async for ev in agent.step(ctx, user_input="Short transcript with no issues."):
            events.append(ev)

    kinds = [e.event for e in events]
    assert "turn.start" in kinds
    assert "turn.complete" in kinds
    assert any(
        e.event == "message.delta" and "Report generated" in e.data["text"]
        for e in events
    )

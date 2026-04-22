import uuid

import httpx
import pytest
from testcontainers.postgres import PostgresContainer

from app.main import app
from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository, TurnRecord


@pytest.fixture(scope="module")
def pg():
    with PostgresContainer("postgres:16-alpine") as pgc:
        yield pgc


@pytest.fixture
async def wired_pool(pg, monkeypatch):
    """Spin up a testcontainer Postgres, open a real pool, and create the
    schema.  Patch out the lifespan open/close noops so that TestClient does
    not double-open or attempt to connect to a non-existent host, and patch
    out the Neo4j schema apply and the OpenAI key guard so the lifespan does
    not bail before the route is reachable.
    """
    monkeypatch.setattr(
        "app.config.settings.postgres_dsn",
        pg.get_connection_url().replace("+psycopg2", ""),
    )
    pool = await postgres.open_pool()
    async with pool.acquire() as c:
        await c.execute("""
        CREATE TABLE IF NOT EXISTS visits (id UUID PRIMARY KEY);
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
        """)

    # Prevent the lifespan from opening/closing the pool a second time.
    async def _noop_open():
        return None

    async def _noop_close():
        return None

    monkeypatch.setattr("app.persistence.postgres.open_pool", _noop_open)
    monkeypatch.setattr("app.persistence.postgres.close_pool", _noop_close)

    # Patch out the non-fatal Neo4j apply so no network call is made.
    async def _noop_apply():
        return None

    monkeypatch.setattr("app.graph.schema.apply_schema", _noop_apply)

    # Patch the OpenAI key so _assert_no_placeholder_secrets() does not fatal.
    monkeypatch.setattr("app.config.settings.openai_api_key", "sk-test")

    yield

    # Restore the real close_pool reference before tearing down.
    monkeypatch.setattr("app.persistence.postgres.close_pool", postgres.close_pool)
    await postgres.close_pool()


@pytest.mark.asyncio
async def test_get_chat_returns_user_and_assistant_turns_only(wired_pool):
    visit_id = uuid.uuid4()
    repo = AgentTurnRepository()

    # Insert a visit row first (visits FK).
    pool = postgres.get_pool()
    async with pool.acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", visit_id)

    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=0,
        role="system", content="sys", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))
    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=1,
        role="user", content="doctor typed edit", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))
    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=2,
        role="tool", content="{}", reasoning=None,
        tool_call_name="get_patient_context", tool_call_args={}, tool_result={},
    ))
    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=3,
        role="assistant", content="updated follow-up", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            f"/agents/report/chat?visit_id={visit_id}&agent_type=report",
            headers={"X-Service-Token": "change-me"},
        )
    assert resp.status_code == 200
    body = resp.json()
    roles = [t["role"] for t in body["turns"]]
    assert roles == ["user", "assistant"]  # system + tool filtered out
    assert body["turns"][0]["content"] == "doctor typed edit"
    assert body["turns"][1]["content"] == "updated follow-up"
    assert "turn_index" in body["turns"][0]
    assert "created_at" in body["turns"][0]

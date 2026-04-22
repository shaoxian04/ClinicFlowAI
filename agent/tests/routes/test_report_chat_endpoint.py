import uuid

import httpx
import pytest
import pytest_asyncio
from testcontainers.postgres import PostgresContainer

from app.main import app
from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository, TurnRecord


@pytest.fixture(scope="module")
def pg():
    with PostgresContainer("postgres:16-alpine") as pgc:
        yield pgc


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def wired_pool(pg):
    """Spin up a testcontainer Postgres, open a real pool, and create the
    schema.  Patch out the lifespan open/close noops so that TestClient does
    not double-open or attempt to connect to a non-existent host, and patch
    out the Neo4j schema apply and the OpenAI key guard so the lifespan does
    not bail before the route is reachable.

    Module-scoped so that all three tests in this file share one event loop
    and one asyncpg pool — required because function-scoped loops would close
    the pool between tests on Windows/Python 3.10.
    """
    mp = pytest.MonkeyPatch()
    mp.setattr(
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

    mp.setattr("app.persistence.postgres.open_pool", _noop_open)
    mp.setattr("app.persistence.postgres.close_pool", _noop_close)

    # Patch out the non-fatal Neo4j apply so no network call is made.
    async def _noop_apply():
        return None

    mp.setattr("app.graph.schema.apply_schema", _noop_apply)

    # Patch the OpenAI key so _assert_no_placeholder_secrets() does not fatal.
    mp.setattr("app.config.settings.openai_api_key", "sk-test")

    yield

    # Restore the real close_pool reference before tearing down.
    mp.setattr("app.persistence.postgres.close_pool", postgres.close_pool)
    await postgres.close_pool()
    mp.undo()


@pytest.mark.asyncio(loop_scope="module")
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


@pytest.mark.asyncio(loop_scope="module")
async def test_get_chat_unknown_visit_returns_empty_turns(wired_pool):
    """Reading chat for a visit_id that has no agent_turns rows returns HTTP 200
    with an empty turns list — a read-only projection, not a lookup that 404s."""
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            f"/agents/report/chat?visit_id={uuid.uuid4()}&agent_type=report",
            headers={"X-Service-Token": "change-me"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"turns": []}


@pytest.mark.asyncio(loop_scope="module")
async def test_get_chat_empty_roles_returns_400(wired_pool):
    """Passing roles= (empty) should be a 400, not silent no-op.
    Prevents a common misconfig footgun for backend callers."""
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            f"/agents/report/chat?visit_id={uuid.uuid4()}&agent_type=report&roles=",
            headers={"X-Service-Token": "change-me"},
        )
    assert resp.status_code == 400
    assert "roles" in resp.json()["detail"].lower()

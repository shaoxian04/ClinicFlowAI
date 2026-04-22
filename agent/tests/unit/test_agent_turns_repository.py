import uuid

import pytest
from testcontainers.postgres import PostgresContainer

from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository, TurnRecord


@pytest.fixture(scope="module")
def pg():
    with PostgresContainer("postgres:16-alpine") as pgc:
        yield pgc


@pytest.fixture
async def repo(pg, monkeypatch):
    monkeypatch.setattr("app.config.settings.postgres_dsn", pg.get_connection_url().replace("+psycopg2", ""))
    pool = await postgres.open_pool()
    async with pool.acquire() as con:
        await con.execute("""
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
    yield AgentTurnRepository()
    await postgres.close_pool()


@pytest.mark.asyncio
async def test_append_and_load(repo):
    vid = uuid.uuid4()
    async with postgres.get_pool().acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", vid)

    await repo.append(TurnRecord(
        visit_id=vid, agent_type="pre_visit", turn_index=0,
        role="system", content="boot", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))
    await repo.append(TurnRecord(
        visit_id=vid, agent_type="pre_visit", turn_index=1,
        role="assistant", content="hi", reasoning="<thinking>plan</thinking>",
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))
    turns = await repo.load(vid, "pre_visit")
    assert [t.turn_index for t in turns] == [0, 1]
    assert turns[1].reasoning == "<thinking>plan</thinking>"


@pytest.mark.asyncio
async def test_duplicate_turn_index_rejected(repo):
    vid = uuid.uuid4()
    async with postgres.get_pool().acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", vid)
    await repo.append(TurnRecord(
        visit_id=vid, agent_type="pre_visit", turn_index=0,
        role="system", content="a", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))
    with pytest.raises(Exception):  # asyncpg.UniqueViolationError
        await repo.append(TurnRecord(
            visit_id=vid, agent_type="pre_visit", turn_index=0,
            role="system", content="b", reasoning=None,
            tool_call_name=None, tool_call_args=None, tool_result=None,
        ))

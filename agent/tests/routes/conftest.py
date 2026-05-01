"""Shared fixtures for route integration tests.

Provides a real Postgres pool backed by a testcontainers-managed container,
with the full schema needed by any `/agents/report/*` or `/agents/pre-visit/*`
route test. Module-scoped loop to match asyncpg's event-loop binding on
Windows/Python 3.10 (see individual tests for why).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from testcontainers.postgres import PostgresContainer

from app.persistence import postgres as _pg_mod


@pytest.fixture(scope="module")
def pg():
    with PostgresContainer("postgres:16-alpine") as pgc:
        yield pgc


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def wired_pool(pg):
    """Opens a real asyncpg pool on the test's module-scoped event loop and
    applies the maximal schema covering every route test. Tears down cleanly.

    The _pg_mod._pool = None reset is required because asyncpg connections
    bind to the event loop that was current when create_pool() was called.
    pytest-asyncio with loop_scope="module" creates a fresh loop per module,
    so a prior module's pool (bound to its now-closed loop) must be cleared
    before open_pool() can be called safely on the new loop.
    """
    mp = pytest.MonkeyPatch()
    mp.setattr("app.config.settings.postgres_dsn",
               pg.get_connection_url().replace("+psycopg2", ""))
    mp.setattr("app.config.settings.openai_api_key", "sk-test")
    mp.setattr("app.config.settings.agent_service_token", "change-me")

    # Defuse lifespan I/O the app would otherwise do on startup
    async def _noop_schema(): return None
    mp.setattr("app.main.apply_schema", _noop_schema)

    # Clear any stale pool bound to a prior module's (now-closed) loop
    _pg_mod._pool = None

    pool = await _pg_mod.open_pool()
    async with pool.acquire() as c:
        await c.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id UUID PRIMARY KEY,
            patient_id UUID,
            doctor_id UUID,
            status TEXT DEFAULT 'IN_PROGRESS',
            started_at TIMESTAMPTZ DEFAULT now(),
            finalized_at TIMESTAMPTZ,
            report_draft JSONB,
            report_confidence_flags JSONB
        );
        CREATE TABLE IF NOT EXISTS agent_turns (
          id BIGSERIAL PRIMARY KEY,
          visit_id UUID NOT NULL REFERENCES visits(id),
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
        -- Required by /agents/report/finalize, which now calls
        -- has_unacked_critical(visit_id) before generating the summary.
        CREATE TABLE IF NOT EXISTS evaluator_findings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          visit_id UUID NOT NULL REFERENCES visits(id),
          category VARCHAR(32) NOT NULL,
          severity VARCHAR(16) NOT NULL,
          field_path VARCHAR(255),
          message TEXT NOT NULL,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          acknowledged_at TIMESTAMPTZ,
          acknowledged_by UUID,
          acknowledgement_reason VARCHAR(255),
          superseded_at TIMESTAMPTZ,
          gmt_create TIMESTAMPTZ NOT NULL DEFAULT now(),
          gmt_modified TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """)
    yield
    await _pg_mod.close_pool()
    mp.undo()

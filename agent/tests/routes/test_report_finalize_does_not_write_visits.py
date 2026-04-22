import uuid
import json

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from testcontainers.postgres import PostgresContainer

from app.main import app
from app.persistence import postgres


@pytest.fixture(scope="module")
def pg():
    with PostgresContainer("postgres:16-alpine") as pgc:
        yield pgc


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def wired_pool(pg):
    """Spin up a testcontainer Postgres, open a real pool, and create the
    schema needed by /finalize.  Module-scoped so all tests in this file
    share one event loop and one asyncpg pool (required on Windows/Python 3.10).

    Force-resets the module-level _pool singleton to None before opening so that
    when this module runs after test_report_chat_endpoint (which closes the prior
    pool), a fresh pool is created on the current event loop.
    """
    mp = pytest.MonkeyPatch()
    # Reset any stale pool from a prior module before patching the DSN.
    import app.persistence.postgres as _pg_mod
    _pg_mod._pool = None

    mp.setattr(
        "app.config.settings.postgres_dsn",
        pg.get_connection_url().replace("+psycopg2", ""),
    )
    pool = await postgres.open_pool()
    await pool.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id UUID PRIMARY KEY,
            patient_id UUID,
            status VARCHAR(32) DEFAULT 'IN_PROGRESS',
            report_draft JSONB,
            report_confidence_flags JSONB,
            finalized_at TIMESTAMPTZ
        )
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

    # CRITICAL: agent no longer flips visits.status
    row = await pool.fetchrow("SELECT status FROM visits WHERE id = $1", visit_id)
    assert row["status"] == "IN_PROGRESS", "agent must not write visits.status — backend owns it"

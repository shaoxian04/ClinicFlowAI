import uuid

import httpx
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from app.main import app


def test_healthz_returns_ok_when_neo4j_up(monkeypatch):
    async def fake_probe():
        return True
    monkeypatch.setattr("app.routes.patient_context._probe_neo4j", fake_probe)
    client = TestClient(app)
    r = client.get("/agents/patient-context/healthz", headers={"X-Service-Token": "change-me"})
    assert r.status_code == 200
    assert r.json() == {"neo4j": "ok"}


def test_healthz_returns_unavailable_when_neo4j_down(monkeypatch):
    async def fake_probe():
        return False
    monkeypatch.setattr("app.routes.patient_context._probe_neo4j", fake_probe)
    client = TestClient(app)
    r = client.get("/agents/patient-context/healthz", headers={"X-Service-Token": "change-me"})
    assert r.status_code == 503
    assert r.json() == {"neo4j": "unavailable"}


# ---------------------------------------------------------------------------
# Neo4j testcontainer tests — skipped automatically when Docker is unavailable
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def neo4j():
    try:
        from testcontainers.neo4j import Neo4jContainer
        with Neo4jContainer("neo4j:5.24") as n4j:
            yield n4j
    except Exception:
        pytest.skip("Docker not available for Neo4j container")


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def neo4j_app(neo4j):
    """Patches the settings singleton to point at the test container and resets
    the driver so all tests in the module share one live Neo4j connection.

    Uses pytest.MonkeyPatch() directly (not the function-scoped `monkeypatch`
    fixture) so this module-scoped fixture can undo its patches on teardown.
    """
    from app.config import settings
    from app.graph.driver import close_driver
    mp = pytest.MonkeyPatch()
    mp.setattr(settings, "neo4j_uri", neo4j.get_connection_url())
    mp.setattr(settings, "neo4j_user", "neo4j")
    mp.setattr(settings, "neo4j_password", neo4j.password)
    await close_driver()
    yield
    await close_driver()
    mp.undo()


@pytest.mark.asyncio(loop_scope="module")
async def test_get_patient_context_returns_empty_for_unknown_patient(neo4j_app):
    pid = uuid.uuid4()
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get(
            f"/agents/patient-context/{pid}",
            headers={"X-Service-Token": "change-me"},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == str(pid)
    assert body["allergies"] == []
    assert body["conditions"] == []
    assert body["medications"] == []
    assert body["recent_visits"] == []


@pytest.mark.asyncio(loop_scope="module")
async def test_get_patient_context_returns_seeded_data(neo4j_app):
    from app.graph.driver import get_driver
    pid = str(uuid.uuid4())
    vid = str(uuid.uuid4())
    driver = get_driver()
    async with driver.session() as session:
        await session.run("""
            MERGE (p:Patient {id: $pid}) SET p.full_name = 'Test'
            MERGE (a:Allergy {name: 'Penicillin'}) MERGE (p)-[:ALLERGIC_TO]->(a)
            MERGE (c:Condition {name: 'Asthma'}) MERGE (p)-[:HAS_CONDITION]->(c)
            MERGE (m:Medication {name: 'Salbutamol'}) MERGE (p)-[:TAKES]->(m)
            MERGE (v:Visit {id: $vid}) SET v.visited_at='2026-01-01', v.patient_id=$pid
            MERGE (p)-[:HAD_VISIT]->(v)
            MERGE (d:Diagnosis {code: 'J06.9', name: 'URTI'})
            MERGE (v)-[:DIAGNOSED_AS]->(d)
        """, pid=pid, vid=vid)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get(
            f"/agents/patient-context/{pid}",
            headers={"X-Service-Token": "change-me"},
        )
    assert r.status_code == 200
    body = r.json()
    assert "Penicillin" in body["allergies"]
    assert "Asthma" in body["conditions"]
    assert "Salbutamol" in body["medications"]
    assert len(body["recent_visits"]) == 1
    assert body["recent_visits"][0]["primary_diagnosis"] == "URTI"


@pytest.mark.asyncio(loop_scope="module")
async def test_seed_demo_bulk_creates_bundle_per_patient(neo4j_app):
    pid1 = str(uuid.uuid4())
    pid2 = str(uuid.uuid4())
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post("/agents/patient-context/seed-demo-bulk", json={
            "patients": [
                {"id": pid1, "full_name": "Alice", "dob": "1990-01-01", "gender": "FEMALE"},
                {"id": pid2, "full_name": "Bob",   "dob": "1985-05-05", "gender": "MALE"},
            ]
        }, headers={"X-Service-Token": "change-me"})
        assert r.status_code == 200
        assert r.json()["seeded"] == 2

        ctx1 = (await client.get(
            f"/agents/patient-context/{pid1}", headers={"X-Service-Token": "change-me"}
        )).json()
        assert "Penicillin" in ctx1["allergies"]
        assert "Type 2 Diabetes" in ctx1["conditions"]
        assert len(ctx1["recent_visits"]) == 2

        ctx2 = (await client.get(
            f"/agents/patient-context/{pid2}", headers={"X-Service-Token": "change-me"}
        )).json()
        assert "Penicillin" in ctx2["allergies"]
        assert "Type 2 Diabetes" in ctx2["conditions"]
        assert len(ctx2["recent_visits"]) == 2

        # Idempotent: re-run doesn't duplicate
        r2 = await client.post("/agents/patient-context/seed-demo-bulk", json={
            "patients": [{"id": pid1, "full_name": "Alice", "dob": "1990-01-01", "gender": "FEMALE"}]
        }, headers={"X-Service-Token": "change-me"})
        assert r2.status_code == 200
        ctx1b = (await client.get(
            f"/agents/patient-context/{pid1}", headers={"X-Service-Token": "change-me"}
        )).json()
        assert len(ctx1b["allergies"]) == 2       # Penicillin + Peanuts
        assert len(ctx1b["recent_visits"]) == 2   # still 2, not 4

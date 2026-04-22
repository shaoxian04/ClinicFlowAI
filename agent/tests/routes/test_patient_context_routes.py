import uuid

import pytest
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


@pytest.fixture
def neo4j_app(neo4j, monkeypatch):
    import asyncio
    from app.graph.driver import close_driver
    monkeypatch.setenv("NEO4J_URI", neo4j.get_connection_url())
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", neo4j.NEO4J_ADMIN_PASSWORD)
    asyncio.run(close_driver())
    yield
    asyncio.run(close_driver())


def test_get_patient_context_returns_empty_for_unknown_patient(neo4j_app):
    client = TestClient(app)
    pid = uuid.uuid4()
    r = client.get(f"/agents/patient-context/{pid}")
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == str(pid)
    assert body["allergies"] == []
    assert body["conditions"] == []
    assert body["medications"] == []
    assert body["recent_visits"] == []


def test_get_patient_context_returns_seeded_data(neo4j_app):
    import asyncio
    from app.graph.driver import get_driver
    pid = str(uuid.uuid4())
    vid = str(uuid.uuid4())
    driver = get_driver()
    async def seed():
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
    asyncio.run(seed())
    client = TestClient(app)
    r = client.get(f"/agents/patient-context/{pid}")
    assert r.status_code == 200
    body = r.json()
    assert "Penicillin" in body["allergies"]
    assert "Asthma" in body["conditions"]
    assert "Salbutamol" in body["medications"]
    assert len(body["recent_visits"]) == 1
    assert body["recent_visits"][0]["primary_diagnosis"] == "URTI"


def test_seed_demo_bulk_creates_bundle_per_patient(neo4j_app):
    client = TestClient(app)
    pid1 = str(uuid.uuid4())
    pid2 = str(uuid.uuid4())

    r = client.post("/agents/patient-context/seed-demo-bulk", json={
        "patients": [
            {"id": pid1, "full_name": "Alice", "dob": "1990-01-01", "gender": "FEMALE"},
            {"id": pid2, "full_name": "Bob",   "dob": "1985-05-05", "gender": "MALE"},
        ]
    }, headers={"X-Service-Token": "change-me"})
    assert r.status_code == 200
    assert r.json()["seeded"] == 2

    ctx1 = client.get(f"/agents/patient-context/{pid1}", headers={"X-Service-Token": "change-me"}).json()
    assert "Penicillin" in ctx1["allergies"]
    assert "Type 2 Diabetes" in ctx1["conditions"]
    assert len(ctx1["recent_visits"]) == 2

    ctx2 = client.get(f"/agents/patient-context/{pid2}", headers={"X-Service-Token": "change-me"}).json()
    assert "Penicillin" in ctx2["allergies"]
    assert "Type 2 Diabetes" in ctx2["conditions"]
    assert len(ctx2["recent_visits"]) == 2

    # Idempotent: re-run doesn't duplicate
    r2 = client.post("/agents/patient-context/seed-demo-bulk", json={
        "patients": [{"id": pid1, "full_name": "Alice", "dob": "1990-01-01", "gender": "FEMALE"}]
    }, headers={"X-Service-Token": "change-me"})
    assert r2.status_code == 200
    ctx1b = client.get(f"/agents/patient-context/{pid1}", headers={"X-Service-Token": "change-me"}).json()
    assert len(ctx1b["allergies"]) == 2       # Penicillin + Peanuts
    assert len(ctx1b["recent_visits"]) == 2   # still 2, not 4

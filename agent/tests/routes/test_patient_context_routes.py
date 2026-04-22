from fastapi.testclient import TestClient

from app.main import app


def test_healthz_returns_ok_when_neo4j_up(monkeypatch):
    async def fake_probe():
        return True
    monkeypatch.setattr("app.routes.patient_context._probe_neo4j", fake_probe)
    client = TestClient(app)
    r = client.get("/agents/patient-context/healthz")
    assert r.status_code == 200
    assert r.json() == {"neo4j": "ok"}


def test_healthz_returns_unavailable_when_neo4j_down(monkeypatch):
    async def fake_probe():
        return False
    monkeypatch.setattr("app.routes.patient_context._probe_neo4j", fake_probe)
    client = TestClient(app)
    r = client.get("/agents/patient-context/healthz")
    assert r.status_code == 503
    assert r.json() == {"neo4j": "unavailable"}

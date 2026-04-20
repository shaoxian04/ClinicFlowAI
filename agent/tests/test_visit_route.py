from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_visit_generate_requires_service_token() -> None:
    r = client.post("/agents/visit/generate", json={"visit_id": "v1", "transcript": "hi"})
    assert r.status_code in (401, 403)


def test_visit_generate_happy_path() -> None:
    fake = {
        "subjective": "s text",
        "objective": "o text",
        "assessment": "a text",
        "plan": "p text",
    }
    with patch("app.routes.visit.generate_soap", new=AsyncMock(return_value=fake)):
        r = client.post(
            "/agents/visit/generate",
            headers={"X-Service-Token": "change-me"},
            json={"visit_id": "v1", "transcript": "hi", "pre_visit": {"chief_complaint": "cough"}},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["visitId"] == "v1"
    assert body["report"]["subjective"] == "s text"
    assert body["isAiDraft"] is True

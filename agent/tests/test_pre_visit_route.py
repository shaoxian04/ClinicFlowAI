from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_turn_route_requires_service_token():
    resp = client.post("/agents/pre-visit/turn", json={"structured": {}})
    assert resp.status_code in (401, 403)


def test_turn_route_happy_path():
    with patch(
        "app.routes.pre_visit.run_turn",
        new=AsyncMock(
            return_value={
                "assistant_message": "ok",
                "fields": {"chief_complaint": "x"},
                "done": False,
            }
        ),
    ):
        resp = client.post(
            "/agents/pre-visit/turn",
            json={"structured": {"history": [], "fields": {}, "done": False}},
            headers={"X-Service-Token": "change-me"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["assistantMessage"] == "ok"
    assert body["fields"] == {"chief_complaint": "x"}
    assert body["done"] is False

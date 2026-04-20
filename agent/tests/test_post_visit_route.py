from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_post_visit_summarize_requires_service_token() -> None:
    r = client.post("/agents/post-visit/summarize", json={"visitId": "v1"})
    assert r.status_code in (401, 403)


def test_post_visit_summarize_happy_path() -> None:
    fake = {"summary_en": "Plain EN.", "summary_ms": "Melayu ringkas."}
    with patch("app.routes.post_visit.summarize", new=AsyncMock(return_value=fake)):
        r = client.post(
            "/agents/post-visit/summarize",
            headers={"X-Service-Token": "change-me"},
            json={
                "visitId": "v1",
                "soap": {
                    "subjective": "s", "objective": "o",
                    "assessment": "a", "plan": "p",
                },
                "medications": [
                    {"name": "Paracetamol", "dosage": "500 mg", "frequency": "QID"}
                ],
            },
        )
    assert r.status_code == 200
    body = r.json()
    assert body["visitId"] == "v1"
    assert body["summaryEn"] == "Plain EN."
    assert body["summaryMs"] == "Melayu ringkas."

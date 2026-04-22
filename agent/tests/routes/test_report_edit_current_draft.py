import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.agents.report_agent import ReportAgent


@pytest.mark.asyncio
async def test_edit_with_current_draft_is_injected_into_prompt(monkeypatch):
    captured = {}

    # Patch secrets so lifespan _assert_no_placeholder_secrets() passes.
    monkeypatch.setattr("app.config.settings.openai_api_key", "sk-test")

    # Patch postgres pool lifecycle so no real DB is needed.
    async def _noop_open():
        return None

    async def _noop_close():
        return None

    monkeypatch.setattr("app.persistence.postgres.open_pool", _noop_open)
    monkeypatch.setattr("app.persistence.postgres.close_pool", _noop_close)

    # Patch Neo4j schema apply (non-fatal in lifespan but avoids network call).
    async def _noop_apply():
        return None

    monkeypatch.setattr("app.graph.schema.apply_schema", _noop_apply)

    async def fake_step(self, ctx, user_input):
        captured["user_input"] = user_input
        captured["current_draft"] = getattr(ctx, "current_draft", None)
        return
        yield  # make it an async generator

    monkeypatch.setattr(ReportAgent, "step", fake_step)

    draft = {"subjective": {"chief_complaint": "cough"}}
    client = TestClient(app)
    resp = client.post(
        "/agents/report/edit",
        headers={"X-Service-Token": "change-me"},
        json={
            "visit_id": str(uuid.uuid4()),
            "patient_id": str(uuid.uuid4()),
            "doctor_id": str(uuid.uuid4()),
            "edit": "change follow-up to 2 weeks",
            "current_draft": draft,
        },
    )
    assert resp.status_code == 200
    assert captured["current_draft"] == draft

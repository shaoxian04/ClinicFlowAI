"""Test that /agents/report/finalize returns 409 when unacked CRITICAL exists."""
import pytest
from uuid import uuid4
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from app.main import app


@pytest.mark.asyncio
async def test_finalize_blocked_by_unacked_critical():
    client = TestClient(app)
    visit_id = str(uuid4())
    finding_id = str(uuid4())

    fake_rows = [{
        "id": finding_id, "category": "DDI", "severity": "CRITICAL",
        "field_path": "plan.medications[0]", "message": "x", "details": {},
        "acknowledged_at": None, "acknowledged_by": None,
        "acknowledgement_reason": None, "superseded_at": None,
    }]

    with patch("app.routes.report.has_unacked_critical", AsyncMock(return_value=True)), \
         patch("app.routes.report.list_active_findings", AsyncMock(return_value=fake_rows)):
        resp = client.post(
            "/agents/report/finalize",
            json={"visit_id": visit_id},
            headers={"X-Service-Token": "stub"},
        )
    assert resp.status_code == 409
    body = resp.json()
    assert body["detail"]["error"] == "unacknowledged_critical_findings"
    assert finding_id in body["detail"]["finding_ids"]

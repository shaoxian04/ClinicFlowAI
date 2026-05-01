"""Tests for GET /findings/{visit_id} and POST /re-evaluate routes."""
import pytest
from datetime import datetime
from uuid import uuid4
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.main import app


def test_get_findings_returns_serialized_rows():
    client = TestClient(app)
    visit_id = str(uuid4())
    finding_id = uuid4()

    fake_rows = [{
        "id": finding_id, "category": "DDI", "severity": "CRITICAL",
        "field_path": "plan.medications[0]", "message": "warfarin+aspirin",
        "details": {"a": "warfarin"},
        "acknowledged_at": None, "acknowledged_by": None,
        "acknowledgement_reason": None, "superseded_at": None,
        "gmt_create": datetime(2026, 5, 1, 12, 0, 0),
    }]

    with patch("app.routes.evaluator.list_active_findings", AsyncMock(return_value=fake_rows)):
        resp = client.get(f"/agents/evaluator/findings/{visit_id}", headers={"X-Service-Token": "stub"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["findings"][0]["category"] == "DDI"
    assert body["findings"][0]["severity"] == "CRITICAL"
    assert body["findings"][0]["id"] == str(finding_id)

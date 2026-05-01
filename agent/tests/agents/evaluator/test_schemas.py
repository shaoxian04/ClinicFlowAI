from uuid import uuid4
import pytest
from app.schemas.evaluator import Finding, EvaluationResult


def test_finding_defaults():
    f = Finding(category="DDI", severity="CRITICAL", message="test")
    assert f.field_path is None
    assert f.details == {}


def test_finding_rejects_unknown_category():
    with pytest.raises(Exception):
        Finding(category="UNKNOWN", severity="HIGH", message="x")


def test_finding_rejects_unknown_severity():
    with pytest.raises(Exception):
        Finding(category="DDI", severity="URGENT", message="x")


def test_evaluation_result_minimal():
    r = EvaluationResult(visit_id=uuid4(), findings=[], validators_run=["DDI"])
    assert r.validators_unavailable == []


def test_evaluation_result_unavailable():
    r = EvaluationResult(
        visit_id=uuid4(), findings=[],
        validators_run=["DDI"],
        validators_unavailable=[("PREGNANCY", "neo4j_down")],
    )
    assert r.validators_unavailable[0] == ("PREGNANCY", "neo4j_down")

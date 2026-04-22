import uuid

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.graph.queries.patient_context import PatientContext, get_patient_context
from app.graph.queries.visit_history import VisitHistoryEntry, get_visit_history
from app.graph.queries.drug_interaction import DrugInteraction, check_drug_interactions
from app.graph.queries.inferred_edge import record_inferred_edge


@pytest.mark.asyncio
async def test_get_patient_context_maps_nodes_to_dataclass():
    pid = uuid.uuid4()
    session = AsyncMock()
    result = AsyncMock()
    result.single = AsyncMock(return_value={
        "patient_id": str(pid),
        "demographics": {"full_name": "Siti", "dob": "1990-05-01", "gender": "FEMALE"},
        "allergies": ["Penicillin", "Peanuts"],
        "conditions": ["Type 2 Diabetes"],
        "medications": ["Metformin 500mg"],
    })
    session.run = AsyncMock(return_value=result)
    driver = MagicMock()
    driver.session = MagicMock(return_value=session)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)

    with patch("app.graph.queries.patient_context.get_driver", return_value=driver):
        ctx = await get_patient_context(pid)

    assert isinstance(ctx, PatientContext)
    assert ctx.allergies == ["Penicillin", "Peanuts"]
    assert ctx.conditions == ["Type 2 Diabetes"]
    assert ctx.medications == ["Metformin 500mg"]
    assert ctx.demographics["full_name"] == "Siti"


@pytest.mark.asyncio
async def test_get_patient_context_missing_returns_empty_context():
    pid = uuid.uuid4()
    session = AsyncMock()
    result = AsyncMock()
    result.single = AsyncMock(return_value=None)
    session.run = AsyncMock(return_value=result)
    driver = MagicMock()
    driver.session = MagicMock(return_value=session)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)

    with patch("app.graph.queries.patient_context.get_driver", return_value=driver):
        ctx = await get_patient_context(pid)

    assert ctx.allergies == []
    assert ctx.conditions == []
    assert ctx.medications == []


@pytest.mark.asyncio
async def test_get_visit_history_returns_ordered_entries():
    pid = uuid.uuid4()
    session = AsyncMock()
    result = AsyncMock()
    rows = [
        {"visit_id": "v2", "visited_at": "2026-04-10", "chief_complaint": "Fever", "primary_diagnosis": "Viral URTI"},
        {"visit_id": "v1", "visited_at": "2026-01-03", "chief_complaint": "Cough", "primary_diagnosis": "Acute bronchitis"},
    ]

    async def aiter():
        for r in rows:
            yield r

    result.__aiter__ = lambda self: aiter()
    session.run = AsyncMock(return_value=result)
    driver = MagicMock()
    driver.session = MagicMock(return_value=session)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)

    with patch("app.graph.queries.visit_history.get_driver", return_value=driver):
        entries = await get_visit_history(pid, limit=5)

    assert [e.visit_id for e in entries] == ["v2", "v1"]
    assert entries[0].chief_complaint == "Fever"
    assert entries[1].primary_diagnosis == "Acute bronchitis"


@pytest.mark.asyncio
async def test_check_drug_interactions_returns_contraindications():
    pid = uuid.uuid4()
    session = AsyncMock()
    result = AsyncMock()
    rows = [
        {"drug": "Penicillin V", "conflicts_with": "Penicillin allergy", "severity": "HIGH"},
    ]

    async def aiter():
        for r in rows:
            yield r

    result.__aiter__ = lambda self: aiter()
    session.run = AsyncMock(return_value=result)
    driver = MagicMock()
    driver.session = MagicMock(return_value=session)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)

    with patch("app.graph.queries.drug_interaction.get_driver", return_value=driver):
        conflicts = await check_drug_interactions(pid, ["Penicillin V"])

    assert conflicts == [DrugInteraction(drug="Penicillin V", conflicts_with="Penicillin allergy", severity="HIGH")]


@pytest.mark.asyncio
async def test_record_inferred_edge_invokes_merge():
    vid = uuid.uuid4()
    session = AsyncMock()
    session.run = AsyncMock(return_value=AsyncMock())
    driver = MagicMock()
    driver.session = MagicMock(return_value=session)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)

    with patch("app.graph.queries.inferred_edge.get_driver", return_value=driver):
        await record_inferred_edge(
            visit_id=vid,
            from_label="Visit", from_id=str(vid),
            rel_type="SUGGESTED_DIAGNOSIS",
            to_label="Diagnosis", to_id="ICD10:J06.9",
            confidence=0.82,
        )

    session.run.assert_awaited_once()
    args = session.run.await_args
    assert "MERGE" in args.args[0]
    assert args.kwargs["confidence"] == 0.82

import uuid

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.graph.queries.patient_context import PatientContext, get_patient_context
from app.graph.queries.visit_history import VisitHistoryEntry, get_visit_history


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

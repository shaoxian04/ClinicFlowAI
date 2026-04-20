import json
from unittest.mock import AsyncMock, patch

import pytest

from app.graphs import soap


@pytest.mark.asyncio
async def test_generate_soap_happy_path() -> None:
    fake_llm_reply = json.dumps(
        {
            "subjective": "Patient reports 3 days of cough.",
            "objective": "Temp 37.8 C. Clear lungs.",
            "assessment": "Viral URI.",
            "plan": "Fluids, rest, paracetamol PRN.",
        }
    )
    with patch.object(soap, "_llm_call", new=AsyncMock(return_value=fake_llm_reply)):
        result = await soap.generate_soap(
            pre_visit={"chief_complaint": "cough", "duration": "3 days"},
            transcript="Patient presents with cough x3 days.",
        )
    assert result["subjective"].startswith("Patient reports")
    assert result["assessment"] == "Viral URI."
    assert set(result.keys()) == {"subjective", "objective", "assessment", "plan"}


@pytest.mark.asyncio
async def test_generate_soap_malformed_json_falls_back_to_empty() -> None:
    with patch.object(soap, "_llm_call", new=AsyncMock(return_value="not json at all")):
        result = await soap.generate_soap(pre_visit={}, transcript="hi")
    assert result == {"subjective": "", "objective": "", "assessment": "", "plan": ""}

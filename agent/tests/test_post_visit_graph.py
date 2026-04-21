import json
from unittest.mock import AsyncMock, patch

import pytest

from app.graphs import post_visit


SAMPLE_SOAP = {
    "subjective": "Patient reports 3 days of cough and low-grade fever.",
    "objective": "Temp 37.9 C. Clear lungs on auscultation.",
    "assessment": "Viral upper respiratory infection.",
    "plan": "Paracetamol PRN. Fluids. Rest 3 days. Review if worsens.",
}
SAMPLE_MEDS = [
    {"name": "Paracetamol", "dosage": "500 mg", "frequency": "QID PRN"},
]


@pytest.mark.asyncio
async def test_summarize_happy_path() -> None:
    fake = json.dumps(
        {
            "summary_en": "You have a viral infection. Rest and drink fluids.",
            "summary_ms": "Anda mengalami jangkitan virus. Rehat dan minum banyak air.",
        }
    )
    with patch.object(post_visit, "_llm_call", new=AsyncMock(return_value=fake)):
        result = await post_visit.summarize(soap=SAMPLE_SOAP, medications=SAMPLE_MEDS)
    assert result["summary_en"].startswith("You have")
    assert "virus" in result["summary_ms"]
    assert set(result.keys()) == {"summary_en", "summary_ms"}


@pytest.mark.asyncio
async def test_summarize_malformed_json_falls_back_to_empty() -> None:
    with patch.object(post_visit, "_llm_call", new=AsyncMock(return_value="not json")):
        result = await post_visit.summarize(soap=SAMPLE_SOAP, medications=[])
    assert result == {"summary_en": "", "summary_ms": ""}

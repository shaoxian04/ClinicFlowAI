from unittest.mock import AsyncMock, patch

import pytest

from app.graphs.pre_visit import run_turn


@pytest.mark.asyncio
async def test_extracts_chief_complaint_and_asks_duration():
    structured = {
        "history": [
            {"role": "assistant", "content": "What's the main reason for your visit today?"},
            {"role": "user", "content": "I have a terrible headache"},
        ],
        "fields": {},
        "done": False,
    }
    with patch("app.graphs.pre_visit._extract_field", new=AsyncMock(return_value="headache")):
        result = await run_turn(structured)

    assert result["fields"]["chief_complaint"] == "headache"
    assert result["done"] is False
    assert "how long" in result["assistant_message"].lower()


@pytest.mark.asyncio
async def test_marks_done_after_all_fields_filled():
    structured = {
        "history": [
            {"role": "assistant", "content": "Are you taking any medications right now?"},
            {"role": "user", "content": "None"},
        ],
        "fields": {
            "chief_complaint": "headache",
            "duration": "2 days",
            "severity": "7",
            "allergies": "none",
        },
        "done": False,
    }
    with patch("app.graphs.pre_visit._extract_field", new=AsyncMock(return_value="none")):
        result = await run_turn(structured)

    assert result["fields"]["current_medications"] == "none"
    assert result["done"] is True

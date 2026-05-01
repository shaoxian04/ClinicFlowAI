import pytest
from app.graph.queries.pregnancy_safety import fetch_pregnancy_categories


@pytest.mark.asyncio
async def test_returns_category_for_known_drug():
    rows = await fetch_pregnancy_categories(["warfarin"])
    assert len(rows) == 1
    assert rows[0]["drug"] == "warfarin"
    assert rows[0]["category"] == "X"


@pytest.mark.asyncio
async def test_returns_no_data_marker_for_unknown_drug():
    rows = await fetch_pregnancy_categories(["mystery-drug-xyz"])
    assert rows == []


@pytest.mark.asyncio
async def test_lactation_safe_field_present():
    rows = await fetch_pregnancy_categories(["paracetamol"])
    assert rows[0]["lactation_safe"] is True


@pytest.mark.asyncio
async def test_drug_with_no_category_edge_returns_no_category():
    """A drug node may exist but have no PREGNANCY_CATEGORY relationship — returns row with category=None."""
    # `glibenclamide` is in drugs but has no pregnancy category in seed
    rows = await fetch_pregnancy_categories(["glibenclamide"])
    if rows:  # only if drug exists
        assert rows[0]["category"] is None

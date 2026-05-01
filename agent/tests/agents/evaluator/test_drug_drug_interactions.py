"""Integration-style tests for DDI Cypher. Requires a running Neo4j with the
drug knowledge graph seeded (apply_drug_knowledge runs at startup)."""
from __future__ import annotations

import os
import pytest
from uuid import uuid4

from app.graph.queries.drug_drug_interaction import check_drug_drug_interactions

pytestmark = pytest.mark.skipif(
    not os.getenv("NEO4J_URI") and not os.getenv("RUN_NEO4J_TESTS"),
    reason="requires a seeded Neo4j (set NEO4J_URI or RUN_NEO4J_TESTS=1)",
)


@pytest.mark.asyncio
async def test_empty_returns_empty():
    result = await check_drug_drug_interactions(uuid4(), [])
    assert result == []


@pytest.mark.asyncio
async def test_direct_warfarin_aspirin():
    """Both drugs in the seed; direct edge severity MAJOR."""
    result = await check_drug_drug_interactions(uuid4(), ["warfarin", "aspirin"])
    pair_names = {tuple(sorted([h["drug_a"], h["drug_b"]])) for h in result}
    assert ("aspirin", "warfarin") in pair_names
    severities = {h["severity"] for h in result if {h["drug_a"], h["drug_b"]} == {"warfarin", "aspirin"}}
    assert "MAJOR" in severities


@pytest.mark.asyncio
async def test_class_level_nsaid_warfarin():
    """ibuprofen is in NSAID class; class-level rule with warfarin → finding."""
    result = await check_drug_drug_interactions(uuid4(), ["warfarin", "ibuprofen"])
    found = any(
        {h["drug_a"], h["drug_b"]} == {"warfarin", "ibuprofen"} and h["severity"] == "MAJOR"
        for h in result
    )
    assert found


@pytest.mark.asyncio
async def test_unknown_drug_silent():
    result = await check_drug_drug_interactions(uuid4(), ["mystery-drug-xyz"])
    assert result == []

"""Pregnancy/lactation safety query.

This module ONLY fetches pregnancy category data for proposed drugs. The orchestrator
applies the pregnancy_status bypass rule (NOT_PREGNANT/UNKNOWN/NULL → skip entirely)
and the severity mapping. This module never sees patient pregnancy state — that's
deliberate (privacy: pregnancy state stays out of this query).
"""
from __future__ import annotations

from app.graph.driver import get_driver

_QUERY = """
WITH [d IN $proposed | toLower(d)] AS lower_names
UNWIND lower_names AS proposed
MATCH (d:Drug {name: proposed})
OPTIONAL MATCH (d)-[r:PREGNANCY_CATEGORY]->(c:PregnancyCategory)
RETURN proposed AS drug,
       c.code AS category,
       c.description AS category_description,
       r.lactation_safe AS lactation_safe,
       r.advisory AS advisory
"""


async def fetch_pregnancy_categories(proposed_drugs: list[str]) -> list[dict]:
    if not proposed_drugs:
        return []
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(_QUERY, proposed=proposed_drugs)
        rows: list[dict] = []
        async for r in result:
            rows.append({
                "drug": r["drug"],
                "category": r["category"],
                "category_description": r["category_description"],
                "lactation_safe": r["lactation_safe"],
                "advisory": r["advisory"],
            })
    return rows

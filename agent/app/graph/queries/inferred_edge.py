from __future__ import annotations

from uuid import UUID

from app.graph.driver import get_driver

# Literal templating for label/relationship types is required — Neo4j parameters
# can't bind schema identifiers. Callers MUST pass validated label/rel strings.
_TEMPLATE = """
MERGE (src:{from_label} {{id: $from_id}})
MERGE (dst:{to_label} {{id: $to_id}})
MERGE (src)-[r:{rel_type} {{visit_id: $visit_id}}]->(dst)
SET r.confidence = $confidence,
    r.source = 'INFERRED',
    r.updated_at = datetime()
"""

_ALLOWED_LABELS = {"Visit", "Diagnosis", "Medication", "Symptom", "Condition", "Allergy"}
_ALLOWED_RELS = {
    "SUGGESTED_DIAGNOSIS",
    "SUGGESTED_MEDICATION",
    "PRESENTED_WITH",
    "SUGGESTS_CONDITION",
}


async def record_inferred_edge(
    *,
    visit_id: UUID,
    from_label: str,
    from_id: str,
    rel_type: str,
    to_label: str,
    to_id: str,
    confidence: float,
) -> None:
    if from_label not in _ALLOWED_LABELS or to_label not in _ALLOWED_LABELS:
        raise ValueError(f"disallowed label: {from_label!r} -> {to_label!r}")
    if rel_type not in _ALLOWED_RELS:
        raise ValueError(f"disallowed relationship type: {rel_type!r}")
    if not 0.0 <= confidence <= 1.0:
        raise ValueError(f"confidence out of range: {confidence!r}")

    query = _TEMPLATE.format(from_label=from_label, to_label=to_label, rel_type=rel_type)
    driver = get_driver()
    async with driver.session() as session:
        await session.run(
            query,
            from_id=from_id,
            to_id=to_id,
            visit_id=str(visit_id),
            confidence=confidence,
        )

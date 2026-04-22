from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.graph.driver import get_driver

_QUERY = """
UNWIND $drug_names AS drug_name
MATCH (p:Patient {id: $patient_id})
OPTIONAL MATCH (p)-[:ALLERGIC_TO]->(a:Allergy)
WHERE toLower(a.name) CONTAINS toLower(drug_name)
   OR toLower(drug_name) CONTAINS toLower(a.name)
WITH drug_name, a
WHERE a IS NOT NULL
RETURN drug_name AS drug, a.name AS conflicts_with, 'HIGH' AS severity
"""


@dataclass
class DrugInteraction:
    drug: str
    conflicts_with: str
    severity: str


async def check_drug_interactions(patient_id: UUID, drug_names: list[str]) -> list[DrugInteraction]:
    if not drug_names:
        return []
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(_QUERY, patient_id=str(patient_id), drug_names=drug_names)
        conflicts: list[DrugInteraction] = []
        async for row in result:
            conflicts.append(
                DrugInteraction(drug=row["drug"], conflicts_with=row["conflicts_with"], severity=row["severity"])
            )
    return conflicts

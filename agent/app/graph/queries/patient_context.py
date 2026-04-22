from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.graph.driver import get_driver

_QUERY = """
MATCH (p:Patient {id: $patient_id})
OPTIONAL MATCH (p)-[:ALLERGIC_TO]->(a:Allergy)
OPTIONAL MATCH (p)-[:HAS_CONDITION]->(c:Condition)
OPTIONAL MATCH (p)-[:TAKES]->(m:Medication)
RETURN
  p.id AS patient_id,
  {full_name: p.full_name, dob: p.dob, gender: p.gender} AS demographics,
  collect(DISTINCT a.name) AS allergies,
  collect(DISTINCT c.name) AS conditions,
  collect(DISTINCT m.name) AS medications
"""


@dataclass
class PatientContext:
    patient_id: str
    demographics: dict[str, Any] = field(default_factory=dict)
    allergies: list[str] = field(default_factory=list)
    conditions: list[str] = field(default_factory=list)
    medications: list[str] = field(default_factory=list)


async def get_patient_context(patient_id: UUID) -> PatientContext:
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(_QUERY, patient_id=str(patient_id))
        row = await result.single()
    if row is None:
        return PatientContext(patient_id=str(patient_id))
    return PatientContext(
        patient_id=row["patient_id"],
        demographics=row["demographics"] or {},
        allergies=[a for a in (row["allergies"] or []) if a],
        conditions=[c for c in (row["conditions"] or []) if c],
        medications=[m for m in (row["medications"] or []) if m],
    )

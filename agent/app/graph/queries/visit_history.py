from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.graph.driver import get_driver

_QUERY = """
MATCH (p:Patient {id: $patient_id})-[:HAD_VISIT]->(v:Visit)
OPTIONAL MATCH (v)-[:PRESENTED_WITH]->(s:Symptom)
OPTIONAL MATCH (v)-[:DIAGNOSED_AS]->(d:Diagnosis)
RETURN
  v.id AS visit_id,
  v.visited_at AS visited_at,
  s.name AS chief_complaint,
  d.name AS primary_diagnosis
ORDER BY v.visited_at DESC
LIMIT $limit
"""


@dataclass
class VisitHistoryEntry:
    visit_id: str
    visited_at: str | None
    chief_complaint: str | None
    primary_diagnosis: str | None


async def get_visit_history(patient_id: UUID, limit: int = 5) -> list[VisitHistoryEntry]:
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(_QUERY, patient_id=str(patient_id), limit=limit)
        entries: list[VisitHistoryEntry] = []
        async for row in result:
            entries.append(
                VisitHistoryEntry(
                    visit_id=row["visit_id"],
                    visited_at=row["visited_at"],
                    chief_complaint=row["chief_complaint"],
                    primary_diagnosis=row["primary_diagnosis"],
                )
            )
    return entries

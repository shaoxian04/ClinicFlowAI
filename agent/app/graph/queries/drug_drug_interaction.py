"""DDI validator — Cypher query and Python wrapper.

Searches:
  1. Direct drug↔drug INTERACTS_WITH edges
  2. Drug→Class and Class→Drug INTERACTS_WITH (via BELONGS_TO)
  3. Class↔Class INTERACTS_WITH

Considers:
  - Patient's active medications (last 90 days from finalized visits)
  - Co-prescribed drugs within the same draft (proposed_drugs list)
"""
from __future__ import annotations

from uuid import UUID

from app.config import settings
from app.graph.driver import get_driver

_QUERY = """
WITH [d IN $proposed | toLower(d)] AS proposed_lower
UNWIND proposed_lower AS proposed
MATCH (proposed_drug:Drug {name: proposed})

// Active medications (last N days from finalized visits)
OPTIONAL MATCH (p:Patient {id: $patient_id})<-[:FOR_PATIENT]-(v:Visit)
            -[:PRESCRIBED]->(active_med:Medication)
WHERE v.finalized_at >= datetime() - duration({days: $lookback_days})
WITH proposed, proposed_drug, proposed_lower,
     collect(DISTINCT toLower(active_med.name)) AS active_names

// Direct
OPTIONAL MATCH (proposed_drug)-[i1:INTERACTS_WITH]-(other:Drug)
WHERE toLower(other.name) IN active_names
   OR toLower(other.name) IN proposed_lower
WITH proposed, proposed_drug, active_names, proposed_lower,
     collect(DISTINCT {other:toLower(other.name), sev:i1.severity, mech:i1.mechanism, src:i1.source}) AS direct_hits

// Drug↔Class
OPTIONAL MATCH (proposed_drug)-[:BELONGS_TO]->(c1:DrugClass)-[i2:INTERACTS_WITH]-(other2:Drug)
WHERE toLower(other2.name) IN active_names OR toLower(other2.name) IN proposed_lower
WITH proposed, direct_hits, active_names, proposed_lower,
     collect(DISTINCT {other:toLower(other2.name), sev:i2.severity, mech:i2.mechanism, src:i2.source}) AS class_drug_hits

// Class↔Class
OPTIONAL MATCH (proposed_drug)-[:BELONGS_TO]->(c1b:DrugClass)-[i3:INTERACTS_WITH]-(c2:DrugClass)
              <-[:BELONGS_TO]-(other3:Drug)
WHERE toLower(other3.name) IN active_names OR toLower(other3.name) IN proposed_lower
WITH proposed, direct_hits, class_drug_hits,
     collect(DISTINCT {other:toLower(other3.name), sev:i3.severity, mech:i3.mechanism, src:i3.source}) AS class_class_hits

UNWIND (direct_hits + class_drug_hits + class_class_hits) AS hit
WITH proposed, hit
WHERE hit.other IS NOT NULL
  AND hit.other <> proposed
RETURN DISTINCT proposed AS drug_a, hit.other AS drug_b,
       hit.sev AS severity, hit.mech AS mechanism, hit.src AS source
"""


async def check_drug_drug_interactions(patient_id: UUID, proposed_drugs: list[str]) -> list[dict]:
    if not proposed_drugs:
        return []
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(
            _QUERY,
            patient_id=str(patient_id),
            proposed=proposed_drugs,
            lookback_days=settings.evaluator_ddi_active_med_lookback_days,
        )
        rows: list[dict] = []
        async for r in result:
            rows.append({
                "drug_a": r["drug_a"],
                "drug_b": r["drug_b"],
                "severity": r["severity"],
                "mechanism": r["mechanism"],
                "source": r["source"],
            })
    return rows

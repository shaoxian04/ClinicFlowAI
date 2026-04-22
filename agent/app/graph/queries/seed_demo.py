from __future__ import annotations

from typing import Iterable

from app.graph.driver import get_driver

_CYPHER = """
UNWIND $patients AS pat
MERGE (p:Patient {id: pat.id})
  SET p.full_name = pat.full_name,
      p.dob       = pat.dob,
      p.gender    = pat.gender

MERGE (a1:Allergy {name: 'Penicillin'})
MERGE (a2:Allergy {name: 'Peanuts'})
MERGE (p)-[:ALLERGIC_TO]->(a1)
MERGE (p)-[:ALLERGIC_TO]->(a2)

MERGE (c:Condition {name: 'Type 2 Diabetes'})
MERGE (p)-[:HAS_CONDITION]->(c)

MERGE (m:Medication {name: 'Metformin 500mg'})
MERGE (p)-[:TAKES]->(m)

WITH p, pat, substring(pat.id, 0, 8) AS prefix
MERGE (v1:Visit {id: 'v-demo-' + prefix + '-1'})
  SET v1.visited_at = '2026-01-05', v1.patient_id = pat.id
MERGE (p)-[:HAD_VISIT]->(v1)
MERGE (s1:Symptom {name: 'Cough'})
MERGE (v1)-[:PRESENTED_WITH]->(s1)
MERGE (d1:Diagnosis {code: 'J06.9', name: 'Acute upper respiratory infection'})
MERGE (v1)-[:DIAGNOSED_AS]->(d1)

MERGE (v2:Visit {id: 'v-demo-' + prefix + '-2'})
  SET v2.visited_at = '2026-04-14', v2.patient_id = pat.id
MERGE (p)-[:HAD_VISIT]->(v2)
MERGE (s2:Symptom {name: 'Fever'})
MERGE (v2)-[:PRESENTED_WITH]->(s2)
MERGE (d2:Diagnosis {code: 'A09', name: 'Gastroenteritis'})
MERGE (v2)-[:DIAGNOSED_AS]->(d2)
"""


async def seed_demo_bundle(patients: Iterable[dict]) -> int:
    """Seed a standard clinical bundle for each patient. Idempotent."""
    p_list = list(patients)
    if not p_list:
        return 0
    driver = get_driver()
    async with driver.session() as session:
        await session.run(_CYPHER, patients=p_list)
    return len(p_list)

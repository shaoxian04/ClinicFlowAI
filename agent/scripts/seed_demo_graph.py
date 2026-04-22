"""Seed a demo patient graph for A2/A3/A4 manual runs and judge demos.

Idempotent: re-running replaces the demo subgraph.

Run: python -m scripts.seed_demo_graph
"""
from __future__ import annotations

import asyncio

from app.graph.driver import close_driver, get_driver
from app.graph.schema import apply_schema

DEMO_PATIENT_ID = "11111111-1111-1111-1111-111111111111"

_CYPHER = """
MERGE (p:Patient {id: $pid})
SET p.full_name = 'Siti Binti Ahmad',
    p.dob = '1985-07-12',
    p.gender = 'FEMALE'

MERGE (a1:Allergy {name: 'Penicillin'})
MERGE (a2:Allergy {name: 'Peanuts'})
MERGE (p)-[:ALLERGIC_TO]->(a1)
MERGE (p)-[:ALLERGIC_TO]->(a2)

MERGE (c:Condition {name: 'Type 2 Diabetes'})
MERGE (p)-[:HAS_CONDITION]->(c)

MERGE (m:Medication {name: 'Metformin 500mg'})
MERGE (p)-[:TAKES]->(m)

MERGE (v1:Visit {id: 'v-demo-1'})
SET v1.visited_at = '2026-01-05', v1.patient_id = $pid
MERGE (p)-[:HAD_VISIT]->(v1)
MERGE (s1:Symptom {name: 'Cough'})
MERGE (v1)-[:PRESENTED_WITH]->(s1)
MERGE (d1:Diagnosis {code: 'J06.9', name: 'Acute upper respiratory infection'})
MERGE (v1)-[:DIAGNOSED_AS]->(d1)

MERGE (v2:Visit {id: 'v-demo-2'})
SET v2.visited_at = '2026-04-14', v2.patient_id = $pid
MERGE (p)-[:HAD_VISIT]->(v2)
MERGE (s2:Symptom {name: 'Fever'})
MERGE (v2)-[:PRESENTED_WITH]->(s2)
MERGE (d2:Diagnosis {code: 'A09', name: 'Gastroenteritis'})
MERGE (v2)-[:DIAGNOSED_AS]->(d2)
"""


async def main() -> None:
    await apply_schema()
    driver = get_driver()
    async with driver.session() as session:
        await session.run(_CYPHER, pid=DEMO_PATIENT_ID)
    print(f"Seeded demo patient {DEMO_PATIENT_ID}")
    await close_driver()


if __name__ == "__main__":
    asyncio.run(main())

"""Neo4j schema bootstrap — constraints + indexes.

Runs on agent startup (see app.main). Idempotent: every statement uses
`IF NOT EXISTS` so it's safe to re-run. Per open-questions.md, this is the
MVP approach; revisit with a migration tool when production volume justifies
one.

Schema matches docs/details/data-model.md (SAD §2.3.3).
"""
from __future__ import annotations

import structlog

from app.graph.driver import get_driver

log = structlog.get_logger(__name__)

# Uniqueness constraints — one per node label that needs a stable external id.
_CONSTRAINTS: list[str] = [
    "CREATE CONSTRAINT patient_id_unique IF NOT EXISTS "
    "FOR (p:Patient) REQUIRE p.id IS UNIQUE",

    "CREATE CONSTRAINT doctor_id_unique IF NOT EXISTS "
    "FOR (d:Doctor) REQUIRE d.id IS UNIQUE",

    "CREATE CONSTRAINT visit_id_unique IF NOT EXISTS "
    "FOR (v:Visit) REQUIRE v.id IS UNIQUE",

    "CREATE CONSTRAINT symptom_name_unique IF NOT EXISTS "
    "FOR (s:Symptom) REQUIRE s.name IS UNIQUE",

    "CREATE CONSTRAINT diagnosis_code_unique IF NOT EXISTS "
    "FOR (d:Diagnosis) REQUIRE d.code IS UNIQUE",

    "CREATE CONSTRAINT medication_name_unique IF NOT EXISTS "
    "FOR (m:Medication) REQUIRE m.name IS UNIQUE",

    "CREATE CONSTRAINT allergy_name_unique IF NOT EXISTS "
    "FOR (a:Allergy) REQUIRE a.name IS UNIQUE",

    "CREATE CONSTRAINT condition_name_unique IF NOT EXISTS "
    "FOR (c:Condition) REQUIRE c.name IS UNIQUE",

    "CREATE CONSTRAINT adaptive_rule_id_unique IF NOT EXISTS "
    "FOR (r:AdaptiveRule) REQUIRE r.id IS UNIQUE",

    "CREATE CONSTRAINT drug_name_unique IF NOT EXISTS "
    "FOR (d:Drug) REQUIRE d.name IS UNIQUE",

    "CREATE CONSTRAINT drugclass_name_unique IF NOT EXISTS "
    "FOR (c:DrugClass) REQUIRE c.name IS UNIQUE",

    "CREATE CONSTRAINT pregcat_code_unique IF NOT EXISTS "
    "FOR (p:PregnancyCategory) REQUIRE p.code IS UNIQUE",

    "CREATE CONSTRAINT doserule_id_unique IF NOT EXISTS "
    "FOR (r:DoseRule) REQUIRE r.id IS UNIQUE",
]

# Secondary indexes for common lookups.
_INDEXES: list[str] = [
    "CREATE INDEX visit_patient_idx IF NOT EXISTS "
    "FOR (v:Visit) ON (v.patient_id)",

    "CREATE INDEX visit_doctor_idx IF NOT EXISTS "
    "FOR (v:Visit) ON (v.doctor_id)",

    "CREATE INDEX adaptive_rule_doctor_idx IF NOT EXISTS "
    "FOR (r:AdaptiveRule) ON (r.doctor_id)",
]


async def apply_schema() -> None:
    """Apply all constraints + indexes. Idempotent."""
    driver = get_driver()
    async with driver.session() as session:
        for stmt in _CONSTRAINTS + _INDEXES:
            await session.run(stmt)
    log.info(
        "neo4j.schema_applied",
        constraints=len(_CONSTRAINTS),
        indexes=len(_INDEXES),
    )

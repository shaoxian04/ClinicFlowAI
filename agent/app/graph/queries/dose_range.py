"""Dose-range rule query.

Fetches `DoseRule` nodes matching the patient's age + weight band and the proposed
drug's route. The orchestrator applies dose/frequency parsing and severity mapping.
"""
from __future__ import annotations

from app.graph.driver import get_driver

_QUERY = """
UNWIND $proposed AS p
MATCH (d:Drug {name: toLower(p.name)})
OPTIONAL MATCH (d)-[:HAS_DOSE_RULE]->(r:DoseRule)
WHERE (r IS NULL OR r.route IS NULL OR r.route = p.route)
  AND ($patient_age_years IS NULL OR r IS NULL OR
       ((r.min_age_years IS NULL OR $patient_age_years >= r.min_age_years) AND
        (r.max_age_years IS NULL OR $patient_age_years <= r.max_age_years)))
  AND ($patient_weight_kg IS NULL OR r IS NULL OR
       ((r.min_weight_kg IS NULL OR $patient_weight_kg >= r.min_weight_kg) AND
        (r.max_weight_kg IS NULL OR $patient_weight_kg <= r.max_weight_kg)))
RETURN toLower(p.name) AS drug,
       r.id AS rule_id,
       r.min_dose_mg AS min_dose_mg,
       r.max_dose_mg AS max_dose_mg,
       r.max_daily_mg AS max_daily_mg,
       r.min_age_years AS min_age_years,
       r.max_age_years AS max_age_years,
       r.frequency_pattern AS frequency_pattern
"""


async def fetch_dose_rules(
    proposed_drugs: list[dict],
    patient_age_years: int | None,
    patient_weight_kg: float | None,
) -> list[dict]:
    """proposed_drugs: list of {name, route}."""
    if not proposed_drugs:
        return []
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(
            _QUERY,
            proposed=proposed_drugs,
            patient_age_years=patient_age_years,
            patient_weight_kg=patient_weight_kg,
        )
        rows: list[dict] = []
        async for r in result:
            if r["rule_id"] is None:  # drug exists but no dose rule
                continue
            rows.append({
                "drug": r["drug"],
                "rule_id": r["rule_id"],
                "min_dose_mg": r["min_dose_mg"],
                "max_dose_mg": r["max_dose_mg"],
                "max_daily_mg": r["max_daily_mg"],
                "min_age_years": r["min_age_years"],
                "max_age_years": r["max_age_years"],
                "frequency_pattern": r["frequency_pattern"],
            })
    return rows

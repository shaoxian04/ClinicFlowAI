"""Idempotent loader for drug knowledge graph (drugs, classes, DDIs, pregnancy, dose rules).

Runs after `apply_schema()` from FastAPI lifespan. Safe to re-run — uses MERGE.
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from app.graph.driver import get_driver

log = structlog.get_logger(__name__)

_SEED_PATH = Path(__file__).parent / "drug_knowledge.json"


async def apply_drug_knowledge() -> None:
    if not _SEED_PATH.exists():
        log.warning("drug_knowledge.seed_missing", path=str(_SEED_PATH))
        return
    data = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    driver = get_driver()
    async with driver.session() as session:
        for pc in data.get("pregnancy_categories", []):
            await session.run(
                "MERGE (p:PregnancyCategory {code:$code}) SET p.description=$desc",
                code=pc["code"], desc=pc.get("description", ""),
            )
        for c in data.get("drug_classes", []):
            await session.run("MERGE (c:DrugClass {name:$name})", name=c["name"])
        for d in data.get("drugs", []):
            await session.run(
                "MERGE (drug:Drug {name:$name}) "
                "SET drug.rxnorm_code=$rxn, drug.atc_code=$atc",
                name=d["name"].lower(),
                rxn=d.get("rxnorm_code"),
                atc=d.get("atc_code"),
            )
            for cls in d.get("classes", []):
                await session.run(
                    "MATCH (drug:Drug {name:$name}), (c:DrugClass {name:$cls}) "
                    "MERGE (drug)-[:BELONGS_TO]->(c)",
                    name=d["name"].lower(), cls=cls,
                )
        for i in data.get("drug_drug_interactions", []):
            sev = i["severity"]
            mech = i.get("mechanism", "")
            src = i.get("source", "")
            if "a" in i and "b" in i:
                await session.run(
                    "MATCH (a:Drug {name:$a}), (b:Drug {name:$b}) "
                    "MERGE (a)-[r:INTERACTS_WITH]-(b) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a"].lower(), b=i["b"].lower(), sev=sev, mech=mech, src=src,
                )
            elif "a_class" in i and "b" in i:
                await session.run(
                    "MATCH (ac:DrugClass {name:$a}), (b:Drug {name:$b}) "
                    "MERGE (ac)-[r:INTERACTS_WITH]-(b) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a_class"], b=i["b"].lower(), sev=sev, mech=mech, src=src,
                )
            elif "a" in i and "b_class" in i:
                await session.run(
                    "MATCH (a:Drug {name:$a}), (bc:DrugClass {name:$b}) "
                    "MERGE (a)-[r:INTERACTS_WITH]-(bc) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a"].lower(), b=i["b_class"], sev=sev, mech=mech, src=src,
                )
            elif "a_class" in i and "b_class" in i:
                await session.run(
                    "MATCH (ac:DrugClass {name:$a}), (bc:DrugClass {name:$b}) "
                    "MERGE (ac)-[r:INTERACTS_WITH]-(bc) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a_class"], b=i["b_class"], sev=sev, mech=mech, src=src,
                )
        for pc in data.get("pregnancy_categories_per_drug", []):
            await session.run(
                "MATCH (d:Drug {name:$name}), (c:PregnancyCategory {code:$code}) "
                "MERGE (d)-[r:PREGNANCY_CATEGORY]->(c) "
                "SET r.lactation_safe=$ls, r.advisory=$adv",
                name=pc["drug"].lower(), code=pc["category"],
                ls=pc.get("lactation_safe"), adv=pc.get("advisory", ""),
            )
        for dr in data.get("dose_rules", []):
            await session.run(
                "MATCH (d:Drug {name:$name}) "
                "MERGE (r:DoseRule {id:$id}) "
                "SET r.route=$route, "
                "    r.min_age_years=$min_age, r.max_age_years=$max_age, "
                "    r.min_weight_kg=$min_w, r.max_weight_kg=$max_w, "
                "    r.min_dose_mg=$min_dose, r.max_dose_mg=$max_dose, "
                "    r.max_daily_mg=$max_daily, "
                "    r.frequency_pattern=$freq "
                "MERGE (d)-[:HAS_DOSE_RULE]->(r)",
                name=dr["drug"].lower(), id=dr["id"], route=dr["route"],
                min_age=dr.get("min_age_years"), max_age=dr.get("max_age_years"),
                min_w=dr.get("min_weight_kg"), max_w=dr.get("max_weight_kg"),
                min_dose=dr["min_dose_mg"], max_dose=dr["max_dose_mg"],
                max_daily=dr["max_daily_mg"], freq=dr["frequency_pattern"],
            )
    log.info("drug_knowledge.applied",
             drugs=len(data.get("drugs", [])),
             ddis=len(data.get("drug_drug_interactions", [])),
             dose_rules=len(data.get("dose_rules", [])))

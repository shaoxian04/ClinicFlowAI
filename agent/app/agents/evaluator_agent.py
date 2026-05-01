"""Evaluator orchestrator.

Phase 1 — parallel cheap validators (allergy, DDI, pregnancy, dose, completeness).
Phase 2 — hallucination LLM check.

Each validator wrapped in `_run` which catches exceptions and converts to
(category, error_reason). One validator failing does not tank the run.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date
from uuid import UUID

import structlog

from app.agents.evaluator.completeness import run_completeness
from app.agents.evaluator.dose_parser import parse_dose_mg, parse_frequency_per_day
from app.agents.evaluator.hallucination import run_hallucination
from app.agents.evaluator.severity import map_ddi_severity, map_pregnancy_severity, map_dose_severity
from app.config import settings
from app.graph.queries.dose_range import fetch_dose_rules
from app.graph.queries.drug_drug_interaction import check_drug_drug_interactions
from app.graph.queries.drug_interaction import check_drug_interactions as check_drug_allergy_interaction
from app.graph.queries.pregnancy_safety import fetch_pregnancy_categories
from app.persistence.evaluator_findings import insert_findings, supersede_active
from app.persistence.postgres import get_pool
from app.schemas.evaluator import Category, EvaluationResult, Finding, Severity
from app.schemas.report import MedicalReport

log = structlog.get_logger(__name__)


def _camel_to_snake(name: str) -> str:
    out: list[str] = []
    for i, ch in enumerate(name):
        if ch.isupper() and i > 0:
            out.append("_")
        out.append(ch.lower())
    return "".join(out)


def _camel_to_snake_keys(obj):
    """Recursively rename dict keys from camelCase → snake_case. Lists are recursed.
    Other types pass through unchanged."""
    if isinstance(obj, dict):
        return {_camel_to_snake(k): _camel_to_snake_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_camel_to_snake_keys(v) for v in obj]
    return obj


@dataclass
class EvaluatorContext:
    visit_id: UUID
    patient_id: UUID


class EvaluatorAgent:
    async def evaluate(self, ctx: EvaluatorContext) -> EvaluationResult:
        draft = await self._load_draft(ctx.visit_id)
        if draft is None:
            raise ValueError(f"evaluator: no draft for visit {ctx.visit_id}")

        patient_state = await self._load_patient_state(ctx.patient_id)
        patient_context = await self._load_patient_context(ctx.patient_id)
        transcript = await self._load_transcript(ctx.visit_id)
        proposed_drugs_lc = [m.drug_name.lower().strip() for m in draft.plan.medications if m.drug_name.strip()]

        validators_run: list[Category] = []
        validators_unavailable: list[tuple[Category, str]] = []
        all_findings: list[Finding] = []

        async def _run(cat: Category, coro):
            try:
                return cat, await asyncio.wait_for(coro, timeout=settings.evaluator_timeout_cypher_seconds)
            except (asyncio.TimeoutError, TimeoutError) as e:
                return cat, e
            except Exception as e:
                return cat, e

        allergy_task = _run("DRUG_ALLERGY", check_drug_allergy_interaction(ctx.patient_id, proposed_drugs_lc))
        ddi_task = _run("DDI", check_drug_drug_interactions(ctx.patient_id, proposed_drugs_lc))
        is_preg_lac = patient_state.get("pregnancy_status") in ("PREGNANT", "LACTATING")
        preg_task = _run("PREGNANCY", fetch_pregnancy_categories(proposed_drugs_lc)) if is_preg_lac else None
        dose_task = _run("DOSE", fetch_dose_rules(
            [{"name": m.drug_name, "route": (m.route or "oral")} for m in draft.plan.medications],
            patient_state.get("age_years"), patient_state.get("weight_kg"),
        ))

        async def _completeness():
            return run_completeness(draft)
        comp_task = _run("COMPLETENESS", _completeness())

        tasks = [t for t in (allergy_task, ddi_task, preg_task, dose_task, comp_task) if t is not None]
        phase1 = await asyncio.gather(*tasks, return_exceptions=False)

        for cat, payload in phase1:
            if isinstance(payload, Exception):
                validators_unavailable.append((cat, type(payload).__name__))
                continue
            validators_run.append(cat)
            if cat == "DRUG_ALLERGY":
                for hit in payload:
                    all_findings.append(Finding(
                        category="DRUG_ALLERGY", severity="CRITICAL",
                        field_path=self._med_path_for(draft, hit.drug),
                        message=f"{hit.drug} conflicts with patient allergy {hit.conflicts_with}",
                        details={"drug": hit.drug, "conflicts_with": hit.conflicts_with},
                    ))
            elif cat == "DDI":
                for hit in payload:
                    all_findings.append(Finding(
                        category="DDI", severity=map_ddi_severity(hit["severity"]),
                        field_path=self._med_path_for(draft, hit["drug_a"]),
                        message=f"{hit['drug_a']} interacts with {hit['drug_b']}",
                        details={"drug_a": hit["drug_a"], "drug_b": hit["drug_b"],
                                 "mechanism": hit["mechanism"], "source": hit["source"]},
                    ))
            elif cat == "PREGNANCY":
                self._emit_pregnancy(payload, patient_state, draft, all_findings)
            elif cat == "DOSE":
                self._emit_dose(payload, draft, patient_state, all_findings)
            elif cat == "COMPLETENESS":
                all_findings.extend(payload)

        try:
            halluc_findings = await asyncio.wait_for(
                run_hallucination(draft, patient_context, transcript),
                timeout=settings.evaluator_timeout_llm_seconds,
            )
            validators_run.append("HALLUCINATION")
            all_findings.extend(halluc_findings)
        except (asyncio.TimeoutError, TimeoutError):
            validators_unavailable.append(("HALLUCINATION", "timeout"))
        except Exception as e:
            validators_unavailable.append(("HALLUCINATION", type(e).__name__))

        async with (get_pool()).acquire() as conn:
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", str(ctx.visit_id))
                await supersede_active(ctx.visit_id)
                await insert_findings(ctx.visit_id, all_findings)

        log.info(
            "evaluator.run_complete",
            visit_id=str(ctx.visit_id),
            validators_run=validators_run,
            validators_unavailable=[(c, r) for c, r in validators_unavailable],
            findings_count={
                "CRITICAL": sum(1 for f in all_findings if f.severity == "CRITICAL"),
                "HIGH": sum(1 for f in all_findings if f.severity == "HIGH"),
                "MEDIUM": sum(1 for f in all_findings if f.severity == "MEDIUM"),
                "LOW": sum(1 for f in all_findings if f.severity == "LOW"),
            },
            drugs_evaluated=len(proposed_drugs_lc),
        )
        return EvaluationResult(
            visit_id=ctx.visit_id, findings=all_findings,
            validators_run=validators_run, validators_unavailable=validators_unavailable,
        )

    @staticmethod
    def _med_path_for(draft: MedicalReport, drug_name: str) -> str:
        target = drug_name.lower()
        for i, m in enumerate(draft.plan.medications):
            if m.drug_name.lower() == target:
                return f"plan.medications[{i}]"
        return "plan.medications"

    def _emit_pregnancy(self, rows: list[dict], patient_state: dict,
                        draft: MedicalReport, all_findings: list[Finding]) -> None:
        status = patient_state["pregnancy_status"]
        for r in rows:
            sev: Severity = map_pregnancy_severity(status, r.get("category"), r.get("lactation_safe"))
            all_findings.append(Finding(
                category="PREGNANCY", severity=sev,
                field_path=self._med_path_for(draft, r["drug"]),
                message=f"{r['drug']} category {r.get('category') or 'no data'} in {status.lower()}",
                details={"category": r.get("category"), "advisory": r.get("advisory"),
                         "lactation_safe": r.get("lactation_safe")},
            ))

    def _emit_dose(self, rows: list[dict], draft: MedicalReport,
                   patient_state: dict, all_findings: list[Finding]) -> None:
        rules_by_drug = {r["drug"]: r for r in rows}
        # If no rules were returned at all, the graph has no data for these drugs —
        # do not emit "no_rule" findings (we cannot distinguish "drug unknown" from
        # "no matching band" when the query returns empty).
        has_any_rules = bool(rules_by_drug)
        for i, m in enumerate(draft.plan.medications):
            drug_lc = m.drug_name.lower().strip()
            dose_r = parse_dose_mg(m.dose)
            freq_r = parse_frequency_per_day(m.frequency)
            field_path = f"plan.medications[{i}]"
            if not dose_r.ok:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("dose_unit_missing"),
                    field_path=field_path,
                    message=f"Dose units missing or unparseable for {m.drug_name}.",
                ))
                continue
            if not freq_r.ok:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("frequency_unparseable"),
                    field_path=field_path,
                    message=f"Frequency '{m.frequency}' not recognised for {m.drug_name}.",
                ))
                continue
            rule = rules_by_drug.get(drug_lc)
            if rule is None:
                if has_any_rules:
                    # The graph returned rules for other drugs but not this one —
                    # flag for manual review.
                    all_findings.append(Finding(
                        category="DOSE", severity=map_dose_severity("no_rule"),
                        field_path=field_path,
                        message=f"No validated dose rule for {m.drug_name} in this age/weight band — manual review.",
                    ))
                continue
            daily = dose_r.dose_mg * freq_r.per_day
            if rule["max_dose_mg"] is not None and dose_r.dose_mg > rule["max_dose_mg"]:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("over_max_dose"),
                    field_path=field_path,
                    message=f"Per-dose {dose_r.dose_mg}mg exceeds max {rule['max_dose_mg']}mg.",
                    details={"proposed_dose_mg": dose_r.dose_mg,
                             "max_dose_mg": rule["max_dose_mg"], "rule_id": rule["rule_id"]},
                ))
            elif rule["max_daily_mg"] is not None and daily > rule["max_daily_mg"]:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("over_max_daily"),
                    field_path=field_path,
                    message=f"Daily total {daily}mg exceeds max {rule['max_daily_mg']}mg/day.",
                    details={"daily_total_mg": daily,
                             "max_daily_mg": rule["max_daily_mg"], "rule_id": rule["rule_id"]},
                ))
            elif rule["min_dose_mg"] is not None and dose_r.dose_mg < rule["min_dose_mg"]:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("under_min_dose"),
                    field_path=field_path,
                    message=f"Per-dose {dose_r.dose_mg}mg below min therapeutic {rule['min_dose_mg']}mg.",
                    details={"proposed_dose_mg": dose_r.dose_mg,
                             "min_dose_mg": rule["min_dose_mg"], "rule_id": rule["rule_id"]},
                ))

    async def _load_draft(self, visit_id: UUID) -> MedicalReport | None:
        import json as _json
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT report_draft, report_confidence_flags FROM visits WHERE id=$1",
            visit_id,
        )
        if row is None or row["report_draft"] is None:
            return None
        raw_draft = row["report_draft"]
        draft = _json.loads(raw_draft) if isinstance(raw_draft, str) else raw_draft
        raw_flags = row["report_confidence_flags"]
        if raw_flags is None:
            flags = {}
        elif isinstance(raw_flags, str):
            flags = _json.loads(raw_flags)
        else:
            flags = raw_flags
        # The Spring Boot DTO writes camelCase (`drugName`, `chiefComplaint`, …)
        # via patchReportDraftJsonb, while the agent itself writes snake_case
        # via update_soap_draft. Normalize both shapes before validating.
        return MedicalReport(**_camel_to_snake_keys(draft), confidence_flags=flags)

    async def _load_patient_state(self, patient_id: UUID) -> dict:
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT date_of_birth, weight_kg, height_cm, pregnancy_status, pregnancy_trimester "
            "FROM patients WHERE id=$1",
            patient_id,
        )
        if row is None:
            return {"age_years": None, "weight_kg": None, "height_cm": None,
                    "pregnancy_status": "UNKNOWN", "pregnancy_trimester": None}
        dob = row["date_of_birth"]
        age = None
        if dob is not None:
            today = date.today()
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return {
            "age_years": age,
            "weight_kg": float(row["weight_kg"]) if row["weight_kg"] is not None else None,
            "height_cm": float(row["height_cm"]) if row["height_cm"] is not None else None,
            "pregnancy_status": row["pregnancy_status"] or "UNKNOWN",
            "pregnancy_trimester": row["pregnancy_trimester"],
        }

    async def _load_patient_context(self, patient_id: UUID) -> dict:
        try:
            from app.routes.patient_context import aggregate_patient_context
            return await aggregate_patient_context(patient_id)
        except Exception:
            return {}

    async def _load_transcript(self, visit_id: UUID) -> str:
        try:
            from app.persistence.agent_turns import AgentTurnRepository
            repo = AgentTurnRepository()
            turns = await repo.load(visit_id, "report")
            return "\n".join(t.content or "" for t in turns if t.role == "user")
        except Exception:
            return ""

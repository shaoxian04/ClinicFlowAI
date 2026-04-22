from __future__ import annotations

import json
from typing import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from starlette.responses import JSONResponse, StreamingResponse

from app.agents.base import AgentContext, ClarificationRequested
from app.agents.report_agent import ReportAgent
from app.llm.openai_client import OpenAIClient
from app.llm.streaming import clarification_needed
from app.persistence.agent_turns import AgentTurnRepository
from app.persistence.postgres import get_pool
from app.schemas.report import MedicalReport, required_field_is_missing
from app.tools.registry import build_registry
from app.tools.report_tools import (
    GeneratePatientSummaryInput,
    _h_generate_patient_summary,
)

router = APIRouter()

_DUMMY_UUID = UUID("00000000-0000-0000-0000-000000000001")


class GenerateSyncRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID | None = None
    doctor_id: UUID | None = None
    specialty: str | None = None
    transcript: str


class GenerateSyncResponse(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


def _report_to_flat(r: MedicalReport) -> GenerateSyncResponse:
    subj = [r.subjective.chief_complaint]
    if r.subjective.history_of_present_illness:
        subj.append(r.subjective.history_of_present_illness)
    if r.subjective.symptom_duration:
        subj.append(f"Duration: {r.subjective.symptom_duration}")
    if r.subjective.associated_symptoms:
        subj.append("Associated: " + ", ".join(r.subjective.associated_symptoms))

    obj: list[str] = []
    for k, v in (r.objective.vital_signs or {}).items():
        obj.append(f"{k}: {v}")
    if r.objective.physical_exam:
        obj.append(r.objective.physical_exam)

    assess = [r.assessment.primary_diagnosis]
    if r.assessment.differential_diagnoses:
        assess.append("Differentials: " + ", ".join(r.assessment.differential_diagnoses))
    if r.assessment.icd10_codes:
        assess.append("ICD-10: " + ", ".join(r.assessment.icd10_codes))

    plan: list[str] = []
    for m in r.plan.medications:
        parts = [f"{m.drug_name} {m.dose}"]
        if m.frequency:
            parts.append(m.frequency)
        if m.duration:
            parts.append(f"for {m.duration}")
        if m.route:
            parts.append(f"({m.route})")
        plan.append(" ".join(parts))
    if r.plan.investigations:
        plan.append("Investigations: " + ", ".join(r.plan.investigations))
    if r.plan.lifestyle_advice:
        plan.append("Lifestyle: " + ", ".join(r.plan.lifestyle_advice))
    fu = r.plan.follow_up
    if fu.needed:
        fu_text = "Follow-up needed"
        if fu.timeframe:
            fu_text += f" in {fu.timeframe}"
        if fu.reason:
            fu_text += f" ({fu.reason})"
        plan.append(fu_text)
    if r.plan.red_flags:
        plan.append("Red flags: " + "; ".join(r.plan.red_flags))

    return GenerateSyncResponse(
        subjective="\n".join(subj),
        objective="\n".join(obj) if obj else "Vitals and exam not captured.",
        assessment="\n".join(assess),
        plan="\n".join(plan) if plan else "Plan not captured.",
    )


@router.post("/generate-sync")
async def generate_sync(req: GenerateSyncRequest) -> JSONResponse:
    llm = OpenAIClient()
    registry = build_registry()
    patient_id = req.patient_id or _DUMMY_UUID
    doctor_id = req.doctor_id or _DUMMY_UUID
    agent = await ReportAgent.build_with_rules(
        doctor_id=doctor_id,
        specialty=req.specialty,
        llm=llm, registry=registry, turns=AgentTurnRepository(),
    )
    ctx = AgentContext(visit_id=req.visit_id, patient_id=patient_id, doctor_id=doctor_id)

    last_report: MedicalReport | None = None
    try:
        async for ev in agent.step(ctx, user_input=req.transcript):
            if ev.event == "tool.call" and ev.data.get("name") == "update_soap_draft":
                report_data = ev.data.get("args", {}).get("report")
                if report_data:
                    try:
                        last_report = MedicalReport.model_validate(report_data)
                    except Exception:
                        pass
    except ClarificationRequested:
        pass

    if last_report is None:
        return JSONResponse({"subjective": "", "objective": "", "assessment": "", "plan": ""})
    return JSONResponse(_report_to_flat(last_report).model_dump())


class GenerateRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    doctor_id: UUID
    specialty: str | None = None
    transcript: str


class ClarifyRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    doctor_id: UUID
    answer: str


class EditRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    doctor_id: UUID
    edit: str


async def _run_stream(agent: ReportAgent, ctx: AgentContext, user_input: str) -> AsyncIterator[bytes]:
    try:
        async for ev in agent.step(ctx, user_input=user_input):
            yield ev.encode()
    except ClarificationRequested as exc:
        args = exc.call.arguments
        yield clarification_needed(
            field=args.get("field", ""),
            prompt=args.get("prompt", ""),
            context=args.get("context", ""),
        ).encode()


@router.post("/generate")
async def generate(req: GenerateRequest) -> StreamingResponse:
    llm = OpenAIClient()
    registry = build_registry()
    agent = await ReportAgent.build_with_rules(
        doctor_id=req.doctor_id,
        specialty=req.specialty,
        llm=llm, registry=registry, turns=AgentTurnRepository(),
    )
    ctx = AgentContext(visit_id=req.visit_id, patient_id=req.patient_id, doctor_id=req.doctor_id)
    return StreamingResponse(_run_stream(agent, ctx, req.transcript), media_type="text/event-stream")


@router.post("/clarify")
async def clarify(req: ClarifyRequest) -> StreamingResponse:
    llm = OpenAIClient()
    registry = build_registry()
    agent = await ReportAgent.build_with_rules(
        doctor_id=req.doctor_id, specialty=None,
        llm=llm, registry=registry, turns=AgentTurnRepository(),
    )
    ctx = AgentContext(visit_id=req.visit_id, patient_id=req.patient_id, doctor_id=req.doctor_id)
    return StreamingResponse(_run_stream(agent, ctx, req.answer), media_type="text/event-stream")


@router.post("/edit")
async def edit(req: EditRequest) -> StreamingResponse:
    llm = OpenAIClient()
    registry = build_registry()
    agent = await ReportAgent.build_with_rules(
        doctor_id=req.doctor_id, specialty=None,
        llm=llm, registry=registry, turns=AgentTurnRepository(),
    )
    ctx = AgentContext(visit_id=req.visit_id, patient_id=req.patient_id, doctor_id=req.doctor_id)
    return StreamingResponse(_run_stream(agent, ctx, f"Doctor edit request:\n{req.edit}"), media_type="text/event-stream")


class FinalizeRequest(BaseModel):
    visit_id: UUID


@router.post("/finalize")
async def finalize(req: FinalizeRequest) -> JSONResponse:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT report_draft, report_confidence_flags FROM visits WHERE id=$1",
        req.visit_id,
    )
    if row is None or row["report_draft"] is None:
        raise HTTPException(status_code=404, detail="no draft to finalize")

    draft = json.loads(row["report_draft"])
    flags: dict[str, str] = json.loads(row["report_confidence_flags"] or "{}")
    promoted = {k: ("confirmed" if v == "inferred" else v) for k, v in flags.items()}

    merged = MedicalReport(**draft, confidence_flags=promoted)
    missing = required_field_is_missing(merged)
    if missing:
        raise HTTPException(status_code=409, detail=f"required field missing: {missing}")

    summary = await _h_generate_patient_summary(
        GeneratePatientSummaryInput(report=merged, language="en")
    )

    await pool.execute(
        """
        UPDATE visits
        SET report_confidence_flags = $1::jsonb,
            report_draft = $2::jsonb,
            finalized_at = now(),
            status = 'FINALIZED'
        WHERE id = $3
        """,
        json.dumps(promoted),
        json.dumps(merged.model_dump(exclude={"confidence_flags"}), ensure_ascii=False),
        req.visit_id,
    )

    return JSONResponse({
        "ok": True,
        "summary_en": summary.summary_en,
        "summary_ms": summary.summary_ms,
    })

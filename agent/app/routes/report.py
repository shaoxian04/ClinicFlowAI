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

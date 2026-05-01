from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from starlette.responses import JSONResponse

from app.agents.evaluator_agent import EvaluatorAgent, EvaluatorContext
from app.persistence.evaluator_findings import list_active_findings

router = APIRouter()


class ReEvaluateRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    doctor_id: UUID  # accepted for audit; not yet used here


@router.get("/findings/{visit_id}")
async def get_findings(visit_id: UUID) -> JSONResponse:
    rows = await list_active_findings(visit_id)
    return JSONResponse({
        "findings": [
            {
                "id": str(r["id"]),
                "category": r["category"],
                "severity": r["severity"],
                "field_path": r["field_path"],
                "message": r["message"],
                "details": r["details"],
                "acknowledged_at": r["acknowledged_at"].isoformat() if r["acknowledged_at"] else None,
                "acknowledged_by": str(r["acknowledged_by"]) if r["acknowledged_by"] else None,
                "acknowledgement_reason": r["acknowledgement_reason"],
                "gmt_create": r["gmt_create"].isoformat(),
            }
            for r in rows
        ]
    })


@router.post("/re-evaluate")
async def re_evaluate(req: ReEvaluateRequest) -> JSONResponse:
    try:
        result = await EvaluatorAgent().evaluate(
            EvaluatorContext(visit_id=req.visit_id, patient_id=req.patient_id)
        )
    except ValueError:
        # No draft yet — fall back to currently-persisted active findings (may be empty).
        # This is the expected state right after a visit is created or after the
        # draft has been cleared. Returning 404 here would put the panel in
        # "UNAVAILABLE" state for a benign condition.
        rows = await list_active_findings(req.visit_id)
        return JSONResponse({
            "findings": [
                {
                    "category": r["category"],
                    "severity": r["severity"],
                    "field_path": r["field_path"],
                    "message": r["message"],
                    "details": r["details"],
                }
                for r in rows
            ],
            "validators_run": [],
            "validators_unavailable": [{"category": "DRAFT", "reason": "no_draft"}],
        })
    return JSONResponse({
        "findings": [f.model_dump() for f in result.findings],
        "validators_run": result.validators_run,
        "validators_unavailable": [
            {"category": c, "reason": r} for c, r in result.validators_unavailable
        ],
    })

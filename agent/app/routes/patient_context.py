from __future__ import annotations

import asyncio
import structlog
from fastapi import APIRouter, HTTPException
from starlette.responses import JSONResponse
from uuid import UUID

from app.graph.driver import get_driver
from app.graph.queries.patient_context import get_patient_context
from app.graph.queries.visit_history import get_visit_history

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/agents/patient-context", tags=["patient-context"])


async def _probe_neo4j() -> bool:
    """One-shot connectivity check. Returns True if `RETURN 1` succeeds."""
    try:
        driver = get_driver()
        async with driver.session() as session:
            result = await session.run("RETURN 1 AS ok")
            row = await result.single()
            return bool(row and row["ok"] == 1)
    except Exception as exc:  # noqa: BLE001
        log.warning("neo4j probe failed: %s", exc)
        return False


@router.get("/healthz")
async def healthz() -> JSONResponse:
    ok = await _probe_neo4j()
    return JSONResponse({"neo4j": "ok" if ok else "unavailable"}, status_code=200 if ok else 503)


@router.get("/{patient_id}")
async def patient_context(patient_id: UUID) -> JSONResponse:
    results = await asyncio.gather(
        get_patient_context(patient_id),
        get_visit_history(patient_id, limit=5),
        return_exceptions=True,
    )
    if any(isinstance(r, Exception) for r in results):
        errs = [r for r in results if isinstance(r, Exception)]
        log.error("neo4j.patient_context_query_failed patient_id=%s errors=%s", patient_id, errs)
        raise HTTPException(status_code=503, detail="patient graph unavailable")
    ctx, visits = results
    return JSONResponse({
        "patient_id": str(patient_id),
        "allergies":   list(ctx.allergies),
        "conditions":  list(ctx.conditions),
        "medications": list(ctx.medications),
        "recent_visits": [
            {
                "visit_id":          v.visit_id,
                "visited_at":        v.visited_at,
                "primary_diagnosis": v.primary_diagnosis,
                "chief_complaint":   v.chief_complaint,
            }
            for v in visits
        ],
    })

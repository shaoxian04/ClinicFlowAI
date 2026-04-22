from __future__ import annotations

import structlog
from fastapi import APIRouter
from starlette.responses import JSONResponse

from app.graph.driver import get_driver

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

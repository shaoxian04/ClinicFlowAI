from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app.deps import require_service_token
from app.graph.driver import close_driver
from app.graph.schema import apply_schema
from app.routes import post_visit, pre_visit, rules, visit

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await apply_schema()
    except Exception:
        log.exception("neo4j.schema_apply_failed")
    yield
    try:
        await close_driver()
    except Exception:
        log.exception("neo4j.close_driver_failed")


app = FastAPI(
    title="CliniFlow Agent Service",
    version="0.0.1",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metrics", tags=["ops"])
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


app.include_router(
    pre_visit.router,
    prefix="/agents/pre-visit",
    tags=["pre-visit"],
    dependencies=[Depends(require_service_token)],
)
app.include_router(
    visit.router,
    prefix="/agents/visit",
    tags=["visit"],
    dependencies=[Depends(require_service_token)],
)
app.include_router(
    post_visit.router,
    prefix="/agents/post-visit",
    tags=["post-visit"],
    dependencies=[Depends(require_service_token)],
)
app.include_router(
    rules.router,
    prefix="/agents/rules",
    tags=["rules"],
    dependencies=[Depends(require_service_token)],
)

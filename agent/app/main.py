from contextlib import asynccontextmanager

import structlog
from fastapi import Depends, FastAPI
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app.config import settings
from app.deps import require_service_token
from app.graph.driver import close_driver
from app.graph.schema import apply_schema
from app.persistence import postgres
from app.routes import patient_context as patient_context_routes
from app.routes import pre_visit, report, rules

log = structlog.get_logger(__name__)


_PLACEHOLDER_VALUES = {"change-me", "sk-change-me", ""}


def _assert_no_placeholder_secrets() -> None:
    """Fail-fast on placeholder values that cannot possibly work at runtime.
    Warn on symmetric placeholders that are insecure but still functional.

    See docs/post-mortem/2026-04-22-soap-generate-and-finalize-e2e.md §1:
    silent placeholder secrets (`openai_api_key="change-me"`) produced
    opaque 401s that masqueraded as backend bugs. Surface the misconfig
    at boot, not three hops away at request time.
    """
    fatal: list[str] = []
    if settings.openai_api_key in _PLACEHOLDER_VALUES:
        fatal.append("OPENAI_API_KEY (would 401 on first LLM call)")
    # POSTGRES_DSN with the hardcoded localhost default never resolves inside
    # a container and produces the exact silent boot we just debugged.
    if "localhost" in settings.postgres_dsn and settings.postgres_dsn.endswith("/cliniflow"):
        fatal.append("POSTGRES_DSN (still the localhost default — connection will refuse in Docker)")
    if fatal:
        raise RuntimeError(
            "Agent cannot start with placeholder secrets. Set these env vars: "
            + "; ".join(fatal)
        )

    insecure: list[str] = []
    if settings.agent_service_token in _PLACEHOLDER_VALUES:
        insecure.append("AGENT_SERVICE_TOKEN")
    if settings.neo4j_password in _PLACEHOLDER_VALUES:
        insecure.append("NEO4J_PASSWORD")
    if insecure:
        log.warning(
            "agent.startup.placeholder_secrets_in_use insecure=%s "
            "— functional in dev only; rotate before any shared deployment",
            insecure,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Placeholder-secret guard — fail fast, don't boot into a broken state.
    _assert_no_placeholder_secrets()

    # 2. Neo4j schema apply is non-fatal: the graph is optional for some
    #    code paths, and a transient Neo4j outage shouldn't block the agent
    #    from serving pre-visit / report turns that don't touch the graph.
    try:
        await apply_schema()
    except Exception:
        log.exception("neo4j.schema_apply_failed")

    try:
        ok = await patient_context_routes._probe_neo4j()
        if ok:
            log.info("neo4j.probe_ok")
        else:
            log.error("neo4j.probe_failed — patient-context features will degrade")
    except Exception:
        log.exception("neo4j.probe_exception")

    # 3. Postgres pool open is FATAL. Every route reads/writes agent_turns.
    #    A boot that logs "pool_open_failed" but accepts traffic produces
    #    a permanently-500 service that masquerades as 502 upstream.
    #    See post-mortem §5 (silent token rejection) — same debuggability
    #    trap applies to silent pool failures.
    await postgres.open_pool()

    yield

    try:
        await postgres.close_pool()
    except Exception:
        log.exception("postgres.pool_close_failed")
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
    report.router,
    prefix="/agents/report",
    tags=["report"],
    dependencies=[Depends(require_service_token)],
)
app.include_router(
    rules.router,
    prefix="/agents/rules",
    tags=["rules"],
    dependencies=[Depends(require_service_token)],
)
app.include_router(patient_context_routes.router)

from __future__ import annotations

import logging
from typing import Any, AsyncIterator
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from starlette.responses import JSONResponse, StreamingResponse

from app.agents.base import AgentContext, ClarificationRequested
from app.agents.pre_visit_agent import PreVisitIntakeAgent
from app.llm.openai_client import OpenAIClient
from app.persistence.agent_turns import AgentTurnRepository
from app.tools.registry import build_registry

log = logging.getLogger(__name__)

router = APIRouter()


class TurnRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    user_input: str = ""


@router.post("/turn")
async def turn(req: TurnRequest) -> StreamingResponse:
    llm = OpenAIClient()
    registry = build_registry()
    agent = PreVisitIntakeAgent(llm=llm, registry=registry, turns=AgentTurnRepository())
    ctx = AgentContext(visit_id=req.visit_id, patient_id=req.patient_id, doctor_id=None)

    async def generator() -> AsyncIterator[bytes]:
        try:
            async for ev in agent.step(ctx, user_input=req.user_input):
                yield ev.encode()
        except ClarificationRequested:
            return

    return StreamingResponse(generator(), media_type="text/event-stream")


class TurnSyncRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    user_input: str = ""


class TurnSyncResponse(BaseModel):
    assistant_message: str = ""
    fields: dict[str, Any] = {}
    done: bool = False


_DONE_SENTINELS = (
    "captured everything the doctor needs",
    "captured everything your doctor needs",
)


@router.post("/turn-sync")
async def turn_sync(req: TurnSyncRequest) -> JSONResponse:
    """Synchronous variant of /turn. Runs the ReAct step, aggregates message
    deltas into a single assistant reply, infers `done` from the sentinel
    phrase the system prompt commits to. Intended for the Spring Boot backend
    which expects a JSON envelope, not SSE.
    """
    llm = OpenAIClient()
    registry = build_registry()
    agent = PreVisitIntakeAgent(llm=llm, registry=registry, turns=AgentTurnRepository())
    ctx = AgentContext(visit_id=req.visit_id, patient_id=req.patient_id, doctor_id=None)

    parts: list[str] = []
    try:
        async for ev in agent.step(ctx, user_input=req.user_input):
            if ev.event == "message.delta":
                text = ev.data.get("text") or ""
                if text:
                    parts.append(text)
    except ClarificationRequested:
        log.info("pre_visit.turn_sync clarification requested visit_id=%s", req.visit_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("pre_visit.turn_sync failed visit_id=%s", req.visit_id)
        return JSONResponse(
            status_code=500,
            content={"error": f"{type(exc).__name__}: {exc}"},
        )

    assistant_message = "\n".join(p for p in parts if p).strip()
    lowered = assistant_message.lower()
    done = any(s in lowered for s in _DONE_SENTINELS)

    # Rebuild the conversation history for extraction. agent.step() already
    # persisted the current user/assistant turn to Postgres, so the DB load
    # normally includes them — trust it and avoid double-appending. Only seed
    # the current turn manually if the load failed OR returned stale data that
    # doesn't include the just-processed turn.
    try:
        turns = await AgentTurnRepository().load(req.visit_id, "pre_visit")
        history_messages: list[dict[str, str]] = [
            {"role": t.role, "content": t.content}
            for t in turns
            if t.role in ("user", "assistant")
        ]
    except Exception as exc:  # noqa: BLE001
        log.warning("pre_visit.turn_sync history load failed: %s", exc)
        history_messages = []

    # Idempotent seeding: if the DB already contains the current turn, these
    # no-op; if it doesn't (DB failure or race), we seed so extraction has at
    # least the current turn to work with.
    if req.user_input and not any(
        msg.get("role") == "user" and msg.get("content") == req.user_input
        for msg in history_messages
    ):
        history_messages.append({"role": "user", "content": req.user_input})
    if assistant_message and not any(
        msg.get("role") == "assistant" and msg.get("content") == assistant_message
        for msg in history_messages
    ):
        history_messages.append({"role": "assistant", "content": assistant_message})

    slots = await agent.extract_slots(history_messages)

    return JSONResponse(
        TurnSyncResponse(
            assistant_message=assistant_message,
            fields=slots.model_dump(),
            done=done,
        ).model_dump()
    )

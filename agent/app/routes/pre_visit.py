from __future__ import annotations

from typing import AsyncIterator
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.agents.base import AgentContext, ClarificationRequested
from app.agents.pre_visit_agent import PreVisitIntakeAgent
from app.llm.openai_client import OpenAIClient
from app.persistence.agent_turns import AgentTurnRepository
from app.tools.registry import build_registry

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

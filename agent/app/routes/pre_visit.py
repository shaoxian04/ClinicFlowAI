from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.graphs.pre_visit import run_turn

router = APIRouter()


class TurnRequest(BaseModel):
    structured: dict[str, Any] = Field(default_factory=dict)


class TurnResponse(BaseModel):
    assistantMessage: str  # noqa: N815 — camelCase matches Java record accessor
    fields: dict[str, Any]
    done: bool


@router.post("/turn", response_model=TurnResponse)
async def turn(req: TurnRequest) -> TurnResponse:
    result = await run_turn(req.structured)
    return TurnResponse(
        assistantMessage=result["assistant_message"],
        fields=result["fields"],
        done=result["done"],
    )

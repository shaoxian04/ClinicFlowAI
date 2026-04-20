from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class PreVisitStartRequest(BaseModel):
    patient_id: str
    locale: str = "en-MY"


class PreVisitStepRequest(BaseModel):
    session_id: str
    user_message: str


class PreVisitTurn(BaseModel):
    session_id: str
    assistant_message: str
    is_complete: bool = False


@router.post("/start", response_model=PreVisitTurn)
async def start(_: PreVisitStartRequest) -> PreVisitTurn:
    raise NotImplementedError("Pre-visit agent graph not yet wired")


@router.post("/continue", response_model=PreVisitTurn)
async def continue_step(_: PreVisitStepRequest) -> PreVisitTurn:
    raise NotImplementedError("Pre-visit agent graph not yet wired")

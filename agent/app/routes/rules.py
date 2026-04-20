from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class RuleFeedbackRequest(BaseModel):
    visit_id: str
    doctor_id: str
    ai_draft: str
    doctor_final: str


class RuleFeedbackResponse(BaseModel):
    visit_id: str
    proposed_rule_id: str | None = None
    accepted: bool = False


@router.post("/feedback", response_model=RuleFeedbackResponse)
async def feedback(_: RuleFeedbackRequest) -> RuleFeedbackResponse:
    """Hermes feedback intake — style rules only, never clinical reasoning."""
    raise NotImplementedError("Hermes adaptive rule engine not yet wired")

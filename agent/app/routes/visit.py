from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class VisitGenerateRequest(BaseModel):
    visit_id: str
    transcript: str | None = None
    notes_text: str | None = None


class SoapReport(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class VisitGenerateResponse(BaseModel):
    visit_id: str
    report: SoapReport
    is_ai_draft: bool = True


@router.post("/generate", response_model=VisitGenerateResponse)
async def generate(_: VisitGenerateRequest) -> VisitGenerateResponse:
    raise NotImplementedError("Visit agent graph not yet wired")

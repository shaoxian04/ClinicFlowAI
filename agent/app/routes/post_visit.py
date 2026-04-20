from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class PostVisitGenerateRequest(BaseModel):
    visit_id: str


class PostVisitSummary(BaseModel):
    visit_id: str
    patient_summary: str
    medication_instructions: list[str]


@router.post("/generate", response_model=PostVisitSummary)
async def generate(_: PostVisitGenerateRequest) -> PostVisitSummary:
    raise NotImplementedError("Post-visit agent graph not yet wired")

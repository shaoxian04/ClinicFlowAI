from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.graphs.soap import generate_soap

router = APIRouter()


class VisitGenerateRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    visit_id: str
    transcript: str = ""
    pre_visit: dict = Field(default_factory=dict)


class SoapReport(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class VisitGenerateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    visit_id: str
    report: SoapReport
    is_ai_draft: bool = True


@router.post("/generate", response_model=VisitGenerateResponse, response_model_by_alias=True)
async def generate(req: VisitGenerateRequest) -> VisitGenerateResponse:
    soap = await generate_soap(pre_visit=req.pre_visit, transcript=req.transcript)
    return VisitGenerateResponse(visit_id=req.visit_id, report=SoapReport(**soap))

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.graphs.post_visit import summarize

router = APIRouter()


class Soap(BaseModel):
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""


class Medication(BaseModel):
    name: str
    dosage: str
    frequency: str


class PostVisitSummarizeRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    visit_id: str
    soap: Soap = Field(default_factory=Soap)
    medications: list[Medication] = Field(default_factory=list)


class PostVisitSummarizeResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    visit_id: str
    summary_en: str
    summary_ms: str


@router.post("/summarize", response_model=PostVisitSummarizeResponse, response_model_by_alias=True)
async def summarize_route(req: PostVisitSummarizeRequest) -> PostVisitSummarizeResponse:
    out = await summarize(
        soap=req.soap.model_dump(),
        medications=[m.model_dump() for m in req.medications],
    )
    return PostVisitSummarizeResponse(
        visit_id=req.visit_id,
        summary_en=out["summary_en"],
        summary_ms=out["summary_ms"],
    )

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.graph.queries.drug_interaction import check_drug_interactions
from app.graph.queries.inferred_edge import record_inferred_edge as _record_inferred_edge
from app.graph.queries.patient_context import get_patient_context
from app.graph.queries.visit_history import get_visit_history
from app.tools.spec import ToolSpec


# --- get_patient_context --------------------------------------------------

class GetPatientContextInput(BaseModel):
    patient_id: UUID


class GetPatientContextOutput(BaseModel):
    patient_id: str
    demographics: dict = Field(default_factory=dict)
    allergies: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)


async def _h_get_patient_context(inp: GetPatientContextInput) -> GetPatientContextOutput:
    ctx = await get_patient_context(inp.patient_id)
    return GetPatientContextOutput(**ctx.__dict__)


TOOL_GET_PATIENT_CONTEXT = ToolSpec(
    name="get_patient_context",
    description="Return patient's known allergies, conditions, medications, demographics from graph.",
    input_schema=GetPatientContextInput,
    output_schema=GetPatientContextOutput,
    handler=_h_get_patient_context,
    permission="read",
)


# --- get_visit_history -----------------------------------------------------

class GetVisitHistoryInput(BaseModel):
    patient_id: UUID
    limit: int = Field(default=5, ge=1, le=20)


class VisitHistoryEntryOut(BaseModel):
    visit_id: str
    visited_at: str | None = None
    chief_complaint: str | None = None
    primary_diagnosis: str | None = None


class GetVisitHistoryOutput(BaseModel):
    entries: list[VisitHistoryEntryOut] = Field(default_factory=list)


async def _h_get_visit_history(inp: GetVisitHistoryInput) -> GetVisitHistoryOutput:
    entries = await get_visit_history(inp.patient_id, limit=inp.limit)
    return GetVisitHistoryOutput(entries=[VisitHistoryEntryOut(**e.__dict__) for e in entries])


TOOL_GET_VISIT_HISTORY = ToolSpec(
    name="get_visit_history",
    description="Return patient's last N visits with chief complaints and diagnoses.",
    input_schema=GetVisitHistoryInput,
    output_schema=GetVisitHistoryOutput,
    handler=_h_get_visit_history,
    permission="read",
)


# --- drug_interaction_check -----------------------------------------------

class DrugInteractionCheckInput(BaseModel):
    patient_id: UUID
    drug_names: list[str] = Field(min_length=1)


class DrugInteractionItem(BaseModel):
    drug: str
    conflicts_with: str
    severity: str


class DrugInteractionCheckOutput(BaseModel):
    conflicts: list[DrugInteractionItem] = Field(default_factory=list)


async def _h_drug_interaction_check(inp: DrugInteractionCheckInput) -> DrugInteractionCheckOutput:
    conflicts = await check_drug_interactions(inp.patient_id, inp.drug_names)
    return DrugInteractionCheckOutput(
        conflicts=[DrugInteractionItem(**c.__dict__) for c in conflicts]
    )


TOOL_DRUG_INTERACTION_CHECK = ToolSpec(
    name="drug_interaction_check",
    description="Check proposed medications against patient's allergies and current drugs.",
    input_schema=DrugInteractionCheckInput,
    output_schema=DrugInteractionCheckOutput,
    handler=_h_drug_interaction_check,
    permission="read",
)


# --- record_inferred_edge -------------------------------------------------

class RecordInferredEdgeInput(BaseModel):
    visit_id: UUID
    from_label: str
    from_id: str
    rel_type: str
    to_label: str
    to_id: str
    confidence: float = Field(ge=0.0, le=1.0)


class RecordInferredEdgeOutput(BaseModel):
    ok: bool = True


async def _h_record_inferred_edge(inp: RecordInferredEdgeInput) -> RecordInferredEdgeOutput:
    await _record_inferred_edge(
        visit_id=inp.visit_id,
        from_label=inp.from_label,
        from_id=inp.from_id,
        rel_type=inp.rel_type,
        to_label=inp.to_label,
        to_id=inp.to_id,
        confidence=inp.confidence,
    )
    return RecordInferredEdgeOutput()


TOOL_RECORD_INFERRED_EDGE = ToolSpec(
    name="record_inferred_edge",
    description="Write INFERRED graph edge with confidence score and source visit.",
    input_schema=RecordInferredEdgeInput,
    output_schema=RecordInferredEdgeOutput,
    handler=_h_record_inferred_edge,
    permission="write",
)

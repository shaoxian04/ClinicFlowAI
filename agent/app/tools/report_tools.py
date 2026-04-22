from __future__ import annotations

import json
from uuid import UUID

from pydantic import BaseModel

from app.persistence.postgres import get_pool
from app.schemas.clarification import AskDoctorClarificationInput, AskDoctorClarificationOutput
from app.schemas.report import MedicalReport
from app.tools.spec import ToolSpec


class UpdateSoapDraftInput(BaseModel):
    visit_id: UUID
    report: MedicalReport


class UpdateSoapDraftOutput(BaseModel):
    ok: bool = True


async def _h_update_soap_draft(inp: UpdateSoapDraftInput) -> UpdateSoapDraftOutput:
    pool = get_pool()
    await pool.execute(
        """
        UPDATE visits
        SET report_draft = $1::jsonb,
            report_confidence_flags = $2::jsonb
        WHERE id = $3
        """,
        json.dumps(inp.report.model_dump(exclude={"confidence_flags"}), ensure_ascii=False),
        json.dumps(inp.report.confidence_flags, ensure_ascii=False),
        inp.visit_id,
    )
    return UpdateSoapDraftOutput()


TOOL_UPDATE_SOAP_DRAFT = ToolSpec(
    name="update_soap_draft",
    description="Persist typed SOAP draft to visit record; marks fields as unconfirmed.",
    input_schema=UpdateSoapDraftInput,
    output_schema=UpdateSoapDraftOutput,
    handler=_h_update_soap_draft,
    permission="write",
)


async def _h_ask_doctor_clarification(inp: AskDoctorClarificationInput) -> AskDoctorClarificationOutput:
    return AskDoctorClarificationOutput()


TOOL_ASK_DOCTOR_CLARIFICATION = ToolSpec(
    name="ask_doctor_clarification",
    description="Pause agent and ask doctor for one missing required report field.",
    input_schema=AskDoctorClarificationInput,
    output_schema=AskDoctorClarificationOutput,
    handler=_h_ask_doctor_clarification,
    permission="write",
)

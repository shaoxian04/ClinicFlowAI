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


from app.llm.openai_client import OpenAIClient as _OpenAIClient  # noqa: E402


class GeneratePatientSummaryInput(BaseModel):
    report: MedicalReport
    language: str = "en"


class GeneratePatientSummaryOutput(BaseModel):
    summary_en: str = ""
    summary_ms: str = ""


_SUMMARY_SYSTEM = """You write a patient-friendly visit summary at Primary-6 \
reading level, in both English and Malay. Output ONLY a single JSON object with \
keys summary_en and summary_ms. No markdown, no commentary."""


async def _h_generate_patient_summary(inp: GeneratePatientSummaryInput) -> GeneratePatientSummaryOutput:
    if any(flag == "inferred" for flag in inp.report.confidence_flags.values()):
        raise ValueError("generate_patient_summary rejects reports with inferred fields — finalize first")

    user = f"Report JSON:\n{json.dumps(inp.report.model_dump(), ensure_ascii=False)}"
    client = _OpenAIClient()
    resp = await client.chat(
        messages=[
            {"role": "system", "content": _SUMMARY_SYSTEM},
            {"role": "user", "content": user},
        ],
        tools=[],
    )
    try:
        data = json.loads(resp.text)
    except json.JSONDecodeError:
        data = {}
    return GeneratePatientSummaryOutput(
        summary_en=str(data.get("summary_en", "")),
        summary_ms=str(data.get("summary_ms", "")),
    )


TOOL_GENERATE_PATIENT_SUMMARY = ToolSpec(
    name="generate_patient_summary",
    description="Produce bilingual patient-facing summary from confirmed SOAP report.",
    input_schema=GeneratePatientSummaryInput,
    output_schema=GeneratePatientSummaryOutput,
    handler=_h_generate_patient_summary,
    permission="read",
)

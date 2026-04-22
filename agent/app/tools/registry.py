from __future__ import annotations

from app.tools.clinical_tools import TOOL_CLINICAL_DICTIONARY_EXTRACT
from app.tools.graph_tools import (
    TOOL_DRUG_INTERACTION_CHECK,
    TOOL_GET_PATIENT_CONTEXT,
    TOOL_GET_VISIT_HISTORY,
    TOOL_RECORD_INFERRED_EDGE,
)
from app.tools.meta_tools import TOOL_EMIT_REASONING
from app.tools.report_tools import (
    TOOL_ASK_DOCTOR_CLARIFICATION,
    TOOL_UPDATE_SOAP_DRAFT,
)
from app.tools.spec import ToolRegistry

PRE_VISIT_TOOLS = ["get_patient_context", "get_visit_history", "emit_reasoning"]

REPORT_TOOLS = [
    "get_patient_context",
    "get_visit_history",
    "clinical_dictionary_extract",
    "drug_interaction_check",
    "record_inferred_edge",
    "update_soap_draft",
    "ask_doctor_clarification",
    "emit_reasoning",
]


def build_registry() -> ToolRegistry:
    tools = [
        TOOL_GET_PATIENT_CONTEXT,
        TOOL_GET_VISIT_HISTORY,
        TOOL_CLINICAL_DICTIONARY_EXTRACT,
        TOOL_DRUG_INTERACTION_CHECK,
        TOOL_RECORD_INFERRED_EDGE,
        TOOL_UPDATE_SOAP_DRAFT,
        TOOL_ASK_DOCTOR_CLARIFICATION,
        TOOL_EMIT_REASONING,
    ]
    reg = ToolRegistry(tools)
    names = {t.name for t in tools}
    reg.register_allowlist("pre_visit", [n for n in PRE_VISIT_TOOLS if n in names])
    reg.register_allowlist("report", [n for n in REPORT_TOOLS if n in names])
    return reg

from __future__ import annotations

from app.tools.graph_tools import (
    TOOL_DRUG_INTERACTION_CHECK,
    TOOL_GET_PATIENT_CONTEXT,
    TOOL_GET_VISIT_HISTORY,
    TOOL_RECORD_INFERRED_EDGE,
)
from app.tools.meta_tools import TOOL_EMIT_REASONING
from app.tools.spec import ToolRegistry

PRE_VISIT_TOOLS = ["get_patient_context", "get_visit_history", "emit_reasoning"]

REPORT_TOOLS = [
    "get_patient_context",
    "get_visit_history",
    "get_applicable_adaptive_rules",
    "clinical_dictionary_extract",
    "drug_interaction_check",
    "record_inferred_edge",
    "update_soap_draft",
    "ask_doctor_clarification",
    "generate_patient_summary",
    "emit_reasoning",
]


def build_registry() -> ToolRegistry:
    tools = [
        TOOL_GET_PATIENT_CONTEXT,
        TOOL_GET_VISIT_HISTORY,
        TOOL_DRUG_INTERACTION_CHECK,
        TOOL_RECORD_INFERRED_EDGE,
        TOOL_EMIT_REASONING,
    ]
    reg = ToolRegistry(tools)
    reg.register_allowlist("pre_visit", [n for n in PRE_VISIT_TOOLS if n in {t.name for t in tools}])
    return reg

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.openai_client import get_chat_model

SOAP_KEYS = ("subjective", "objective", "assessment", "plan")

_SYSTEM_PROMPT = """You are a clinical scribe. Produce a SOAP note from a
consultation transcript and a pre-visit intake. Output ONLY a single JSON
object with exactly these keys: subjective, objective, assessment, plan.
Each value is a plain-text string. No markdown, no commentary."""


async def _llm_call(system: str, user: str) -> str:
    model = get_chat_model()
    resp = await model.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
    return resp.content if isinstance(resp.content, str) else str(resp.content)


async def generate_soap(pre_visit: dict[str, Any], transcript: str) -> dict[str, str]:
    user = (
        f"Pre-visit intake (JSON): {json.dumps(pre_visit, ensure_ascii=False)}\n\n"
        f"Consultation transcript:\n{transcript or '(none provided)'}\n\n"
        "Return the JSON SOAP note now."
    )
    raw = await _llm_call(_SYSTEM_PROMPT, user)
    try:
        data = json.loads(raw)
        return {k: str(data.get(k, "")) for k in SOAP_KEYS}
    except (json.JSONDecodeError, TypeError):
        return {k: "" for k in SOAP_KEYS}

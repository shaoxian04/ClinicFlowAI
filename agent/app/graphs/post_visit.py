from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.openai_client import get_chat_model

SUMMARY_KEYS = ("summary_en", "summary_ms")

_SYSTEM_PROMPT = """You are a clinical scribe writing a patient-friendly post-visit summary.
Rewrite the SOAP note in plain language at a Primary-6 reading level, in BOTH English and Malay.
Include clear guidance on any prescribed medications (name, dose, how to take them).
Output ONLY a single JSON object with exactly these keys: summary_en, summary_ms.
Each value is a plain-text paragraph (no markdown, no bullet lists, no commentary)."""


async def _llm_call(system: str, user: str) -> str:
    model = get_chat_model()
    resp = await model.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
    return resp.content if isinstance(resp.content, str) else str(resp.content)


async def summarize(soap: dict[str, Any], medications: list[dict[str, Any]]) -> dict[str, str]:
    user = (
        f"SOAP note (JSON): {json.dumps(soap, ensure_ascii=False)}\n\n"
        f"Prescribed medications (JSON): {json.dumps(medications, ensure_ascii=False)}\n\n"
        "Return the JSON summary now."
    )
    raw = await _llm_call(_SYSTEM_PROMPT, user)
    try:
        data = json.loads(raw)
        return {k: str(data.get(k, "")) for k in SUMMARY_KEYS}
    except (json.JSONDecodeError, TypeError):
        return {k: "" for k in SUMMARY_KEYS}

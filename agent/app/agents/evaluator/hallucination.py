"""Hallucination validator — single LLM call. Returns HIGH findings for UNSUPPORTED claims.

Output JSON contract:
  { "unsupported": [ { "field_path": "...", "claim": "...", "reason": "..." } ] }

If parse fails or LLM times out, returns [] and the orchestrator marks the validator
as unavailable.
"""
from __future__ import annotations

import asyncio
import json

from app.config import settings
from app.llm.openai_client import OpenAIClient
from app.schemas.evaluator import Finding
from app.schemas.report import MedicalReport

SYSTEM_PROMPT = """You are a clinical-fact reviewer. For every clinical claim in the SOAP \
draft, decide whether it is SUPPORTED (appears in transcript), CONTEXTUAL (in patient \
context graph data), INFERRED (already marked in confidence_flags), or UNSUPPORTED (no source). \
Output ONLY a JSON object: {"unsupported": [{"field_path": "...", "claim": "...", "reason": "..."}]}. \
Do NOT invent example values. NEVER mention any specific allergy / medication / condition / past \
visit unless that exact string appears in the inputs you received this turn. If a slot is empty, \
treat the claim as UNSUPPORTED — do not assume default values."""


async def _client_chat(messages: list[dict]):
    client = OpenAIClient()
    return await client.chat(messages=messages, tools=[])


async def run_hallucination(
    report: MedicalReport,
    patient_context: dict,
    transcript: str,
) -> list[Finding]:
    user_msg = (
        "DRAFT (JSON):\n" + json.dumps(report.model_dump(), ensure_ascii=False) + "\n\n"
        "PATIENT CONTEXT (JSON):\n" + json.dumps(patient_context, ensure_ascii=False) + "\n\n"
        "TRANSCRIPT:\n" + transcript
    )
    try:
        resp = await asyncio.wait_for(
            _client_chat([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ]),
            timeout=settings.evaluator_timeout_llm_seconds,
        )
    except (TimeoutError, asyncio.TimeoutError):
        return []
    except Exception:
        return []

    try:
        data = json.loads(resp.text)
        items = data.get("unsupported", [])
    except (json.JSONDecodeError, AttributeError):
        return []

    findings: list[Finding] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        findings.append(Finding(
            category="HALLUCINATION", severity="HIGH",
            field_path=item.get("field_path"),
            message=f"Unsupported claim: {item.get('claim','')}",
            details={"claim": item.get("claim", ""), "reason": item.get("reason", "")},
        ))
    return findings

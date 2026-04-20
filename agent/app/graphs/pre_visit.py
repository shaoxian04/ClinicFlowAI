"""Stateless pre-visit turn handler.

The backend owns conversation state. Each turn receives the full history +
known fields and returns the next assistant message + updated fields. No
in-memory state is kept across requests.
"""
from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.openai_client import get_chat_model

REQUIRED_FIELDS: list[str] = [
    "chief_complaint",
    "duration",
    "severity",
    "allergies",
    "current_medications",
]

NEXT_QUESTION: dict[str, str] = {
    "chief_complaint": "What's the main reason for your visit today?",
    "duration": "How long have you had this?",
    "severity": "On a scale of 1 to 10, how severe is it?",
    "allergies": "Do you have any allergies I should know about?",
    "current_medications": "Are you taking any medications right now?",
}

CLOSING_MESSAGE = (
    "Thank you — I've captured everything the doctor needs before your "
    "appointment. You can close this chat now."
)

_EXTRACT_PROMPT = """\
You extract a single structured field from a patient's reply during a \
pre-visit intake chat. Return ONLY the extracted value as plain text, \
nothing else. No quotes, no JSON, no preamble.

Field to extract: {field_name}
Question just asked: {question}
Patient's reply: {reply}

Field value:"""


async def _extract_field(field_name: str, question: str, reply: str) -> str:
    model = get_chat_model()
    prompt = _EXTRACT_PROMPT.format(
        field_name=field_name, question=question, reply=reply
    )
    response = await model.ainvoke(
        [
            SystemMessage(content="You extract structured fields from free text."),
            HumanMessage(content=prompt),
        ]
    )
    return (response.content or "").strip()


def _first_missing(fields: dict[str, Any]) -> str | None:
    for f in REQUIRED_FIELDS:
        if f not in fields or not fields[f]:
            return f
    return None


async def run_turn(structured: dict[str, Any]) -> dict[str, Any]:
    fields: dict[str, Any] = dict(structured.get("fields", {}))
    history: list[dict[str, str]] = list(structured.get("history", []))

    # Identify the question we just asked (last assistant message)
    last_assistant = next(
        (m["content"] for m in reversed(history) if m["role"] == "assistant"),
        None,
    )
    last_user = next(
        (m["content"] for m in reversed(history) if m["role"] == "user"),
        "",
    )

    # Which field was that question targeting?
    current_field: str | None = None
    for field, q in NEXT_QUESTION.items():
        if last_assistant == q:
            current_field = field
            break

    if current_field and last_user and current_field not in fields:
        value = await _extract_field(current_field, last_assistant, last_user)
        fields[current_field] = value

    next_field = _first_missing(fields)
    if next_field is None:
        return {
            "assistant_message": CLOSING_MESSAGE,
            "fields": fields,
            "done": True,
        }
    return {
        "assistant_message": NEXT_QUESTION[next_field],
        "fields": fields,
        "done": False,
    }

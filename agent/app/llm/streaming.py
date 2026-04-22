from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SseEvent:
    event: str
    data: dict[str, Any]

    def encode(self) -> bytes:
        return f"event: {self.event}\ndata: {json.dumps(self.data, ensure_ascii=False)}\n\n".encode("utf-8")


def turn_start(visit_id: str, agent_type: str, turn_index: int) -> SseEvent:
    return SseEvent("turn.start", {"visit_id": visit_id, "agent_type": agent_type, "turn_index": turn_index})


def reasoning_delta(text: str) -> SseEvent:
    return SseEvent("reasoning.delta", {"text": text})


def tool_call(name: str, args: dict[str, Any]) -> SseEvent:
    return SseEvent("tool.call", {"name": name, "args": args})


def tool_result(name: str, result: dict[str, Any]) -> SseEvent:
    return SseEvent("tool.result", {"name": name, "result": result})


def message_delta(text: str) -> SseEvent:
    return SseEvent("message.delta", {"text": text})


def clarification_needed(field: str, prompt: str, context: str) -> SseEvent:
    return SseEvent("clarification.needed", {"field": field, "prompt": prompt, "context": context})


def turn_complete(turn_index: int) -> SseEvent:
    return SseEvent("turn.complete", {"turn_index": turn_index})


def agent_error(message: str) -> SseEvent:
    return SseEvent("agent.error", {"message": message})

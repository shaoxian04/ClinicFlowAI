from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, AsyncIterator
from uuid import UUID

import structlog

from app.config import settings
from app.llm.client import ChatResponse, LLMClient, ToolCall
from app.llm.streaming import (
    SseEvent,
    agent_error,
    message_delta,
    reasoning_delta,
    tool_call as sse_tool_call,
    tool_result as sse_tool_result,
    turn_complete,
    turn_start,
)
from app.llm.structured import tool_spec_to_openai_schema, validate_tool_arguments
from app.persistence.agent_turns import AgentTurnRepository, TurnRecord
from app.tools.spec import ToolNotFoundError, ToolRegistry, ToolSpec

log = structlog.get_logger(__name__)

_THINKING_RE = re.compile(r"<thinking>(.*?)</thinking>", re.DOTALL)


class AgentStepLimitExceeded(RuntimeError):
    pass


class ClarificationRequested(Exception):
    """Raised when an agent emits ask_doctor_clarification. Not an error."""

    def __init__(self, call: ToolCall) -> None:
        self.call = call
        super().__init__(f"clarification requested: {call.arguments}")


@dataclass
class AgentContext:
    visit_id: UUID
    patient_id: UUID | None
    doctor_id: UUID | None
    language: str = "en"


class BaseAgent(ABC):
    agent_type: str  # "pre_visit" | "report"

    def __init__(
        self,
        llm: LLMClient,
        registry: ToolRegistry,
        turns: AgentTurnRepository,
    ) -> None:
        self._llm = llm
        self._registry = registry
        self._turns = turns

    @abstractmethod
    def system_prompt(self, ctx: AgentContext, rules: list[dict] | None = None) -> str: ...

    @abstractmethod
    def build_user_message(self, ctx: AgentContext, user_input: str) -> str: ...

    async def step(
        self,
        ctx: AgentContext,
        user_input: str,
    ) -> AsyncIterator[SseEvent]:
        """One ReAct step (LLM + tool calls). Yields SSE events.

        Persists: user turn (if any), tool calls + results, final assistant turn.
        Halts on ClarificationRequested (caller's problem to resume later).
        """
        next_idx = await self._turns.next_turn_index(ctx.visit_id, self.agent_type)
        yield turn_start(str(ctx.visit_id), self.agent_type, next_idx)

        if next_idx == 0:
            await self._turns.append(TurnRecord(
                visit_id=ctx.visit_id, agent_type=self.agent_type, turn_index=0,
                role="system", content=self.system_prompt(ctx), reasoning=None,
                tool_call_name=None, tool_call_args=None, tool_result=None,
            ))
            next_idx = 1

        if user_input:
            await self._turns.append(TurnRecord(
                visit_id=ctx.visit_id, agent_type=self.agent_type, turn_index=next_idx,
                role="user", content=self.build_user_message(ctx, user_input), reasoning=None,
                tool_call_name=None, tool_call_args=None, tool_result=None,
            ))
            next_idx += 1

        messages = await self._load_openai_messages(ctx)
        openai_tools = [tool_spec_to_openai_schema(t) for t in self._registry.for_agent(self.agent_type)]

        for _ in range(settings.llm_max_steps):
            response = await self._llm.chat(messages=messages, tools=openai_tools)

            reasoning_text = self._extract_reasoning(response.text)
            if reasoning_text:
                yield reasoning_delta(reasoning_text)

            if response.tool_calls:
                visible = self._strip_reasoning(response.text)
                if visible.strip():
                    yield message_delta(visible)

                await self._turns.append(TurnRecord(
                    visit_id=ctx.visit_id, agent_type=self.agent_type, turn_index=next_idx,
                    role="assistant", content=visible, reasoning=reasoning_text,
                    tool_call_name=None, tool_call_args=None, tool_result=None,
                ))
                next_idx += 1

                messages.append({
                    "role": "assistant",
                    "content": response.text,
                    "tool_calls": [
                        {"id": tc.id, "type": "function",
                         "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)}}
                        for tc in response.tool_calls
                    ],
                })

                for call in response.tool_calls:
                    yield sse_tool_call(call.name, call.arguments)
                    if call.name == "ask_doctor_clarification":
                        await self._turns.append(TurnRecord(
                            visit_id=ctx.visit_id, agent_type=self.agent_type, turn_index=next_idx,
                            role="tool", content="", reasoning=None,
                            tool_call_name=call.name, tool_call_args=call.arguments,
                            tool_result={"status": "waiting_for_doctor"},
                        ))
                        yield turn_complete(next_idx)
                        raise ClarificationRequested(call)

                    try:
                        spec = self._registry.get(call.name)
                        validated = validate_tool_arguments(spec, call.arguments)
                        result = await spec.handler(validated)
                        result_dict = result.model_dump(mode="json")
                    except (ToolNotFoundError, ValueError) as exc:
                        result_dict = {"error": str(exc)}
                    except Exception as exc:  # noqa: BLE001 — surface to LLM for recovery
                        log.exception("tool.handler_failed", name=call.name)
                        result_dict = {"error": f"{type(exc).__name__}: {exc}"}

                    yield sse_tool_result(call.name, result_dict)

                    await self._turns.append(TurnRecord(
                        visit_id=ctx.visit_id, agent_type=self.agent_type, turn_index=next_idx,
                        role="tool", content=json.dumps(result_dict), reasoning=None,
                        tool_call_name=call.name, tool_call_args=call.arguments,
                        tool_result=result_dict,
                    ))
                    next_idx += 1

                    messages.append({
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(result_dict, ensure_ascii=False),
                    })
                continue

            # No tool calls = final turn
            visible = self._strip_reasoning(response.text)
            if visible:
                yield message_delta(visible)
            await self._turns.append(TurnRecord(
                visit_id=ctx.visit_id, agent_type=self.agent_type, turn_index=next_idx,
                role="assistant", content=visible, reasoning=reasoning_text,
                tool_call_name=None, tool_call_args=None, tool_result=None,
            ))
            yield turn_complete(next_idx)
            return

        yield agent_error("step limit exceeded")
        raise AgentStepLimitExceeded(str(ctx.visit_id))

    async def _load_openai_messages(self, ctx: AgentContext) -> list[dict[str, Any]]:
        turns = await self._turns.load(ctx.visit_id, self.agent_type)
        out: list[dict[str, Any]] = []
        i = 0
        while i < len(turns):
            t = turns[i]
            if t.role == "system":
                out.append({"role": "system", "content": t.content})
                i += 1
            elif t.role == "user":
                out.append({"role": "user", "content": t.content})
                i += 1
            elif t.role == "assistant":
                # Peek ahead to see if tool turns follow — if so, this assistant
                # message issued tool_calls and must carry them to satisfy OpenAI.
                tool_turns: list[TurnRecord] = []
                j = i + 1
                while j < len(turns) and turns[j].role == "tool":
                    tool_turns.append(turns[j])
                    j += 1
                if tool_turns:
                    msg: dict[str, Any] = {
                        "role": "assistant",
                        "content": t.content or "",
                        "tool_calls": [
                            {
                                "id": f"t{tt.turn_index}",
                                "type": "function",
                                "function": {
                                    "name": tt.tool_call_name or "unknown",
                                    "arguments": json.dumps(tt.tool_call_args or {}),
                                },
                            }
                            for tt in tool_turns
                        ],
                    }
                    out.append(msg)
                    for tt in tool_turns:
                        out.append({
                            "role": "tool",
                            "tool_call_id": f"t{tt.turn_index}",
                            "content": json.dumps(tt.tool_result or {}, ensure_ascii=False),
                        })
                    i = j
                else:
                    out.append({"role": "assistant", "content": t.content})
                    i += 1
            elif t.role == "tool":
                # Orphan tool turn with no preceding assistant (shouldn't normally happen,
                # but can occur if history was truncated). Skip to avoid OpenAI 400.
                i += 1
            else:
                i += 1
        return out

    @staticmethod
    def _extract_reasoning(text: str) -> str | None:
        m = _THINKING_RE.search(text or "")
        return m.group(1).strip() if m else None

    @staticmethod
    def _strip_reasoning(text: str) -> str:
        return _THINKING_RE.sub("", text or "").strip()

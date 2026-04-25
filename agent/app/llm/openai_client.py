from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from app.config import settings
from app.llm.client import ChatResponse, StreamEvent, ToolCall

_log = logging.getLogger(__name__)


class OpenAIClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self._api_key = api_key or settings.glm_api_key
        self._base_url = (base_url or settings.glm_base_url).rstrip("/")
        self._model = model or settings.glm_model
        self._timeout = timeout or settings.llm_timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    def _payload(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        stream: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"model": self._model, "messages": messages, "stream": stream}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        return payload

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> ChatResponse:
        """Stream the completion internally so the gateway never has to buffer
        the full response before sending the first byte — avoids ILMU/proxy
        504s on long clinical-note generations."""
        # Per-chunk read timeout; total generation can exceed self._timeout.
        chunk_timeout = httpx.Timeout(connect=10.0, read=self._timeout, write=10.0, pool=5.0)
        text_parts: list[str] = []
        finish_reason = ""
        # tool-call accumulator keyed by index
        tc_acc: dict[int, dict[str, Any]] = {}

        async with httpx.AsyncClient(timeout=chunk_timeout) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=self._payload(messages, tools, stream=True),
            ) as r:
                if r.status_code >= 400:
                    body = await r.aread()
                    _log.error(
                        "[LLM] POST %s/chat/completions -> HTTP %d body=%s model=%s tools=%d messages=%d",
                        self._base_url, r.status_code, body[:2000].decode(errors="replace"),
                        self._model, len(tools), len(messages),
                    )
                    r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    raw = line[len("data: "):]
                    if raw == "[DONE]":
                        break
                    try:
                        obj = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    for ch in (obj.get("choices") or []):
                        if ch.get("finish_reason"):
                            finish_reason = ch["finish_reason"]
                        delta = ch.get("delta") or {}
                        if delta.get("content"):
                            text_parts.append(delta["content"])
                        for tc in (delta.get("tool_calls") or []):
                            idx = tc.get("index", 0)
                            if idx not in tc_acc:
                                tc_acc[idx] = {"id": "", "name": "", "arguments": ""}
                            if tc.get("id"):
                                tc_acc[idx]["id"] = tc["id"]
                            fn = tc.get("function") or {}
                            if fn.get("name"):
                                tc_acc[idx]["name"] += fn["name"]
                            if fn.get("arguments"):
                                tc_acc[idx]["arguments"] += fn["arguments"]

        calls: list[ToolCall] = []
        for acc in tc_acc.values():
            try:
                args: dict[str, Any] = json.loads(acc["arguments"]) if acc["arguments"] else {}
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(id=acc["id"], name=acc["name"], arguments=args))
        return ChatResponse(text="".join(text_parts), tool_calls=calls, finish_reason=finish_reason)

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> AsyncIterator[StreamEvent]:
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=self._payload(messages, tools, stream=True),
            ) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    payload = line[len("data: ") :]
                    if payload == "[DONE]":
                        break
                    try:
                        obj = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    for ch in obj.get("choices", []):
                        delta = ch.get("delta", {})
                        content = delta.get("content")
                        finish = ch.get("finish_reason")
                        yield StreamEvent(
                            content_delta=content,
                            tool_call_delta=None,
                            finish_reason=finish,
                        )


# Compat shim — remove once legacy graphs/{pre_visit,soap,post_visit}.py are deleted (Tasks 18, 29).
from functools import lru_cache  # noqa: E402

from langchain_openai import ChatOpenAI  # noqa: E402


@lru_cache(maxsize=1)
def get_chat_model() -> ChatOpenAI:
    return ChatOpenAI(
        base_url=settings.glm_base_url,
        api_key=settings.glm_api_key,
        model=settings.glm_model,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )

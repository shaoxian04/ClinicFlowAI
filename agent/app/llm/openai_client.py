from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from app.config import settings
from app.llm.client import ChatResponse, StreamEvent, ToolCall


class OpenAIClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self._api_key = api_key or settings.openai_api_key
        self._base_url = (base_url or settings.openai_base_url).rstrip("/")
        self._model = model or settings.openai_model
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
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.post(
                f"{self._base_url}/chat/completions",
                headers=self._headers(),
                json=self._payload(messages, tools, stream=False),
            )
            r.raise_for_status()
            data = r.json()
        choice = data["choices"][0]
        msg = choice["message"]
        text = msg.get("content") or ""
        raw_calls = msg.get("tool_calls") or []
        calls: list[ToolCall] = []
        for c in raw_calls:
            fn = c["function"]
            args: dict[str, Any]
            try:
                args = json.loads(fn["arguments"]) if fn.get("arguments") else {}
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(id=c["id"], name=fn["name"], arguments=args))
        return ChatResponse(text=text, tool_calls=calls, finish_reason=choice.get("finish_reason") or "")

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
from functools import lru_cache

from langchain_openai import ChatOpenAI


@lru_cache(maxsize=1)
def get_chat_model() -> ChatOpenAI:
    """
    Singleton chat model. OpenAI-compatible — swap to Z.AI GLM by changing
    OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL env vars.
    """
    return ChatOpenAI(
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,
    )

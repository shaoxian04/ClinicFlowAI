
import pytest
import respx
from httpx import Response

from app.llm.openai_client import OpenAIClient


@pytest.mark.asyncio
async def test_chat_non_streaming_returns_text(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = OpenAIClient(api_key="sk-test", base_url="https://api.openai.com/v1", model="gpt-4o-mini")
    sse_body = (
        b'data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n'
        b'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
        b'data: [DONE]\n\n'
    )
    with respx.mock(base_url="https://api.openai.com/v1") as mock:
        mock.post("/chat/completions").mock(
            return_value=Response(200, content=sse_body, headers={"content-type": "text/event-stream"})
        )
        resp = await client.chat(
            messages=[{"role": "user", "content": "hi"}],
            tools=[],
        )
    assert resp.text == "hi"
    assert resp.tool_calls == []


@pytest.mark.asyncio
async def test_chat_parses_tool_calls():
    client = OpenAIClient(api_key="sk-test", base_url="https://api.openai.com/v1", model="gpt-4o-mini")
    sse_body = (
        b'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_patient_context","arguments":""}}]},"finish_reason":null}]}\n\n'
        b'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"patient_id\\":\\"abc\\"}"}}]},"finish_reason":null}]}\n\n'
        b'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n'
        b'data: [DONE]\n\n'
    )
    with respx.mock(base_url="https://api.openai.com/v1") as mock:
        mock.post("/chat/completions").mock(
            return_value=Response(200, content=sse_body, headers={"content-type": "text/event-stream"})
        )
        resp = await client.chat(messages=[{"role": "user", "content": "go"}], tools=[])
    assert resp.tool_calls[0].name == "get_patient_context"
    assert resp.tool_calls[0].arguments == {"patient_id": "abc"}
    assert resp.tool_calls[0].id == "call_1"


@pytest.mark.asyncio
async def test_chat_stream_yields_content_and_tool_deltas():
    client = OpenAIClient(api_key="sk-test", base_url="https://api.openai.com/v1", model="gpt-4o-mini")
    sse_body = (
        b'data: {"choices":[{"delta":{"content":"hel"},"index":0}]}\n\n'
        b'data: {"choices":[{"delta":{"content":"lo"},"index":0}]}\n\n'
        b'data: [DONE]\n\n'
    )
    with respx.mock(base_url="https://api.openai.com/v1") as mock:
        mock.post("/chat/completions").mock(
            return_value=Response(200, content=sse_body, headers={"content-type": "text/event-stream"})
        )
        out = []
        async for ev in client.chat_stream(messages=[{"role": "user", "content": "hi"}], tools=[]):
            out.append(ev)
    text = "".join(ev.content_delta for ev in out if ev.content_delta)
    assert text == "hello"

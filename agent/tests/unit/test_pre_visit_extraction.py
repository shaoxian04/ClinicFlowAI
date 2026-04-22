import json
import pytest

from app.agents.pre_visit_agent import PreVisitIntakeAgent
from app.llm.client import ChatResponse
from app.persistence.agent_turns import AgentTurnRepository
from app.schemas.pre_visit import PreVisitSlots
from app.tools.spec import ToolRegistry


class FakeLLM:
    def __init__(self, text: str):
        self._text = text
    async def chat(self, messages, tools):
        return ChatResponse(text=self._text, tool_calls=[], finish_reason="stop")
    async def chat_stream(self, messages, tools):  # pragma: no cover
        raise NotImplementedError


@pytest.mark.asyncio
async def test_extract_slots_parses_complete_json():
    llm = FakeLLM(json.dumps({
        "chief_complaint": "cough for 3 days",
        "symptom_duration": "3 days",
        "pain_severity": 4,
        "known_allergies": ["penicillin"],
        "current_medications": [],
        "relevant_history": ["asthma"],
    }))
    agent = PreVisitIntakeAgent(llm=llm, registry=ToolRegistry([]), turns=AgentTurnRepository())
    slots = await agent.extract_slots([
        {"role": "assistant", "content": "Hi!"},
        {"role": "user", "content": "i have a cough for 3 days"},
    ])
    assert isinstance(slots, PreVisitSlots)
    assert slots.chief_complaint == "cough for 3 days"
    assert slots.pain_severity == 4
    assert slots.known_allergies == ["penicillin"]


@pytest.mark.asyncio
async def test_extract_slots_handles_malformed_json_as_empty():
    llm = FakeLLM("not json at all")
    agent = PreVisitIntakeAgent(llm=llm, registry=ToolRegistry([]), turns=AgentTurnRepository())
    slots = await agent.extract_slots([{"role": "user", "content": "hello"}])
    assert isinstance(slots, PreVisitSlots)
    assert slots.chief_complaint is None
    assert slots.known_allergies == []


@pytest.mark.asyncio
async def test_extract_slots_handles_json_fence_wrapping():
    # Some models wrap JSON in markdown fences despite instructions. Strip them.
    llm = FakeLLM("```json\n" + json.dumps({"chief_complaint": "fever"}) + "\n```")
    agent = PreVisitIntakeAgent(llm=llm, registry=ToolRegistry([]), turns=AgentTurnRepository())
    slots = await agent.extract_slots([{"role": "user", "content": "hi"}])
    assert slots.chief_complaint == "fever"


@pytest.mark.asyncio
async def test_extract_slots_returns_empty_on_validation_error():
    """LLM emits a structurally valid JSON that violates PreVisitSlots constraints
    (e.g. pain_severity out of 0-10). extract_slots must swallow the
    pydantic.ValidationError and return empty slots, not raise."""
    llm = FakeLLM(json.dumps({"pain_severity": 15}))  # violates ge=0, le=10
    agent = PreVisitIntakeAgent(llm=llm, registry=ToolRegistry([]), turns=AgentTurnRepository())
    slots = await agent.extract_slots([{"role": "user", "content": "hi"}])
    assert slots.pain_severity is None
    assert slots.chief_complaint is None


@pytest.mark.asyncio
async def test_extract_slots_handles_non_json_language_fence():
    """Some LLMs emit ```python or ```text fences despite the instructions.
    The regex must strip any language tag, not just 'json'."""
    llm = FakeLLM("```python\n" + json.dumps({"chief_complaint": "flu"}) + "\n```")
    agent = PreVisitIntakeAgent(llm=llm, registry=ToolRegistry([]), turns=AgentTurnRepository())
    slots = await agent.extract_slots([{"role": "user", "content": "hi"}])
    assert slots.chief_complaint == "flu"


@pytest.mark.asyncio
async def test_extract_slots_handles_inline_single_line_fence():
    """LLM emits the JSON on the same line as the opening fence.
    Previously this was broken by the ^```.*$ regex which ate the whole line."""
    payload = json.dumps({"chief_complaint": "fever"})
    llm = FakeLLM(f"```json {payload} ```")
    agent = PreVisitIntakeAgent(llm=llm, registry=ToolRegistry([]), turns=AgentTurnRepository())
    slots = await agent.extract_slots([{"role": "user", "content": "hi"}])
    assert slots.chief_complaint == "fever"


import uuid

from fastapi.testclient import TestClient

from app.main import app


def test_turn_sync_returns_extracted_fields(monkeypatch):
    """turn_sync must call extract_slots and return non-empty fields."""
    vid = uuid.uuid4()
    pid = uuid.uuid4()

    async def fake_step(self, ctx, user_input):
        from app.llm.streaming import message_delta
        yield message_delta("OK.")

    captured_history: list = []
    async def fake_extract(self, history):
        captured_history.append(history)  # store the history arg for assertions
        return PreVisitSlots(chief_complaint="fever", symptom_duration="2 days")

    monkeypatch.setattr("app.agents.pre_visit_agent.PreVisitIntakeAgent.step", fake_step)
    monkeypatch.setattr("app.agents.pre_visit_agent.PreVisitIntakeAgent.extract_slots", fake_extract)

    # Prevent real Postgres writes from the agent-turns persistence layer.
    async def fake_append(self, rec): return 0
    async def fake_load(self, vid, agent_type): return []
    monkeypatch.setattr("app.persistence.agent_turns.AgentTurnRepository.append", fake_append)
    monkeypatch.setattr("app.persistence.agent_turns.AgentTurnRepository.load", fake_load)

    client = TestClient(app)
    r = client.post(
        "/agents/pre-visit/turn-sync",
        json={"visit_id": str(vid), "patient_id": str(pid), "user_input": "I have fever."},
        headers={"X-Service-Token": "change-me"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["fields"]["chief_complaint"] == "fever"
    assert body["fields"]["symptom_duration"] == "2 days"

    # Verify extract_slots was called once with history that ends with the
    # current user input (load() was monkeypatched to return [], so the only
    # contribution should be the fallback append of the current turn).
    assert len(captured_history) == 1
    hist = captured_history[0]
    assert hist[-2] == {"role": "user", "content": "I have fever."}
    assert hist[-1]["role"] == "assistant"
    assert hist[-1]["content"]  # non-empty

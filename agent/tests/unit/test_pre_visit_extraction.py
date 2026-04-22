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

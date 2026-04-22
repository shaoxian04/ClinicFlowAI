import uuid

import httpx
import pytest

from app.main import app
from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository, TurnRecord


@pytest.mark.asyncio(loop_scope="module")
async def test_get_chat_returns_user_and_assistant_turns_only(wired_pool):
    visit_id = uuid.uuid4()
    repo = AgentTurnRepository()

    # Insert a visit row first (visits FK).
    pool = postgres.get_pool()
    async with pool.acquire() as c:
        await c.execute("INSERT INTO visits(id) VALUES ($1)", visit_id)

    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=0,
        role="system", content="sys", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))
    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=1,
        role="user", content="doctor typed edit", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))
    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=2,
        role="tool", content="{}", reasoning=None,
        tool_call_name="get_patient_context", tool_call_args={}, tool_result={},
    ))
    await repo.append(TurnRecord(
        visit_id=visit_id, agent_type="report", turn_index=3,
        role="assistant", content="updated follow-up", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None,
    ))

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            f"/agents/report/chat?visit_id={visit_id}&agent_type=report",
            headers={"X-Service-Token": "change-me"},
        )
    assert resp.status_code == 200
    body = resp.json()
    roles = [t["role"] for t in body["turns"]]
    assert roles == ["user", "assistant"]  # system + tool filtered out
    assert body["turns"][0]["content"] == "doctor typed edit"
    assert body["turns"][1]["content"] == "updated follow-up"
    assert "turn_index" in body["turns"][0]
    assert "created_at" in body["turns"][0]


@pytest.mark.asyncio(loop_scope="module")
async def test_get_chat_unknown_visit_returns_empty_turns(wired_pool):
    """Reading chat for a visit_id that has no agent_turns rows returns HTTP 200
    with an empty turns list — a read-only projection, not a lookup that 404s."""
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            f"/agents/report/chat?visit_id={uuid.uuid4()}&agent_type=report",
            headers={"X-Service-Token": "change-me"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"turns": []}


@pytest.mark.asyncio(loop_scope="module")
async def test_get_chat_empty_roles_returns_400(wired_pool):
    """Passing roles= (empty) should be a 400, not silent no-op.
    Prevents a common misconfig footgun for backend callers."""
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=True)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            f"/agents/report/chat?visit_id={uuid.uuid4()}&agent_type=report&roles=",
            headers={"X-Service-Token": "change-me"},
        )
    assert resp.status_code == 400
    assert "roles" in resp.json()["detail"].lower()

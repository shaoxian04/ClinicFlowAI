from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.persistence.postgres import get_pool


@dataclass
class TurnRecord:
    visit_id: UUID
    agent_type: str
    turn_index: int
    role: str
    content: str
    reasoning: str | None
    tool_call_name: str | None
    tool_call_args: dict[str, Any] | None
    tool_result: dict[str, Any] | None


class AgentTurnRepository:
    async def append(self, rec: TurnRecord) -> None:
        pool = get_pool()
        await pool.execute(
            """
            INSERT INTO agent_turns
              (visit_id, agent_type, turn_index, role, content, reasoning,
               tool_call_name, tool_call_args, tool_result)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
            """,
            rec.visit_id,
            rec.agent_type,
            rec.turn_index,
            rec.role,
            rec.content,
            rec.reasoning,
            rec.tool_call_name,
            json.dumps(rec.tool_call_args) if rec.tool_call_args is not None else None,
            json.dumps(rec.tool_result) if rec.tool_result is not None else None,
        )

    async def load(self, visit_id: UUID, agent_type: str) -> list[TurnRecord]:
        pool = get_pool()
        rows = await pool.fetch(
            """
            SELECT visit_id, agent_type, turn_index, role, content, reasoning,
                   tool_call_name, tool_call_args, tool_result
            FROM agent_turns
            WHERE visit_id = $1 AND agent_type = $2
            ORDER BY turn_index ASC
            """,
            visit_id,
            agent_type,
        )
        return [
            TurnRecord(
                visit_id=r["visit_id"],
                agent_type=r["agent_type"],
                turn_index=r["turn_index"],
                role=r["role"],
                content=r["content"],
                reasoning=r["reasoning"],
                tool_call_name=r["tool_call_name"],
                tool_call_args=json.loads(r["tool_call_args"]) if r["tool_call_args"] else None,
                tool_result=json.loads(r["tool_result"]) if r["tool_result"] else None,
            )
            for r in rows
        ]

    async def next_turn_index(self, visit_id: UUID, agent_type: str) -> int:
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT COALESCE(MAX(turn_index) + 1, 0) AS next FROM agent_turns "
            "WHERE visit_id = $1 AND agent_type = $2",
            visit_id,
            agent_type,
        )
        return int(row["next"])

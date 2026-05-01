"""Postgres repository for evaluator_findings.

Write paths used by the agent:
  - insert_findings(visit_id, findings)
  - supersede_active(visit_id)
"""
from __future__ import annotations

import json
from uuid import UUID

from app.persistence.postgres import get_pool
from app.schemas.evaluator import Finding


async def insert_findings(visit_id: UUID, findings: list[Finding]) -> None:
    if not findings:
        return
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for f in findings:
                await conn.execute(
                    """
                    INSERT INTO evaluator_findings
                      (visit_id, category, severity, field_path, message, details)
                    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                    """,
                    visit_id, f.category, f.severity, f.field_path, f.message,
                    json.dumps(f.details, ensure_ascii=False),
                )


async def supersede_active(visit_id: UUID) -> None:
    pool = get_pool()
    await pool.execute(
        """
        UPDATE evaluator_findings
        SET superseded_at = now()
        WHERE visit_id = $1 AND superseded_at IS NULL
        """,
        visit_id,
    )


async def list_active_findings(visit_id: UUID) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT id, visit_id, category, severity, field_path, message, details,
               acknowledged_at, acknowledged_by, acknowledgement_reason, superseded_at,
               gmt_create
        FROM evaluator_findings
        WHERE visit_id = $1 AND superseded_at IS NULL
        ORDER BY
          CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1
                        WHEN 'MEDIUM' THEN 2 ELSE 3 END,
          gmt_create
        """,
        visit_id,
    )
    return [dict(r) for r in rows]


async def has_unacked_critical(visit_id: UUID) -> bool:
    pool = get_pool()
    n = await pool.fetchval(
        """
        SELECT COUNT(*) FROM evaluator_findings
        WHERE visit_id = $1 AND severity = 'CRITICAL'
          AND acknowledged_at IS NULL AND superseded_at IS NULL
        """,
        visit_id,
    )
    return (n or 0) > 0

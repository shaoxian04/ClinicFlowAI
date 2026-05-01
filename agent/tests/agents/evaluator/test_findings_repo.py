import os
import pytest
from uuid import uuid4
from app.schemas.evaluator import Finding
from app.persistence.evaluator_findings import (
    insert_findings,
    list_active_findings,
    supersede_active,
)

pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL") and not os.getenv("POSTGRES_DSN"),
    reason="requires a real Postgres (set DATABASE_URL or POSTGRES_DSN)",
)


async def _seed_visit(pool):
    user_id = uuid4()
    patient_id = uuid4()
    visit_id = uuid4()
    await pool.execute(
        "INSERT INTO users (id, email, password_hash, role, full_name) "
        "VALUES ($1, $2, 'x', 'DOCTOR', 'T')",
        user_id, f"u-{user_id}@t",
    )
    await pool.execute(
        "INSERT INTO patients (id, full_name) VALUES ($1, 'T')",
        patient_id,
    )
    await pool.execute(
        "INSERT INTO visits (id, patient_id, doctor_id, status) "
        "VALUES ($1, $2, $3, 'IN_PROGRESS')",
        visit_id, patient_id, user_id,
    )
    return visit_id, patient_id, user_id


async def _cleanup(pool, visit_id, patient_id, user_id):
    await pool.execute("DELETE FROM evaluator_findings WHERE visit_id=$1", visit_id)
    await pool.execute("DELETE FROM visits WHERE id=$1", visit_id)
    await pool.execute("DELETE FROM patients WHERE id=$1", patient_id)
    await pool.execute("DELETE FROM users WHERE id=$1", user_id)


@pytest.mark.asyncio
async def test_insert_and_list_round_trip(pg_pool):
    visit_id, patient_id, user_id = await _seed_visit(pg_pool)
    f = Finding(category="DDI", severity="CRITICAL", field_path="plan.medications[0]", message="warfarin+aspirin")
    await insert_findings(visit_id, [f])
    rows = await list_active_findings(visit_id)
    assert len(rows) == 1
    assert rows[0]["category"] == "DDI"
    assert rows[0]["severity"] == "CRITICAL"
    assert rows[0]["acknowledged_at"] is None
    assert rows[0]["superseded_at"] is None
    await _cleanup(pg_pool, visit_id, patient_id, user_id)


@pytest.mark.asyncio
async def test_supersede_then_insert_replaces_active_set(pg_pool):
    visit_id, patient_id, user_id = await _seed_visit(pg_pool)
    f1 = Finding(category="DDI", severity="HIGH", message="x")
    await insert_findings(visit_id, [f1])
    assert len(await list_active_findings(visit_id)) == 1

    await supersede_active(visit_id)
    f2 = Finding(category="DDI", severity="LOW", message="y")
    await insert_findings(visit_id, [f2])

    active = await list_active_findings(visit_id)
    assert len(active) == 1
    assert active[0]["severity"] == "LOW"
    await _cleanup(pg_pool, visit_id, patient_id, user_id)

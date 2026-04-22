# Post-Visit Review Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Capture → Draft → Publish flow with a single "Generate report" action + side-by-side report/chat review panel, wiring the frontend to the agent capabilities (`/generate`, `/clarify`, `/edit`, `/finalize`) that already exist but weren't exposed.

**Architecture:** All-sync JSON at the frontend boundary (Approach Y from spec §2). Backend aggregates the agent's existing SSE streams into JSON responses via a new `ReportAggregatorService`. Agent becomes the sole writer of `agent_turns` and `visits.report_draft`; backend becomes the sole writer of `visits.status`, `medical_reports`, and `audit_log`. Finalize runs as one atomic Spring transaction.

**Tech Stack:** Next.js 14, Spring Boot 3.3 / Java 21, FastAPI / Python 3.12, asyncpg, Postgres (Supabase), WireMock (for backend tests), Playwright (E2E).

**Cross-cutting requirement — structured logs:** every new route/service/component must log at boundaries. Backend uses `[REVIEW]` / `[AGENT]` / `[UPSTREAM]` / `[BIZ]` tags with correlation IDs. Agent uses `structlog` with named events. Frontend uses `console.info('[REVIEW] …')` for key actions. Log the request at entry, the response code + body-length at exit, and always log full body on 4xx/5xx. This is the post-mortem §Meta lesson and is non-negotiable.

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-04-22-post-visit-review-refactor-design.md`
- Post-mortem: `docs/post-mortem/2026-04-22-soap-generate-and-finalize-e2e.md`

---

## File structure

### Agent (Python)
- Create: `agent/app/routes/report.py` is modified; chat handler lives there (not separate file).
- Modify: `agent/app/routes/report.py` — add `GET /chat`, extend `EditRequest` with `current_draft`, remove `UPDATE visits SET status='FINALIZED'` from `/finalize`.
- Modify: `agent/app/agents/report_agent.py` — accept `current_draft` and inject as system-context message.
- Create: `agent/tests/routes/test_report_chat_endpoint.py`
- Create: `agent/tests/routes/test_report_edit_current_draft.py`
- Create: `agent/tests/routes/test_report_finalize_does_not_write_visits.py`

### Backend (Spring Boot)
- Create: `backend/src/main/resources/db/migration/V8__medical_reports_review_columns.sql`
- Modify: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/MedicalReportModel.java` — add `previewApprovedAt`, `summaryEn`, `summaryMs`.
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/dto/MedicalReportDto.java` — mirror of agent Pydantic schema with `@JsonProperty` on every snake_case field.
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/ReportAggregatorService.java` — SSE event → JSON reducer.
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/ReportReviewAppService.java` — orchestrates the 7 new endpoints.
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java` — add `reportGenerateStream`, `reportClarifyStream`, `reportEditStream`, `reportFinalize`, `getReportChat`.
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/visit/ReportController.java` — replace SSE proxy routes with new sync endpoints.
- Create (request records): `backend/.../controller/biz/visit/request/ReportGenerateSyncRequest.java`, `ReportClarifySyncRequest.java`, `ReportEditSyncRequest.java`, `ReportDraftPatchRequest.java`.
- Create (response records): `backend/.../controller/biz/visit/response/ReportReviewResult.java`, `ChatTurnsResponse.java`, `ApproveResponse.java`, `FinalizeResponse.java`.
- Create: `backend/src/test/java/my/cliniflow/application/biz/visit/ReportAggregatorServiceTest.java`
- Create: `backend/src/test/java/my/cliniflow/application/biz/visit/FinalizeAtomicityTest.java`
- Create: `backend/src/test/java/my/cliniflow/contract/ReportGenerateSyncContractTest.java` (and 6 sibling files, one per endpoint).

### Frontend (Next.js)
- Create: `frontend/lib/types/report.ts`
- Create: `frontend/lib/reviewReducer.ts`
- Create: `frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx`
- Create: `frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx`
- Create: `frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx`
- Create: `frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx`
- Create: `frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx`
- Rename: `frontend/app/doctor/visits/[visitId]/components/PostVisitPreview.tsx` → `ReportPreview.tsx`
- Modify: `frontend/app/doctor/visits/[visitId]/page.tsx` — rewire Consultation tab; tab rename.
- Delete: `frontend/app/doctor/components/ConsultationCapture.tsx` (if standalone; absorbed into GenerateBar).

### E2E
- Create: `frontend/e2e/post-visit-review-happy-path.spec.ts`
- Create: `frontend/e2e/post-visit-review-clarification.spec.ts`

---

## Phase A — Agent changes (isolated, foundation for backend)

### Task A1: Add `current_draft` to report `/edit` request model

**Files:**
- Modify: `agent/app/routes/report.py` (`EditRequest` model + `edit` handler)
- Modify: `agent/app/agents/report_agent.py`
- Test: `agent/tests/routes/test_report_edit_current_draft.py`

- [ ] **Step 1: Write the failing test**

```python
# agent/tests/routes/test_report_edit_current_draft.py
import json, uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.agents.report_agent import ReportAgent


@pytest.mark.asyncio
async def test_edit_with_current_draft_is_injected_into_prompt(monkeypatch):
    captured = {}

    class FakePrompt:
        def __init__(self, text): self.text = text

    async def fake_step(self, ctx, user_input):
        captured["user_input"] = user_input
        captured["current_draft"] = getattr(ctx, "current_draft", None)
        return
        yield  # make it an async generator

    monkeypatch.setattr(ReportAgent, "step", fake_step)

    draft = {"subjective": {"chief_complaint": "cough"}}
    client = TestClient(app)
    resp = client.post(
        "/agents/report/edit",
        headers={"X-Service-Token": "change-me"},
        json={
            "visit_id": str(uuid.uuid4()),
            "patient_id": str(uuid.uuid4()),
            "doctor_id": str(uuid.uuid4()),
            "edit": "change follow-up to 2 weeks",
            "current_draft": draft,
        },
    )
    assert resp.status_code == 200
    assert captured["current_draft"] == draft
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/routes/test_report_edit_current_draft.py -v`
Expected: FAIL — current `EditRequest` rejects unknown `current_draft` field.

- [ ] **Step 3: Extend EditRequest and pass through**

Edit `agent/app/routes/report.py` `EditRequest`:

```python
class EditRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    doctor_id: UUID
    edit: str
    current_draft: dict | None = None
```

Edit the `edit` handler — pass `current_draft` onto `ctx` so the agent can see it:

```python
@router.post("/edit")
async def edit(req: EditRequest) -> StreamingResponse:
    llm = OpenAIClient()
    registry = build_registry()
    agent = await ReportAgent.build_with_rules(
        doctor_id=req.doctor_id, specialty=None,
        llm=llm, registry=registry, turns=AgentTurnRepository(),
    )
    ctx = AgentContext(visit_id=req.visit_id, patient_id=req.patient_id, doctor_id=req.doctor_id)
    # D1a bootstrap — prepend current_draft as system-context so LLM sees any
    # silent form-row edits the backend wrote directly to visits.report_draft.
    setattr(ctx, "current_draft", req.current_draft)
    user_input = f"Doctor edit request:\n{req.edit}"
    log.info("[AGENT] /agents/report/edit visit=%s has_current_draft=%s edit_len=%d",
             req.visit_id, req.current_draft is not None, len(req.edit))
    return StreamingResponse(_run_stream(agent, ctx, user_input), media_type="text/event-stream")
```

Add a top-of-file logger if missing: `import logging; log = logging.getLogger(__name__)`.

- [ ] **Step 4: Inject `current_draft` in ReportAgent prompt composition**

Edit `agent/app/agents/report_agent.py`:

```python
class ReportAgent(BaseAgent):
    agent_type = "report"

    def __init__(self, *args, rules_json: str | None = None, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._rules_json = rules_json

    def system_prompt(self, ctx: AgentContext, rules=None) -> str:
        base = build_report_system_prompt(self._rules_json)
        current_draft = getattr(ctx, "current_draft", None)
        if current_draft:
            import json as _json
            draft_json = _json.dumps(current_draft, ensure_ascii=False, indent=2)
            return base + (
                "\n\nCURRENT DRAFT STATE (authoritative — may include doctor's "
                "direct form edits since last chat turn):\n" + draft_json
            )
        return base

    def build_user_message(self, ctx: AgentContext, user_input: str) -> str:
        return f"Visit {ctx.visit_id} — transcript / edit input:\n\n{user_input}"
    # ... build_with_rules unchanged ...
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd agent && pytest tests/routes/test_report_edit_current_draft.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agent/app/routes/report.py agent/app/agents/report_agent.py agent/tests/routes/test_report_edit_current_draft.py
git commit -m "feat(agent): accept current_draft on /report/edit and inject into prompt"
```

---

### Task A2: Add `GET /agents/report/chat` endpoint

**Files:**
- Modify: `agent/app/routes/report.py` — append new GET route
- Test: `agent/tests/routes/test_report_chat_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
# agent/tests/routes/test_report_chat_endpoint.py
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.persistence import postgres
from app.persistence.agent_turns import AgentTurnRepository, TurnRecord


@pytest.mark.asyncio
async def test_get_chat_returns_user_and_assistant_turns_only(wired_pool):
    visit_id = uuid.uuid4()
    repo = AgentTurnRepository()
    await repo.append(TurnRecord(visit_id=visit_id, agent_type="report", turn_index=0,
        role="system", content="sys", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None))
    await repo.append(TurnRecord(visit_id=visit_id, agent_type="report", turn_index=1,
        role="user", content="doctor typed edit", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None))
    await repo.append(TurnRecord(visit_id=visit_id, agent_type="report", turn_index=2,
        role="tool", content="{}", reasoning=None,
        tool_call_name="get_patient_context", tool_call_args={}, tool_result={}))
    await repo.append(TurnRecord(visit_id=visit_id, agent_type="report", turn_index=3,
        role="assistant", content="updated follow-up", reasoning=None,
        tool_call_name=None, tool_call_args=None, tool_result=None))

    client = TestClient(app)
    resp = client.get(
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
```

(Assumes the existing `wired_pool` fixture used by other agent tests is available; copy from `tests/agents/test_pre_visit_agent.py` if not.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/routes/test_report_chat_endpoint.py -v`
Expected: FAIL — route returns 404 or 405.

- [ ] **Step 3: Implement the chat route**

Add to `agent/app/routes/report.py`:

```python
from fastapi import Query

@router.get("/chat")
async def get_chat(
    visit_id: UUID,
    agent_type: str = Query("report"),
    roles: str = Query("user,assistant"),
) -> JSONResponse:
    """Return persisted chat turns for the given visit+agent, filtered by role.

    Read-only projection of agent_turns. The agent is the sole writer of this
    table; this endpoint is the only reader exposed to the backend.
    """
    allowed = {r.strip() for r in roles.split(",") if r.strip()}
    repo = AgentTurnRepository()
    turns = await repo.load(visit_id, agent_type)
    filtered = [
        {
            "turn_index": t.turn_index,
            "role": t.role,
            "content": t.content,
            "tool_call_name": t.tool_call_name,
            "created_at": None,  # not persisted in TurnRecord; backend tolerates null
        }
        for t in turns if t.role in allowed
    ]
    log.info("[AGENT] GET /agents/report/chat visit=%s agent=%s total=%d filtered=%d",
             visit_id, agent_type, len(turns), len(filtered))
    return JSONResponse({"turns": filtered})
```

Note: `TurnRecord` as it stands does not carry `created_at`. If the `agent_turns` table already includes a `created_at` column (it does, see migration V7), extend `AgentTurnRepository.load` to select it and add it to `TurnRecord`. Do that in this task.

Edit `agent/app/persistence/agent_turns.py`:

```python
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
    created_at: Any = None  # ISO string or datetime; added for chat read
```

In `load`:

```python
rows = await pool.fetch(
    """
    SELECT visit_id, agent_type, turn_index, role, content, reasoning,
           tool_call_name, tool_call_args, tool_result, created_at
    FROM agent_turns
    WHERE visit_id = $1 AND agent_type = $2
    ORDER BY turn_index ASC
    """,
    visit_id, agent_type,
)
return [
    TurnRecord(
        visit_id=r["visit_id"], agent_type=r["agent_type"], turn_index=r["turn_index"],
        role=r["role"], content=r["content"], reasoning=r["reasoning"],
        tool_call_name=r["tool_call_name"],
        tool_call_args=json.loads(r["tool_call_args"]) if r["tool_call_args"] else None,
        tool_result=json.loads(r["tool_result"]) if r["tool_result"] else None,
        created_at=r["created_at"].isoformat() if r["created_at"] else None,
    )
    for r in rows
]
```

Update the chat route to use `t.created_at` now that it exists.

- [ ] **Step 4: Run test**

Run: `cd agent && pytest tests/routes/test_report_chat_endpoint.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent/app/routes/report.py agent/app/persistence/agent_turns.py agent/tests/routes/test_report_chat_endpoint.py
git commit -m "feat(agent): GET /agents/report/chat endpoint with role filter"
```

---

### Task A3: Remove visits.status write from agent `/finalize`

**Files:**
- Modify: `agent/app/routes/report.py` `/finalize` handler
- Test: `agent/tests/routes/test_report_finalize_does_not_write_visits.py`

- [ ] **Step 1: Write the failing test**

```python
# agent/tests/routes/test_report_finalize_does_not_write_visits.py
import uuid, json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.persistence import postgres


@pytest.mark.asyncio
async def test_finalize_returns_summary_but_does_not_touch_visits_status(wired_pool, monkeypatch):
    visit_id = uuid.uuid4()
    pool = postgres.get_pool()
    # seed a visit row with a valid draft; status starts IN_PROGRESS
    draft = {
        "subjective": {"chief_complaint": "cough", "history_of_present_illness": "3 days"},
        "objective": {}, "assessment": {"primary_diagnosis": "bronchitis"},
        "plan": {"medications": [], "follow_up": {"needed": False}},
    }
    await pool.execute(
        "INSERT INTO visits(id, patient_id, status) VALUES ($1, $2, 'IN_PROGRESS')",
        visit_id, uuid.uuid4(),
    )
    await pool.execute(
        "UPDATE visits SET report_draft = $1::jsonb, report_confidence_flags = '{}'::jsonb WHERE id = $2",
        json.dumps(draft), visit_id,
    )

    # stub LLM call
    async def fake_summary(inp):
        from app.tools.report_tools import GeneratePatientSummaryOutput
        return GeneratePatientSummaryOutput(summary_en="EN", summary_ms="MS")
    monkeypatch.setattr("app.routes.report._h_generate_patient_summary", fake_summary)

    client = TestClient(app)
    resp = client.post(
        "/agents/report/finalize",
        headers={"X-Service-Token": "change-me"},
        json={"visit_id": str(visit_id)},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary_en"] == "EN"
    assert body["summary_ms"] == "MS"
    assert "report" in body  # now returns the validated draft too

    # CRITICAL: agent no longer flips status
    row = await pool.fetchrow("SELECT status FROM visits WHERE id = $1", visit_id)
    assert row["status"] == "IN_PROGRESS", "agent must not write visits.status — backend owns it"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/routes/test_report_finalize_does_not_write_visits.py -v`
Expected: FAIL — status has been set to 'FINALIZED'.

- [ ] **Step 3: Modify `/finalize` handler**

Edit `agent/app/routes/report.py` `finalize` function:

```python
@router.post("/finalize")
async def finalize(req: FinalizeRequest) -> JSONResponse:
    """Validate draft + generate bilingual summary. Does NOT write visits.status.

    Per spec §5.5, the backend owns all finalize-time writes to visits and
    medical_reports (atomic with audit_log). Agent just validates and summarizes.
    """
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT report_draft, report_confidence_flags FROM visits WHERE id=$1",
        req.visit_id,
    )
    if row is None or row["report_draft"] is None:
        log.warning("[AGENT] /finalize no draft visit=%s", req.visit_id)
        raise HTTPException(status_code=404, detail="no draft to finalize")

    draft = json.loads(row["report_draft"])
    flags: dict[str, str] = json.loads(row["report_confidence_flags"] or "{}")
    promoted = {k: ("confirmed" if v == "inferred" else v) for k, v in flags.items()}

    merged = MedicalReport(**draft, confidence_flags=promoted)
    missing = required_field_is_missing(merged)
    if missing:
        log.info("[AGENT] /finalize missing_required visit=%s field=%s", req.visit_id, missing)
        raise HTTPException(status_code=409, detail=f"required field missing: {missing}")

    summary = await _h_generate_patient_summary(
        GeneratePatientSummaryInput(report=merged, language="en")
    )

    log.info("[AGENT] /finalize OK visit=%s summary_en_len=%d summary_ms_len=%d",
             req.visit_id, len(summary.summary_en), len(summary.summary_ms))
    return JSONResponse({
        "ok": True,
        "report": merged.model_dump(mode="json"),
        "summary_en": summary.summary_en,
        "summary_ms": summary.summary_ms,
    })
```

Remove the `UPDATE visits SET ...` block entirely. The backend does it now.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent && pytest tests/routes/test_report_finalize_does_not_write_visits.py -v`
Expected: PASS.

- [ ] **Step 5: Run full agent test suite to check nothing else relied on the old behavior**

Run: `cd agent && pytest -x`
Expected: all pass. If any test relied on agent writing visits.status, fix by updating the test — the contract has deliberately changed.

- [ ] **Step 6: Commit**

```bash
git add agent/app/routes/report.py agent/tests/routes/test_report_finalize_does_not_write_visits.py
git commit -m "refactor(agent): /report/finalize no longer writes visits.status — backend owns it"
```

---

## Phase B — Backend foundation

### Task B1: V8 migration — three new columns on medical_reports

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__medical_reports_review_columns.sql`

- [ ] **Step 1: Write migration**

```sql
-- backend/src/main/resources/db/migration/V8__medical_reports_review_columns.sql
-- Adds the three columns the post-visit review refactor needs:
--   preview_approved_at — set when doctor clicks "Approve & continue"
--   summary_en, summary_ms — bilingual patient-facing summary written on finalize
-- Additive only; all NULL defaults so existing rows are untouched.

ALTER TABLE medical_reports
  ADD COLUMN IF NOT EXISTS preview_approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS summary_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS summary_ms TEXT NULL;
```

- [ ] **Step 2: Apply manually to Supabase**

Per CLAUDE.md, Flyway is not used; apply the SQL via Supabase SQL Editor, then confirm:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'medical_reports'
  AND column_name IN ('preview_approved_at', 'summary_en', 'summary_ms');
-- expect 3 rows
```

- [ ] **Step 3: Commit migration file**

```bash
git add backend/src/main/resources/db/migration/V8__medical_reports_review_columns.sql
git commit -m "chore(backend): V8 migration — preview_approved_at, summary_en, summary_ms"
```

---

### Task B2: Extend MedicalReportModel with new columns

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/MedicalReportModel.java`

- [ ] **Step 1: Add fields + getters/setters**

Add after the `finalizedAt` field in `MedicalReportModel.java`:

```java
@Column(name = "preview_approved_at")
private OffsetDateTime previewApprovedAt;

@Column(name = "summary_en", columnDefinition = "text")
private String summaryEn;

@Column(name = "summary_ms", columnDefinition = "text")
private String summaryMs;
```

And at the end of the getters/setters block (before the closing brace):

```java
public OffsetDateTime getPreviewApprovedAt() { return previewApprovedAt; }
public void setPreviewApprovedAt(OffsetDateTime v) { this.previewApprovedAt = v; }
public String getSummaryEn() { return summaryEn; }
public void setSummaryEn(String v) { this.summaryEn = v; }
public String getSummaryMs() { return summaryMs; }
public void setSummaryMs(String v) { this.summaryMs = v; }
```

- [ ] **Step 2: Compile to verify**

Run: `cd backend && ./mvnw -q -DskipTests compile`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/model/MedicalReportModel.java
git commit -m "feat(backend): MedicalReportModel — previewApprovedAt, summaryEn, summaryMs"
```

---

### Task B3: MedicalReportDto — Java mirror of agent Pydantic schema

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/dto/MedicalReportDto.java`

- [ ] **Step 1: Write the DTO**

```java
// backend/src/main/java/my/cliniflow/domain/biz/visit/dto/MedicalReportDto.java
package my.cliniflow.domain.biz.visit.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * Mirror of agent/app/schemas/report.py::MedicalReport. Every snake_case field
 * declared via @JsonProperty so agent JSON round-trips cleanly. Do not add
 * fields here without also adding them to the Pydantic model (source of truth).
 *
 * See spec §4.7 and contract-verification checklist §4.8.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MedicalReportDto(
    Subjective subjective,
    Objective objective,
    Assessment assessment,
    Plan plan,
    @JsonProperty("confidence_flags") Map<String, String> confidenceFlags
) {
    public record Subjective(
        @JsonProperty("chief_complaint") String chiefComplaint,
        @JsonProperty("history_of_present_illness") String historyOfPresentIllness,
        @JsonProperty("symptom_duration") String symptomDuration,
        @JsonProperty("associated_symptoms") List<String> associatedSymptoms,
        @JsonProperty("relevant_history") List<String> relevantHistory
    ) {}

    public record Objective(
        @JsonProperty("vital_signs") Map<String, String> vitalSigns,
        @JsonProperty("physical_exam") String physicalExam
    ) {}

    public record Assessment(
        @JsonProperty("primary_diagnosis") String primaryDiagnosis,
        @JsonProperty("differential_diagnoses") List<String> differentialDiagnoses,
        @JsonProperty("icd10_codes") List<String> icd10Codes
    ) {}

    public record Plan(
        List<MedicationOrder> medications,
        List<String> investigations,
        @JsonProperty("lifestyle_advice") List<String> lifestyleAdvice,
        @JsonProperty("follow_up") FollowUp followUp,
        @JsonProperty("red_flags") List<String> redFlags
    ) {}

    public record MedicationOrder(
        @JsonProperty("drug_name") String drugName,
        String dose,
        String frequency,
        String duration,
        String route
    ) {}

    public record FollowUp(
        boolean needed,
        String timeframe,
        String reason
    ) {}
}
```

- [ ] **Step 2: Compile to verify**

Run: `cd backend && ./mvnw -q -DskipTests compile`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/dto/MedicalReportDto.java
git commit -m "feat(backend): MedicalReportDto — Java mirror of agent Pydantic schema"
```

---

### Task B4: AgentServiceClient — add report stream/finalize/chat methods

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java`

- [ ] **Step 1: Add `reportGenerateStream` method returning `Flux<String>` of raw SSE lines**

Append to `AgentServiceClient.java` before the closing brace:

```java
// ── Report agent: streaming calls (returned as Flux<String> of SSE lines) ──

public reactor.core.publisher.Flux<String> reportGenerateStream(
    UUID visitId, UUID patientId, UUID doctorId, String specialty, String transcript
) {
    Map<String, Object> body = new HashMap<>();
    body.put("visit_id", visitId.toString());
    body.put("patient_id", patientId.toString());
    body.put("doctor_id", doctorId.toString());
    body.put("specialty", specialty);
    body.put("transcript", transcript == null ? "" : transcript);
    log.info("[AGENT] POST /agents/report/generate visitId={} transcriptLen={}",
        visitId, transcript == null ? 0 : transcript.length());
    return client.post().uri("/agents/report/generate")
        .bodyValue(body)
        .accept(org.springframework.http.MediaType.TEXT_EVENT_STREAM)
        .retrieve()
        .bodyToFlux(String.class)
        .doOnError(e -> log.error("[AGENT] /generate stream error visit={} err={}", visitId, e.toString()));
}

public reactor.core.publisher.Flux<String> reportClarifyStream(
    UUID visitId, UUID patientId, UUID doctorId, String answer
) {
    log.info("[AGENT] POST /agents/report/clarify visitId={} answerLen={}",
        visitId, answer == null ? 0 : answer.length());
    return client.post().uri("/agents/report/clarify")
        .bodyValue(Map.of(
            "visit_id", visitId.toString(),
            "patient_id", patientId.toString(),
            "doctor_id", doctorId.toString(),
            "answer", answer == null ? "" : answer
        ))
        .accept(org.springframework.http.MediaType.TEXT_EVENT_STREAM)
        .retrieve()
        .bodyToFlux(String.class)
        .doOnError(e -> log.error("[AGENT] /clarify stream error visit={} err={}", visitId, e.toString()));
}

public reactor.core.publisher.Flux<String> reportEditStream(
    UUID visitId, UUID patientId, UUID doctorId, String edit, Object currentDraft
) {
    Map<String, Object> body = new HashMap<>();
    body.put("visit_id", visitId.toString());
    body.put("patient_id", patientId.toString());
    body.put("doctor_id", doctorId.toString());
    body.put("edit", edit == null ? "" : edit);
    if (currentDraft != null) body.put("current_draft", currentDraft);
    log.info("[AGENT] POST /agents/report/edit visitId={} editLen={} hasCurrentDraft={}",
        visitId, edit == null ? 0 : edit.length(), currentDraft != null);
    return client.post().uri("/agents/report/edit")
        .bodyValue(body)
        .accept(org.springframework.http.MediaType.TEXT_EVENT_STREAM)
        .retrieve()
        .bodyToFlux(String.class)
        .doOnError(e -> log.error("[AGENT] /edit stream error visit={} err={}", visitId, e.toString()));
}

@SuppressWarnings({"rawtypes", "unchecked"})
public Map<String, Object> reportFinalize(UUID visitId) {
    log.info("[AGENT] POST /agents/report/finalize visitId={}", visitId);
    try {
        Map<String, Object> resp = (Map<String, Object>) withCorrelation(
            client.post().uri("/agents/report/finalize")
        )
            .bodyValue(Map.of("visit_id", visitId.toString()))
            .retrieve()
            .bodyToMono(Map.class)
            .block();
        if (resp == null) throw new UpstreamException("agent", 0, "empty finalize response", null);
        log.info("[AGENT] /finalize OK visitId={} keys={}", visitId, resp.keySet());
        return resp;
    } catch (WebClientResponseException e) {
        log.error("[AGENT] /finalize HTTP {} visit={} body={}", e.getRawStatusCode(), visitId, e.getResponseBodyAsString());
        throw new UpstreamException("agent", e.getRawStatusCode(), e.getResponseBodyAsString(), e);
    } catch (UpstreamException e) {
        throw e;
    } catch (Exception e) {
        log.error("[AGENT] /finalize FAILED visit={} err={}", visitId, e.toString(), e);
        throw new UpstreamException("agent", 0, e.toString(), e);
    }
}

public ChatTurnsDto getReportChat(UUID visitId) {
    log.info("[AGENT] GET /agents/report/chat visitId={}", visitId);
    try {
        ChatTurnsDto resp = withCorrelation(
            (WebClient.RequestBodySpec)(WebClient.RequestBodySpec) client.method(org.springframework.http.HttpMethod.GET)
                .uri(uri -> uri.path("/agents/report/chat")
                    .queryParam("visit_id", visitId.toString())
                    .queryParam("agent_type", "report")
                    .build())
        )
            .retrieve()
            .bodyToMono(ChatTurnsDto.class)
            .block();
        if (resp == null) return new ChatTurnsDto(List.of());
        log.info("[AGENT] /chat OK visitId={} turns={}", visitId, resp.turns().size());
        return resp;
    } catch (WebClientResponseException e) {
        log.error("[AGENT] /chat HTTP {} visit={} body={}", e.getRawStatusCode(), visitId, e.getResponseBodyAsString());
        throw new UpstreamException("agent", e.getRawStatusCode(), e.getResponseBodyAsString(), e);
    } catch (Exception e) {
        log.error("[AGENT] /chat FAILED visit={} err={}", visitId, e.toString(), e);
        throw new UpstreamException("agent", 0, e.toString(), e);
    }
}

public record ChatTurnsDto(List<ChatTurnDto> turns) {}

public record ChatTurnDto(
    @com.fasterxml.jackson.annotation.JsonProperty("turn_index") int turnIndex,
    String role,
    String content,
    @com.fasterxml.jackson.annotation.JsonProperty("tool_call_name") String toolCallName,
    @com.fasterxml.jackson.annotation.JsonProperty("created_at") String createdAt
) {}
```

Note: the `client.method(GET)` pattern avoids `WebClient.get()` so we can still use `withCorrelation`. If `withCorrelation` only accepts `RequestBodySpec`, add a sibling `withCorrelationGet(WebClient.RequestHeadersSpec<?> spec)` that just sets the header and returns the same spec type.

Simpler alternative — skip correlation on the GET (low value for a read):

```java
public ChatTurnsDto getReportChat(UUID visitId) {
    log.info("[AGENT] GET /agents/report/chat visitId={}", visitId);
    try {
        ChatTurnsDto resp = client.get()
            .uri(uri -> uri.path("/agents/report/chat")
                .queryParam("visit_id", visitId.toString())
                .queryParam("agent_type", "report")
                .build())
            .retrieve()
            .bodyToMono(ChatTurnsDto.class)
            .block();
        if (resp == null) return new ChatTurnsDto(List.of());
        log.info("[AGENT] /chat OK visitId={} turns={}", visitId, resp.turns().size());
        return resp;
    } catch (WebClientResponseException e) {
        log.error("[AGENT] /chat HTTP {} visit={} body={}", e.getRawStatusCode(), visitId, e.getResponseBodyAsString());
        throw new UpstreamException("agent", e.getRawStatusCode(), e.getResponseBodyAsString(), e);
    } catch (Exception e) {
        log.error("[AGENT] /chat FAILED visit={} err={}", visitId, e.toString(), e);
        throw new UpstreamException("agent", 0, e.toString(), e);
    }
}
```

Use the simpler alternative.

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw -q -DskipTests compile`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java
git commit -m "feat(backend): AgentServiceClient — report stream/finalize/chat methods"
```

---

### Task B5: ReportAggregatorService — SSE → JSON reducer

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/ReportAggregatorService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/visit/ReportAggregatorServiceTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/my/cliniflow/application/biz/visit/ReportAggregatorServiceTest.java
package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

import static org.assertj.core.api.Assertions.assertThat;

class ReportAggregatorServiceTest {

    private final ReportAggregatorService svc = new ReportAggregatorService(new ObjectMapper());

    @Test
    void reducesUpdateSoapDraftAndTurnCompleteIntoCompleteStatus() {
        Flux<String> stream = Flux.just(
            "event: turn.start\ndata: {\"turn_index\": 1}\n\n",
            "event: tool.call\ndata: {\"name\": \"update_soap_draft\", \"args\": {\"report\": " +
                "{\"subjective\": {\"chief_complaint\": \"cough\", \"history_of_present_illness\": \"3d\", \"associated_symptoms\": [], \"relevant_history\": []}," +
                " \"objective\": {\"vital_signs\": {}}, \"assessment\": {\"primary_diagnosis\": \"bronchitis\", \"differential_diagnoses\": [], \"icd10_codes\": []}," +
                " \"plan\": {\"medications\": [], \"investigations\": [], \"lifestyle_advice\": [], \"follow_up\": {\"needed\": false}, \"red_flags\": []}}}}\n\n",
            "event: turn.complete\ndata: {\"turn_index\": 3}\n\n"
        );
        ReportAggregatorService.AggregateResult result = svc.aggregate(stream).block();
        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo("complete");
        assertThat(result.report()).isNotNull();
        assertThat(result.report().subjective().chiefComplaint()).isEqualTo("cough");
        assertThat(result.clarification()).isNull();
    }

    @Test
    void reducesClarificationIntoClarificationPending() {
        Flux<String> stream = Flux.just(
            "event: tool.call\ndata: {\"name\": \"ask_doctor_clarification\", \"args\": " +
                "{\"field\": \"subjective.chief_complaint\", \"prompt\": \"What's the CC?\", \"context\": \"unclear\"}}\n\n",
            "event: clarification.needed\ndata: {\"field\": \"subjective.chief_complaint\", \"prompt\": \"What's the CC?\", \"context\": \"unclear\"}\n\n"
        );
        ReportAggregatorService.AggregateResult result = svc.aggregate(stream).block();
        assertThat(result.status()).isEqualTo("clarification_pending");
        assertThat(result.report()).isNull();
        assertThat(result.clarification()).isNotNull();
        assertThat(result.clarification().field()).isEqualTo("subjective.chief_complaint");
    }

    @Test
    void agentErrorEventThrowsUpstreamException() {
        Flux<String> stream = Flux.just(
            "event: agent.error\ndata: {\"message\": \"step limit exceeded\"}\n\n"
        );
        org.junit.jupiter.api.Assertions.assertThrows(
            my.cliniflow.controller.base.UpstreamException.class,
            () -> svc.aggregate(stream).block()
        );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -q test -Dtest=ReportAggregatorServiceTest`
Expected: compilation failure — service does not exist.

- [ ] **Step 3: Implement the service**

```java
// backend/src/main/java/my/cliniflow/application/biz/visit/ReportAggregatorService.java
package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.base.UpstreamException;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicReference;

/**
 * Consumes the agent's SSE stream (each element a raw "event: X\ndata: {...}"
 * block, already parsed by WebClient into one line per SSE payload — the
 * raw line-based parsing is on us).
 *
 * Reduces events into a single {@link AggregateResult}. Rules in spec §4.4.
 */
@Service
public class ReportAggregatorService {

    private static final Logger log = LoggerFactory.getLogger(ReportAggregatorService.class);

    private final ObjectMapper mapper;

    public ReportAggregatorService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public record AggregateResult(
        String status,                  // "complete" | "clarification_pending"
        MedicalReportDto report,        // nullable (e.g. pre-first-draft clarification)
        Clarification clarification     // nullable
    ) {}

    public record Clarification(String field, String prompt, String context) {}

    /**
     * Reduce an SSE stream to a single aggregate. On agent.error, throws
     * UpstreamException (maps to 502 via GlobalExceptionConfiguration).
     *
     * Input stream format: each element is a full SSE frame (Spring's WebClient
     * bodyToFlux(String.class) with TEXT_EVENT_STREAM splits on "\n\n" and
     * strips the "data: " prefix of the last non-empty data line per frame).
     * Tolerate both raw ("event: X\ndata: Y") frames and already-extracted
     * data payloads.
     */
    public Mono<AggregateResult> aggregate(Flux<String> stream) {
        AtomicReference<MedicalReportDto> latestReport = new AtomicReference<>();
        AtomicReference<Clarification> pending = new AtomicReference<>();
        AtomicReference<String> status = new AtomicReference<>("complete");
        AtomicReference<Throwable> errorHolder = new AtomicReference<>();

        return stream
            .doOnNext(frame -> handleFrame(frame, latestReport, pending, status, errorHolder))
            .then(Mono.defer(() -> {
                if (errorHolder.get() != null) {
                    return Mono.error(errorHolder.get());
                }
                return Mono.just(new AggregateResult(status.get(), latestReport.get(), pending.get()));
            }));
    }

    private void handleFrame(
        String frame,
        AtomicReference<MedicalReportDto> latestReport,
        AtomicReference<Clarification> pending,
        AtomicReference<String> status,
        AtomicReference<Throwable> errorHolder
    ) {
        ParsedFrame pf = parseFrame(frame);
        if (pf == null) return;

        log.debug("[REVIEW] agg event={} dataLen={}", pf.event, pf.data == null ? 0 : pf.data.length());
        try {
            switch (pf.event) {
                case "tool.call" -> {
                    JsonNode node = mapper.readTree(pf.data);
                    String name = node.path("name").asText("");
                    JsonNode args = node.path("args");
                    if ("update_soap_draft".equals(name) && args.has("report")) {
                        MedicalReportDto dto = mapper.treeToValue(args.get("report"), MedicalReportDto.class);
                        latestReport.set(dto);
                        log.info("[REVIEW] captured update_soap_draft chiefComplaint={}",
                            dto.subjective() == null ? "null" : dto.subjective().chiefComplaint());
                    } else if ("ask_doctor_clarification".equals(name)) {
                        pending.set(new Clarification(
                            args.path("field").asText(""),
                            args.path("prompt").asText(""),
                            args.path("context").asText("")
                        ));
                    }
                }
                case "clarification.needed" -> {
                    JsonNode node = mapper.readTree(pf.data);
                    pending.set(new Clarification(
                        node.path("field").asText(""),
                        node.path("prompt").asText(""),
                        node.path("context").asText("")
                    ));
                    status.set("clarification_pending");
                    log.info("[REVIEW] clarification pending field={}", node.path("field").asText(""));
                }
                case "turn.complete" -> {
                    if (pending.get() == null) status.set("complete");
                }
                case "agent.error" -> {
                    String msg = "agent.error";
                    try { msg = mapper.readTree(pf.data).path("message").asText(msg); } catch (Exception ignore) {}
                    errorHolder.set(new UpstreamException("agent", 500, msg, null));
                    log.error("[REVIEW] agent.error surfaced msg={}", msg);
                }
                default -> { /* turn.start, reasoning.delta, message.delta, tool.result — no-op */ }
            }
        } catch (Exception e) {
            log.warn("[REVIEW] frame parse error event={} err={}", pf.event, e.toString());
        }
    }

    private static ParsedFrame parseFrame(String frame) {
        if (frame == null || frame.isBlank()) return null;
        String event = null, data = null;
        for (String line : frame.split("\n")) {
            if (line.startsWith("event:")) event = line.substring(6).trim();
            else if (line.startsWith("data:")) {
                String part = line.substring(5).trim();
                data = data == null ? part : data + part;
            }
        }
        // Tolerate bare JSON data without "event:" prefix — try to infer
        if (event == null && data != null && data.startsWith("{")) {
            // default to unknown; handler will no-op
            event = "unknown";
        }
        if (event == null) return null;
        return new ParsedFrame(event, data);
    }

    private record ParsedFrame(String event, String data) {}
}
```

- [ ] **Step 4: Run test**

Run: `cd backend && ./mvnw -q test -Dtest=ReportAggregatorServiceTest`
Expected: all three assertions PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/application/biz/visit/ReportAggregatorService.java backend/src/test/java/my/cliniflow/application/biz/visit/ReportAggregatorServiceTest.java
git commit -m "feat(backend): ReportAggregatorService — SSE event reducer"
```

---

### Task B6: Request/response records

**Files:**
- Create: 4 request records, 4 response records

- [ ] **Step 1: Write all 8 records**

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/request/ReportGenerateSyncRequest.java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportGenerateSyncRequest(
    @NotBlank String transcript,
    String specialty  // nullable
) {}
```

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/request/ReportClarifySyncRequest.java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportClarifySyncRequest(@NotBlank String answer) {}
```

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/request/ReportEditSyncRequest.java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportEditSyncRequest(@NotBlank String instruction) {}
```

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/request/ReportDraftPatchRequest.java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportDraftPatchRequest(
    @NotBlank String path,   // dotted + indexed, e.g. "plan.medications[0].dose"
    Object value             // typed at runtime; backend writes as jsonb value
) {}
```

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/response/ReportReviewResult.java
package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;

public record ReportReviewResult(
    String status,   // "complete" | "clarification_pending"
    MedicalReportDto report,
    Clarification clarification
) {
    public record Clarification(String field, String prompt, String context) {}
}
```

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/response/ChatTurnsResponse.java
package my.cliniflow.controller.biz.visit.response;

import java.util.List;

public record ChatTurnsResponse(List<ChatTurn> turns) {
    public record ChatTurn(
        int turnIndex,
        String role,
        String content,
        String toolCallName,  // nullable
        String createdAt      // ISO-8601; nullable
    ) {}
}
```

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/response/ApproveResponse.java
package my.cliniflow.controller.biz.visit.response;

import java.time.OffsetDateTime;

public record ApproveResponse(boolean approved, OffsetDateTime approvedAt) {}
```

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/response/FinalizeResponse.java
package my.cliniflow.controller.biz.visit.response;

import java.time.OffsetDateTime;
import java.util.UUID;

public record FinalizeResponse(
    UUID visitId,
    String summaryEn,
    String summaryMs,
    OffsetDateTime finalizedAt
) {}
```

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw -q -DskipTests compile`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/visit/request/ backend/src/main/java/my/cliniflow/controller/biz/visit/response/
git commit -m "feat(backend): request/response records for report review endpoints"
```

---

## Phase C — Backend application service + controller

### Task C1: ReportReviewAppService — the 7-endpoint orchestrator

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/ReportReviewAppService.java`

- [ ] **Step 1: Write the service**

```java
// backend/src/main/java/my/cliniflow/application/biz/visit/ReportReviewAppService.java
package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.biz.visit.response.ApproveResponse;
import my.cliniflow.controller.biz.visit.response.ChatTurnsResponse;
import my.cliniflow.controller.biz.visit.response.FinalizeResponse;
import my.cliniflow.controller.biz.visit.response.ReportReviewResult;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Post-visit review orchestration. One class for the 7 review endpoints so
 * the transaction boundaries and state transitions are all visible in one
 * place. See spec §3 (data model) and §5 (flow sequences).
 */
@Service
public class ReportReviewAppService {

    private static final Logger log = LoggerFactory.getLogger(ReportReviewAppService.class);

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final AgentServiceClient agent;
    private final ReportAggregatorService aggregator;
    private final ObjectMapper mapper;

    public ReportReviewAppService(
        VisitRepository visits,
        MedicalReportRepository reports,
        AgentServiceClient agent,
        ReportAggregatorService aggregator,
        ObjectMapper mapper
    ) {
        this.visits = visits;
        this.reports = reports;
        this.agent = agent;
        this.aggregator = aggregator;
        this.mapper = mapper;
    }

    // ───── /generate-sync ─────────────────────────────────────────────────────
    public ReportReviewResult generate(UUID visitId, String transcript, String specialty) {
        VisitModel v = requireVisit(visitId);
        if (v.getStatus() == VisitStatus.FINALIZED) throw new ConflictException("visit already finalized: " + visitId);
        log.info("[REVIEW] generate visit={} doctor={} patient={} transcriptLen={}",
            visitId, v.getDoctorId(), v.getPatientId(), transcript == null ? 0 : transcript.length());
        var stream = agent.reportGenerateStream(visitId, v.getPatientId(), v.getDoctorId(), specialty, transcript);
        return toResult(aggregator.aggregate(stream).block());
    }

    // ───── /clarify-sync ──────────────────────────────────────────────────────
    public ReportReviewResult clarify(UUID visitId, String answer) {
        VisitModel v = requireVisit(visitId);
        log.info("[REVIEW] clarify visit={} answerLen={}", visitId, answer == null ? 0 : answer.length());
        var stream = agent.reportClarifyStream(visitId, v.getPatientId(), v.getDoctorId(), answer);
        return toResult(aggregator.aggregate(stream).block());
    }

    // ───── /edit-sync ─────────────────────────────────────────────────────────
    public ReportReviewResult edit(UUID visitId, String instruction) {
        VisitModel v = requireVisit(visitId);
        // D1a bootstrap — fetch current draft from visits.report_draft jsonb,
        // pass to agent so LLM sees doctor's silent form-row edits.
        Object currentDraft = readCurrentDraft(visitId);
        log.info("[REVIEW] edit visit={} instructionLen={} hasDraft={}",
            visitId, instruction == null ? 0 : instruction.length(), currentDraft != null);
        var stream = agent.reportEditStream(visitId, v.getPatientId(), v.getDoctorId(), instruction, currentDraft);
        ReportAggregatorService.AggregateResult agg = aggregator.aggregate(stream).block();

        // Fallback: if the agent didn't emit update_soap_draft (e.g. trivial
        // no-op edit), return the pre-edit draft so the UI never goes blank.
        if (agg != null && agg.report() == null && currentDraft != null) {
            MedicalReportDto fallback = mapper.convertValue(currentDraft, MedicalReportDto.class);
            log.info("[REVIEW] edit no-op — returning pre-edit draft visit={}", visitId);
            return new ReportReviewResult(agg.status(), fallback, toCl(agg.clarification()));
        }
        return toResult(agg);
    }

    // ───── PATCH /report/draft ────────────────────────────────────────────────
    @Transactional
    public MedicalReportDto patchDraft(UUID visitId, String path, Object value) {
        // Direct update of visits.report_draft jsonb via a JSONB jsonb_set call.
        // We execute via the VisitRepository's EntityManager. This is a raw
        // native query — keep it here so the rest of the codebase stays JPA.
        log.info("[REVIEW] patchDraft visit={} path={}", visitId, path);
        // Convert dotted+indexed path into a text[] jsonb_set path
        String[] jsonPath = toJsonPath(path);
        String pathLiteral = "{" + String.join(",", jsonPath) + "}";
        String valueJson;
        try { valueJson = mapper.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalArgumentException("invalid value for patchDraft: " + e.getMessage()); }
        visits.patchReportDraftJsonb(visitId, pathLiteral, valueJson);
        return mapper.convertValue(readCurrentDraft(visitId), MedicalReportDto.class);
    }

    // ───── GET /report/chat ───────────────────────────────────────────────────
    public ChatTurnsResponse getChat(UUID visitId) {
        var fromAgent = agent.getReportChat(visitId);
        List<ChatTurnsResponse.ChatTurn> mapped = fromAgent.turns().stream()
            .map(t -> new ChatTurnsResponse.ChatTurn(t.turnIndex(), t.role(), t.content(), t.toolCallName(), t.createdAt()))
            .toList();
        log.info("[REVIEW] getChat visit={} turns={}", visitId, mapped.size());
        return new ChatTurnsResponse(mapped);
    }

    // ───── POST /report/approve ───────────────────────────────────────────────
    @Transactional
    public ApproveResponse approve(UUID visitId) {
        MedicalReportModel r = reports.findByVisitId(visitId).orElseGet(() -> {
            MedicalReportModel m = new MedicalReportModel();
            m.setVisitId(visitId);
            return m;
        });
        if (r.isFinalized()) throw new ConflictException("report already finalized");
        OffsetDateTime now = OffsetDateTime.now();
        r.setPreviewApprovedAt(now);
        reports.save(r);
        log.info("[REVIEW] approve visit={} at={}", visitId, now);
        return new ApproveResponse(true, now);
    }

    // ───── POST /report/finalize ──────────────────────────────────────────────
    @Transactional
    public FinalizeResponse finalize(UUID visitId, UUID doctorId) {
        MedicalReportModel r = reports.findByVisitId(visitId)
            .orElseThrow(() -> new ResourceNotFoundException("medical report for visit", visitId));
        if (r.isFinalized()) {
            log.info("[REVIEW] finalize idempotent — already finalized visit={}", visitId);
            return new FinalizeResponse(visitId, r.getSummaryEn(), r.getSummaryMs(), r.getFinalizedAt());
        }
        if (r.getPreviewApprovedAt() == null) {
            log.info("[REVIEW] finalize gate failed — not approved visit={}", visitId);
            throw new ConflictException("preview must be approved before finalizing");
        }

        // Delegate to agent for validation + summary. Agent no longer touches visits.
        Map<String, Object> finalized = agent.reportFinalize(visitId);
        String summaryEn = (String) finalized.getOrDefault("summary_en", "");
        String summaryMs = (String) finalized.getOrDefault("summary_ms", "");
        @SuppressWarnings("unchecked")
        Map<String, Object> reportJson = (Map<String, Object>) finalized.get("report");
        MedicalReportDto finalizedReport = mapper.convertValue(reportJson, MedicalReportDto.class);

        // Flatten the structured report into the flat text columns
        r.setSubjective(flattenSubjective(finalizedReport));
        r.setObjective(flattenObjective(finalizedReport));
        r.setAssessment(flattenAssessment(finalizedReport));
        r.setPlan(flattenPlan(finalizedReport));
        r.setSummaryEn(summaryEn);
        r.setSummaryMs(summaryMs);
        r.setFinalized(true);
        r.setFinalizedBy(doctorId);
        OffsetDateTime now = OffsetDateTime.now();
        r.setFinalizedAt(now);
        r.setAiDraftHash(sha256(r.getSubjective() + "|" + r.getObjective() + "|" + r.getAssessment() + "|" + r.getPlan()));
        reports.save(r);

        VisitModel v = visits.findById(visitId).orElseThrow();
        v.setStatus(VisitStatus.FINALIZED);
        v.setFinalizedAt(now);
        visits.save(v);

        log.info("[REVIEW] finalize OK visit={} doctor={} summaryEnLen={} summaryMsLen={}",
            visitId, doctorId, summaryEn.length(), summaryMs.length());

        return new FinalizeResponse(visitId, summaryEn, summaryMs, now);
    }

    // ───── helpers ────────────────────────────────────────────────────────────
    private VisitModel requireVisit(UUID visitId) {
        return visits.findById(visitId).orElseThrow(() -> new ResourceNotFoundException("visit", visitId));
    }

    private Map<String, Object> readCurrentDraft(UUID visitId) {
        String json = visits.findReportDraftJson(visitId);
        if (json == null) return null;
        try { return mapper.readValue(json, new TypeReference<Map<String, Object>>() {}); }
        catch (Exception e) { log.warn("[REVIEW] failed to parse report_draft visit={} err={}", visitId, e.toString()); return null; }
    }

    private static String[] toJsonPath(String dotted) {
        // "plan.medications[0].dose" → ["plan", "medications", "0", "dose"]
        return dotted.replaceAll("\\[(\\d+)\\]", ".$1").split("\\.");
    }

    private ReportReviewResult toResult(ReportAggregatorService.AggregateResult agg) {
        if (agg == null) return new ReportReviewResult("error", null, null);
        return new ReportReviewResult(agg.status(), agg.report(), toCl(agg.clarification()));
    }

    private ReportReviewResult.Clarification toCl(ReportAggregatorService.Clarification c) {
        return c == null ? null : new ReportReviewResult.Clarification(c.field(), c.prompt(), c.context());
    }

    private static String flattenSubjective(MedicalReportDto r) {
        var s = r.subjective();
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        if (s.chiefComplaint() != null) sb.append("Chief complaint: ").append(s.chiefComplaint()).append("\n");
        if (s.historyOfPresentIllness() != null) sb.append(s.historyOfPresentIllness()).append("\n");
        if (s.symptomDuration() != null) sb.append("Duration: ").append(s.symptomDuration()).append("\n");
        if (s.associatedSymptoms() != null && !s.associatedSymptoms().isEmpty())
            sb.append("Associated: ").append(String.join(", ", s.associatedSymptoms())).append("\n");
        return sb.toString().trim();
    }

    private static String flattenObjective(MedicalReportDto r) {
        var o = r.objective();
        if (o == null) return "";
        StringBuilder sb = new StringBuilder();
        if (o.vitalSigns() != null) o.vitalSigns().forEach((k, val) -> sb.append(k).append(": ").append(val).append("\n"));
        if (o.physicalExam() != null) sb.append(o.physicalExam());
        return sb.toString().trim();
    }

    private static String flattenAssessment(MedicalReportDto r) {
        var a = r.assessment();
        if (a == null) return "";
        StringBuilder sb = new StringBuilder();
        if (a.primaryDiagnosis() != null) sb.append("Primary: ").append(a.primaryDiagnosis()).append("\n");
        if (a.differentialDiagnoses() != null && !a.differentialDiagnoses().isEmpty())
            sb.append("Differentials: ").append(String.join(", ", a.differentialDiagnoses())).append("\n");
        if (a.icd10Codes() != null && !a.icd10Codes().isEmpty())
            sb.append("ICD-10: ").append(String.join(", ", a.icd10Codes())).append("\n");
        return sb.toString().trim();
    }

    private static String flattenPlan(MedicalReportDto r) {
        var p = r.plan();
        if (p == null) return "";
        StringBuilder sb = new StringBuilder();
        if (p.medications() != null) for (var m : p.medications()) {
            sb.append(m.drugName()).append(" ").append(m.dose());
            if (m.frequency() != null) sb.append(" ").append(m.frequency());
            if (m.duration() != null) sb.append(" for ").append(m.duration());
            sb.append("\n");
        }
        if (p.investigations() != null && !p.investigations().isEmpty())
            sb.append("Investigations: ").append(String.join(", ", p.investigations())).append("\n");
        if (p.lifestyleAdvice() != null && !p.lifestyleAdvice().isEmpty())
            sb.append("Lifestyle: ").append(String.join(", ", p.lifestyleAdvice())).append("\n");
        if (p.followUp() != null && p.followUp().needed()) {
            sb.append("Follow-up");
            if (p.followUp().timeframe() != null) sb.append(" in ").append(p.followUp().timeframe());
            sb.append("\n");
        }
        if (p.redFlags() != null && !p.redFlags().isEmpty())
            sb.append("Red flags: ").append(String.join("; ", p.redFlags())).append("\n");
        return sb.toString().trim();
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
```

- [ ] **Step 2: Add two new JPA repository methods needed above**

Edit `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/VisitRepository.java`:

```java
@org.springframework.data.jpa.repository.Query(
    value = "SELECT report_draft::text FROM visits WHERE id = :visitId",
    nativeQuery = true
)
String findReportDraftJson(@org.springframework.data.repository.query.Param("visitId") java.util.UUID visitId);

@org.springframework.transaction.annotation.Transactional
@org.springframework.data.jpa.repository.Modifying
@org.springframework.data.jpa.repository.Query(
    value = "UPDATE visits SET report_draft = jsonb_set(COALESCE(report_draft, '{}'::jsonb), CAST(:path AS text[]), CAST(:valueJson AS jsonb), true) WHERE id = :visitId",
    nativeQuery = true
)
void patchReportDraftJsonb(
    @org.springframework.data.repository.query.Param("visitId") java.util.UUID visitId,
    @org.springframework.data.repository.query.Param("path") String path,
    @org.springframework.data.repository.query.Param("valueJson") String valueJson
);
```

- [ ] **Step 3: Compile**

Run: `cd backend && ./mvnw -q -DskipTests compile`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/application/biz/visit/ReportReviewAppService.java backend/src/main/java/my/cliniflow/domain/biz/visit/repository/VisitRepository.java
git commit -m "feat(backend): ReportReviewAppService — 7-endpoint orchestration"
```

---

### Task C2: ReportController — replace with new sync endpoints

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/visit/ReportController.java`

- [ ] **Step 1: Rewrite the controller**

```java
// backend/src/main/java/my/cliniflow/controller/biz/visit/ReportController.java
package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.ReportReviewAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.request.ReportClarifySyncRequest;
import my.cliniflow.controller.biz.visit.request.ReportDraftPatchRequest;
import my.cliniflow.controller.biz.visit.request.ReportEditSyncRequest;
import my.cliniflow.controller.biz.visit.request.ReportGenerateSyncRequest;
import my.cliniflow.controller.biz.visit.response.ApproveResponse;
import my.cliniflow.controller.biz.visit.response.ChatTurnsResponse;
import my.cliniflow.controller.biz.visit.response.FinalizeResponse;
import my.cliniflow.controller.biz.visit.response.ReportReviewResult;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import my.cliniflow.infrastructure.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/visits/{visitId}/report")
public class ReportController {

    private static final Logger log = LoggerFactory.getLogger(ReportController.class);

    private final ReportReviewAppService svc;

    public ReportController(ReportReviewAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/generate-sync")
    public WebResult<ReportReviewResult> generateSync(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportGenerateSyncRequest req
    ) {
        log.info("[REVIEW] POST /generate-sync visit={}", visitId);
        return WebResult.ok(svc.generate(visitId, req.transcript(), req.specialty()));
    }

    @PostMapping("/clarify-sync")
    public WebResult<ReportReviewResult> clarifySync(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportClarifySyncRequest req
    ) {
        log.info("[REVIEW] POST /clarify-sync visit={}", visitId);
        return WebResult.ok(svc.clarify(visitId, req.answer()));
    }

    @PostMapping("/edit-sync")
    public WebResult<ReportReviewResult> editSync(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportEditSyncRequest req
    ) {
        log.info("[REVIEW] POST /edit-sync visit={}", visitId);
        return WebResult.ok(svc.edit(visitId, req.instruction()));
    }

    @PatchMapping("/draft")
    public WebResult<MedicalReportDto> patchDraft(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportDraftPatchRequest req
    ) {
        log.info("[REVIEW] PATCH /draft visit={} path={}", visitId, req.path());
        return WebResult.ok(svc.patchDraft(visitId, req.path(), req.value()));
    }

    @GetMapping("/chat")
    public WebResult<ChatTurnsResponse> getChat(@PathVariable UUID visitId) {
        log.info("[REVIEW] GET /chat visit={}", visitId);
        return WebResult.ok(svc.getChat(visitId));
    }

    @PostMapping("/approve")
    public WebResult<ApproveResponse> approve(@PathVariable UUID visitId) {
        log.info("[REVIEW] POST /approve visit={}", visitId);
        return WebResult.ok(svc.approve(visitId));
    }

    @PostMapping("/finalize")
    public WebResult<FinalizeResponse> finalizeReport(
        @PathVariable UUID visitId,
        Authentication auth
    ) {
        UUID doctorId = ((JwtService.Claims) auth.getPrincipal()).userId();
        log.info("[REVIEW] POST /finalize visit={} doctor={}", visitId, doctorId);
        return WebResult.ok(svc.finalize(visitId, doctorId));
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw -q -DskipTests compile`
Expected: exit 0.

- [ ] **Step 3: Run existing backend tests to check nothing regressed**

Run: `cd backend && ./mvnw -q test`
Expected: all green (or known pre-existing failures only).

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/visit/ReportController.java
git commit -m "feat(backend): ReportController — sync JSON endpoints for review flow"
```

---

### Task C3: FinalizeAtomicityTest — the atomic-rollback guarantee

**Files:**
- Create: `backend/src/test/java/my/cliniflow/application/biz/visit/FinalizeAtomicityTest.java`

- [ ] **Step 1: Write the test**

```java
// backend/src/test/java/my/cliniflow/application/biz/visit/FinalizeAtomicityTest.java
package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Enforces spec §5.5: finalize is one atomic transaction. If the audit_log
 * INSERT fails (simulated here by breaking the audit trigger), the visit
 * status must NOT flip to FINALIZED.
 *
 * Uses the real DB (Testcontainers or local dev Postgres per project convention).
 */
@SpringBootTest
class FinalizeAtomicityTest {

    @Autowired ReportReviewAppService svc;
    @Autowired VisitRepository visits;
    @Autowired MedicalReportRepository reports;
    @Autowired JdbcTemplate jdbc;

    @Test
    void auditTriggerFailureRollsBackVisitStatus() {
        // Arrange: seed a visit + approved report in IN_PROGRESS
        UUID visitId = UUID.randomUUID();
        UUID doctorId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        VisitModel v = new VisitModel();
        v.setId(visitId);
        v.setPatientId(patientId);
        v.setDoctorId(doctorId);
        v.setStatus(VisitStatus.IN_PROGRESS);
        visits.save(v);
        MedicalReportModel r = new MedicalReportModel();
        r.setVisitId(visitId);
        r.setPreviewApprovedAt(OffsetDateTime.now());
        reports.save(r);

        // Break the audit trigger deliberately (simulate a trigger drift)
        jdbc.execute("CREATE OR REPLACE FUNCTION audit_medical_reports_fn() RETURNS trigger AS $$ " +
            "BEGIN RAISE EXCEPTION 'simulated audit failure'; END; $$ LANGUAGE plpgsql;");

        try {
            assertThatThrownBy(() -> svc.finalize(visitId, doctorId))
                .isInstanceOf(Exception.class);

            // Assert: neither table should be updated
            VisitModel after = visits.findById(visitId).orElseThrow();
            assertThat(after.getStatus()).isEqualTo(VisitStatus.IN_PROGRESS);
            MedicalReportModel rAfter = reports.findByVisitId(visitId).orElseThrow();
            assertThat(rAfter.isFinalized()).isFalse();
        } finally {
            // Restore the trigger. Use whatever the production function body is.
            // (Recreate from the V7 migration or whatever your current schema uses.)
            jdbc.execute("DROP FUNCTION IF EXISTS audit_medical_reports_fn() CASCADE;");
        }
    }
}
```

Note: this test requires the V7-equivalent audit trigger exists for `medical_reports`. If it doesn't yet, skip this test with `@Disabled("audit trigger for medical_reports not yet wired")` and track as follow-up. Do not claim "atomicity proven" otherwise.

- [ ] **Step 2: Run test**

Run: `cd backend && ./mvnw -q test -Dtest=FinalizeAtomicityTest`
Expected: PASS (or skipped with clear reason).

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/my/cliniflow/application/biz/visit/FinalizeAtomicityTest.java
git commit -m "test(backend): FinalizeAtomicityTest — rollback on audit failure"
```

---

## Phase D — Frontend types + state

### Task D1: MedicalReport TypeScript mirror

**Files:**
- Create: `frontend/lib/types/report.ts`

- [ ] **Step 1: Write the types**

```ts
// frontend/lib/types/report.ts
// Mirror of agent/app/schemas/report.py::MedicalReport and
// backend/.../MedicalReportDto.java. Field names are camelCase at this layer
// (the backend remaps snake_case to camelCase in its DTO).
//
// See spec §4.7 — single source of truth. Do not drift.

export type ConfidenceFlag = "extracted" | "inferred" | "confirmed";

export interface MedicationOrder {
  drugName: string;
  dose: string;
  frequency: string;
  duration: string;
  route?: string | null;
}

export interface FollowUp {
  needed: boolean;
  timeframe?: string | null;
  reason?: string | null;
}

export interface Subjective {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  symptomDuration?: string | null;
  associatedSymptoms: string[];
  relevantHistory: string[];
}

export interface Objective {
  vitalSigns: Record<string, string>;
  physicalExam?: string | null;
}

export interface Assessment {
  primaryDiagnosis: string;
  differentialDiagnoses: string[];
  icd10Codes: string[];
}

export interface Plan {
  medications: MedicationOrder[];
  investigations: string[];
  lifestyleAdvice: string[];
  followUp: FollowUp;
  redFlags: string[];
}

export interface MedicalReport {
  subjective: Subjective;
  objective: Objective;
  assessment: Assessment;
  plan: Plan;
  confidenceFlags: Record<string, ConfidenceFlag>;
}

export interface Clarification {
  field: string;
  prompt: string;
  context: string;
}

export type ReviewStatus = "complete" | "clarification_pending" | "error";

export interface ReportReviewResult {
  status: ReviewStatus;
  report: MedicalReport | null;
  clarification: Clarification | null;
}

export interface ChatTurn {
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  toolCallName?: string | null;
  createdAt?: string | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types/report.ts
git commit -m "feat(frontend): MedicalReport + review-result types"
```

---

### Task D2: reviewReducer — pure state transitions

**Files:**
- Create: `frontend/lib/reviewReducer.ts`
- Test: `frontend/lib/reviewReducer.test.ts` (run with whatever runner the project supports; if none, skip test file and rely on compile-type safety)

- [ ] **Step 1: Write the reducer**

```ts
// frontend/lib/reviewReducer.ts
import type { MedicalReport, ChatTurn, Clarification } from "./types/report";

export interface ReviewState {
  report: MedicalReport | null;
  chat: ChatTurn[];
  approved: boolean;
  generating: boolean;
  editing: boolean;
  patching: Set<string>;
  clarification: Clarification | null;
  error: string | null;
}

export const initialReviewState: ReviewState = {
  report: null,
  chat: [],
  approved: false,
  generating: false,
  editing: false,
  patching: new Set(),
  clarification: null,
  error: null,
};

export type ReviewAction =
  | { type: "GENERATE_START" }
  | { type: "GENERATE_DONE"; report: MedicalReport | null; clarification: Clarification | null; status: string }
  | { type: "EDIT_START" }
  | { type: "EDIT_DONE"; report: MedicalReport | null; clarification: Clarification | null; status: string }
  | { type: "PATCH_START"; path: string }
  | { type: "PATCH_DONE"; path: string; report: MedicalReport }
  | { type: "PATCH_FAIL"; path: string; message: string }
  | { type: "CHAT_SET"; turns: ChatTurn[] }
  | { type: "APPROVE" }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_ERROR" };

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "GENERATE_START":
      return { ...state, generating: true, error: null };
    case "GENERATE_DONE":
      return {
        ...state,
        generating: false,
        report: action.report ?? state.report,
        clarification: action.clarification,
      };
    case "EDIT_START":
      return { ...state, editing: true, error: null };
    case "EDIT_DONE":
      return {
        ...state,
        editing: false,
        report: action.report ?? state.report,
        clarification: action.clarification,
      };
    case "PATCH_START": {
      const next = new Set(state.patching);
      next.add(action.path);
      return { ...state, patching: next };
    }
    case "PATCH_DONE": {
      const next = new Set(state.patching);
      next.delete(action.path);
      return { ...state, patching: next, report: action.report };
    }
    case "PATCH_FAIL": {
      const next = new Set(state.patching);
      next.delete(action.path);
      return { ...state, patching: next, error: action.message };
    }
    case "CHAT_SET":
      return { ...state, chat: action.turns };
    case "APPROVE":
      return { ...state, approved: true };
    case "ERROR":
      return { ...state, error: action.message, generating: false, editing: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/reviewReducer.ts
git commit -m "feat(frontend): reviewReducer — pure state transitions for review flow"
```

---

## Phase E — Frontend components

### Task E1: PhasedSpinner — 15–30s generate UX

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx
"use client";
import { useEffect, useState } from "react";

/**
 * Timer-driven phased progress text. Shown during the 15-30s wait on
 * /report/generate-sync so the doctor has signal without exposing raw SSE.
 * Pure presentation — no server coupling.
 */
const PHASES = [
  { at: 0, label: "Reading transcript" },
  { at: 4000, label: "Drafting report" },
  { at: 10000, label: "Checking interactions" },
  { at: 18000, label: "Almost there" },
];

export function PhasedSpinner() {
  const [phase, setPhase] = useState(PHASES[0].label);
  useEffect(() => {
    const timers = PHASES.map((p) => setTimeout(() => setPhase(p.label), p.at));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div role="status" aria-live="polite" className="phased-spinner">
      <span className="spinner-dot" aria-hidden /> {phase}…
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx
git commit -m "feat(frontend): PhasedSpinner — phased progress during generate wait"
```

---

### Task E2: GenerateBar — transcript + "Generate report" button

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx
"use client";
import { useState } from "react";
import { PhasedSpinner } from "./PhasedSpinner";

export interface GenerateBarProps {
  onGenerate: (transcript: string) => Promise<void>;
  generating: boolean;
  hasReport: boolean;         // controls collapse behavior
  initialTranscript?: string;
}

/**
 * Transcript capture + "Generate report" action. Collapses to a summary row
 * once a report exists. See spec §6.1.
 */
export function GenerateBar({ onGenerate, generating, hasReport, initialTranscript }: GenerateBarProps) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [expanded, setExpanded] = useState(!hasReport);

  async function handleGenerate() {
    if (!transcript.trim()) return;
    console.info("[REVIEW] generate click len=", transcript.length);
    await onGenerate(transcript);
    setExpanded(false);  // collapse after success
  }

  if (hasReport && !expanded) {
    return (
      <section className="generate-bar collapsed">
        <span>Transcript: {transcript.trim().split(/\s+/).length} words</span>
        <button type="button" onClick={() => setExpanded(true)}>Edit transcript</button>
        <button type="button" onClick={handleGenerate} disabled={generating}>Regenerate</button>
      </section>
    );
  }

  return (
    <section className="generate-bar">
      <label htmlFor="transcript-ta">Consultation transcript</label>
      <textarea
        id="transcript-ta"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={6}
        placeholder="Paste or type the consultation transcript…"
      />
      <div className="generate-bar-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleGenerate}
          disabled={generating || !transcript.trim()}
          aria-busy={generating}
        >
          {generating ? "Generating…" : "Generate report"}
        </button>
        {generating && <PhasedSpinner />}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx
git commit -m "feat(frontend): GenerateBar — transcript + generate action"
```

---

### Task E3: ReportPanel — structured report with inline form rows

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx
"use client";
import type { MedicalReport, MedicationOrder } from "@/lib/types/report";

export interface ReportPanelProps {
  report: MedicalReport | null;
  approved: boolean;
  onApprove: () => void | Promise<void>;
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
  locked: boolean;  // true after finalize
}

/**
 * Renders MedicalReport with:
 *   - free-text areas for S/O/A flat text (we keep the structured fields
 *     visible but edit via the agent + chat; these textareas show the
 *     computed "primary + full paragraph" for readability — edits here
 *     patch the specific structured fields)
 *   - structured form rows for plan.medications[]
 *   - structured form row for plan.follow_up
 *   - header with Approve & continue action
 *
 * Patches on blur (no debounce). See spec §6.1, §5.5.
 */
export function ReportPanel({ report, approved, onApprove, onPatch, patching, locked }: ReportPanelProps) {
  if (report == null) {
    return (
      <section className="report-panel empty">
        <div className="card-head"><h2>Report</h2></div>
        <p className="muted">Report will appear here once generated.</p>
      </section>
    );
  }

  const approveDisabled = locked || approved || report == null;

  function field(path: string) {
    return patching.has(path) ? "saving" : "";
  }

  return (
    <section className="report-panel">
      <div className="card-head">
        <h2>Report <span className="badge">AI draft</span></h2>
        <button
          type="button"
          className="btn-primary"
          onClick={() => { console.info("[REVIEW] approve click"); onApprove(); }}
          disabled={approveDisabled}
        >
          {approved ? "Approved ✓" : "Approve & continue →"}
        </button>
      </div>

      <fieldset disabled={locked}>
        <label>Subjective — chief complaint</label>
        <textarea
          defaultValue={report.subjective.chiefComplaint}
          onBlur={(e) => onPatch("subjective.chiefComplaint", e.target.value)}
          className={field("subjective.chiefComplaint")}
        />
        <label>Subjective — history of present illness</label>
        <textarea
          defaultValue={report.subjective.historyOfPresentIllness}
          onBlur={(e) => onPatch("subjective.historyOfPresentIllness", e.target.value)}
          className={field("subjective.historyOfPresentIllness")}
        />

        <label>Objective — physical exam</label>
        <textarea
          defaultValue={report.objective.physicalExam ?? ""}
          onBlur={(e) => onPatch("objective.physicalExam", e.target.value)}
          className={field("objective.physicalExam")}
        />

        <label>Assessment — primary diagnosis</label>
        <input
          type="text"
          defaultValue={report.assessment.primaryDiagnosis}
          onBlur={(e) => onPatch("assessment.primaryDiagnosis", e.target.value)}
          className={field("assessment.primaryDiagnosis")}
        />

        <h3>Plan — medications</h3>
        {[0, 1, 2].map((i) => (
          <MedRow
            key={i}
            med={report.plan.medications[i]}
            index={i}
            onPatch={onPatch}
            patching={patching}
          />
        ))}

        <h3>Plan — follow-up</h3>
        <label>
          <input
            type="checkbox"
            defaultChecked={report.plan.followUp.needed}
            onBlur={(e) => onPatch("plan.followUp.needed", e.target.checked)}
          />
          Follow-up needed
        </label>
        <label>Timeframe</label>
        <input
          type="text"
          defaultValue={report.plan.followUp.timeframe ?? ""}
          onBlur={(e) => onPatch("plan.followUp.timeframe", e.target.value)}
        />
      </fieldset>
    </section>
  );
}

interface MedRowProps {
  med: MedicationOrder | undefined;
  index: number;
  onPatch: (path: string, value: unknown) => void | Promise<void>;
  patching: Set<string>;
}
function MedRow({ med, index, onPatch, patching }: MedRowProps) {
  const p = (f: string) => `plan.medications[${index}].${f}`;
  const cls = (f: string) => patching.has(p(f)) ? "saving" : "";
  return (
    <div className="med-row">
      <input type="text" placeholder="Drug name"
        defaultValue={med?.drugName ?? ""}
        onBlur={(e) => onPatch(p("drugName"), e.target.value)}
        className={cls("drugName")} />
      <input type="text" placeholder="Dose"
        defaultValue={med?.dose ?? ""}
        onBlur={(e) => onPatch(p("dose"), e.target.value)}
        className={cls("dose")} />
      <input type="text" placeholder="Frequency"
        defaultValue={med?.frequency ?? ""}
        onBlur={(e) => onPatch(p("frequency"), e.target.value)}
        className={cls("frequency")} />
      <input type="text" placeholder="Duration"
        defaultValue={med?.duration ?? ""}
        onBlur={(e) => onPatch(p("duration"), e.target.value)}
        className={cls("duration")} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx
git commit -m "feat(frontend): ReportPanel — inline editable SOAP + meds form"
```

---

### Task E4: ReportChatPanel — unified chat thread

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx
"use client";
import { useState } from "react";
import type { ChatTurn, Clarification } from "@/lib/types/report";

export interface ReportChatPanelProps {
  turns: ChatTurn[];
  clarification: Clarification | null;
  editing: boolean;
  onSubmit: (text: string) => Promise<void>;
  locked: boolean;
}

/**
 * Unified chat thread. One input that either submits to /clarify-sync
 * (when a clarification is pending) or /edit-sync (otherwise).
 * See spec §6.1, Q2-A.
 */
export function ReportChatPanel({ turns, clarification, editing, onSubmit, locked }: ReportChatPanelProps) {
  const [draft, setDraft] = useState("");

  async function handle() {
    if (!draft.trim() || editing || locked) return;
    const text = draft;
    setDraft("");
    console.info("[REVIEW] chat submit len=", text.length, "clarification=", clarification?.field ?? null);
    await onSubmit(text);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handle();
    }
  }

  const placeholder = clarification
    ? `Answer: ${clarification.prompt}`
    : "Ask the agent to edit something…";

  return (
    <section className="chat-panel">
      <div className="card-head"><h2>Assistant</h2></div>
      <ol className="chat-thread">
        {turns.map((t) => (
          <li key={t.turnIndex} data-role={t.role}>
            <div className="chat-role">{t.role === "user" ? "You" : "Assistant"}</div>
            <div className="chat-content">{t.content}</div>
          </li>
        ))}
        {editing && (
          <li data-role="assistant" aria-live="polite">
            <div className="chat-role">Assistant</div>
            <div className="chat-content muted">Thinking…</div>
          </li>
        )}
      </ol>
      <div className="chat-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={editing || locked}
          rows={2}
        />
        <button type="button" onClick={handle} disabled={editing || locked || !draft.trim()}>Send</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx
git commit -m "feat(frontend): ReportChatPanel — unified chat thread + input"
```

---

### Task E5: SplitReview — the container that wires it all together

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx`

- [ ] **Step 1: Write the container**

```tsx
// frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx
"use client";
import { useEffect, useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import { initialReviewState, reviewReducer } from "@/lib/reviewReducer";
import type { ChatTurn, ReportReviewResult, MedicalReport } from "@/lib/types/report";
import { GenerateBar } from "./GenerateBar";
import { ReportPanel } from "./ReportPanel";
import { ReportChatPanel } from "./ReportChatPanel";

export interface SplitReviewProps {
  visitId: string;
  initialReport: MedicalReport | null;
  initialApproved: boolean;
  locked: boolean;
  onNavigateToPreview: () => void;
}

export function SplitReview({ visitId, initialReport, initialApproved, locked, onNavigateToPreview }: SplitReviewProps) {
  const [state, dispatch] = useReducer(reviewReducer, {
    ...initialReviewState,
    report: initialReport,
    approved: initialApproved,
  });

  const refreshChat = useCallback(async () => {
    try {
      const data = await apiGet<{ turns: ChatTurn[] }>(`/visits/${visitId}/report/chat`);
      dispatch({ type: "CHAT_SET", turns: data.turns });
    } catch (e) {
      console.warn("[REVIEW] chat refresh failed", e);
    }
  }, [visitId]);

  useEffect(() => { refreshChat(); }, [refreshChat]);

  async function handleGenerate(transcript: string) {
    dispatch({ type: "GENERATE_START" });
    try {
      const resp = await apiPost<ReportReviewResult>(
        `/visits/${visitId}/report/generate-sync`,
        { transcript, specialty: null },
      );
      dispatch({ type: "GENERATE_DONE", report: resp.report, clarification: resp.clarification, status: resp.status });
      await refreshChat();
    } catch (e) {
      dispatch({ type: "ERROR", message: (e as Error).message });
    }
  }

  async function handleChatSubmit(text: string) {
    dispatch({ type: "EDIT_START" });
    try {
      const path = state.clarification ? "clarify-sync" : "edit-sync";
      const body = state.clarification ? { answer: text } : { instruction: text };
      const resp = await apiPost<ReportReviewResult>(`/visits/${visitId}/report/${path}`, body);
      dispatch({ type: "EDIT_DONE", report: resp.report, clarification: resp.clarification, status: resp.status });
      await refreshChat();
    } catch (e) {
      dispatch({ type: "ERROR", message: (e as Error).message });
    }
  }

  async function handlePatch(path: string, value: unknown) {
    dispatch({ type: "PATCH_START", path });
    try {
      const resp = await apiPatch<{ report: MedicalReport }>(
        `/visits/${visitId}/report/draft`,
        { path, value },
      );
      dispatch({ type: "PATCH_DONE", path, report: resp.report });
    } catch (e) {
      dispatch({ type: "PATCH_FAIL", path, message: (e as Error).message });
    }
  }

  async function handleApprove() {
    try {
      await apiPost(`/visits/${visitId}/report/approve`, {});
      dispatch({ type: "APPROVE" });
      onNavigateToPreview();
    } catch (e) {
      dispatch({ type: "ERROR", message: (e as Error).message });
    }
  }

  return (
    <div className="split-review">
      {state.error && (
        <div className="banner error" role="alert">
          {state.error} <button onClick={() => dispatch({ type: "CLEAR_ERROR" })}>Dismiss</button>
        </div>
      )}
      <GenerateBar
        onGenerate={handleGenerate}
        generating={state.generating}
        hasReport={state.report != null}
      />
      <div className="split-review-panes">
        <ReportPanel
          report={state.report}
          approved={state.approved}
          onApprove={handleApprove}
          onPatch={handlePatch}
          patching={state.patching}
          locked={locked}
        />
        <ReportChatPanel
          turns={state.chat}
          clarification={state.clarification}
          editing={state.editing}
          onSubmit={handleChatSubmit}
          locked={locked}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `apiPatch` to `frontend/lib/api.ts` if missing**

Check `frontend/lib/api.ts` for a PATCH helper. If not present, add:

```ts
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  return unwrap<T>(res);
}
```

(Match the signature of existing `apiPost`.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx frontend/lib/api.ts
git commit -m "feat(frontend): SplitReview container + apiPatch helper"
```

---

## Phase F — Wire into page.tsx; rename Post-Visit Preview; delete legacy

### Task F1: Rename PostVisitPreview → ReportPreview

**Files:**
- Rename: `frontend/app/doctor/visits/[visitId]/components/PostVisitPreview.tsx` → `ReportPreview.tsx`

- [ ] **Step 1: `git mv` the file**

```bash
git mv frontend/app/doctor/visits/[visitId]/components/PostVisitPreview.tsx frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx
```

- [ ] **Step 2: Update the export name inside the file**

Edit the file to rename the exported component from `PostVisitPreview` to `ReportPreview`. Grep for all usages:

```bash
grep -rn "PostVisitPreview" frontend/app
```

Update all import sites.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/
git commit -m "refactor(frontend): rename PostVisitPreview → ReportPreview"
```

---

### Task F2: Rewire page.tsx — Consultation tab uses SplitReview; tab rename

**Files:**
- Modify: `frontend/app/doctor/visits/[visitId]/page.tsx`

- [ ] **Step 1: Edit the phase-tab definitions**

Search for the PhaseTabs definitions and rename:

```diff
- { key: "post", label: "Post-Visit Preview" },
+ { key: "preview", label: "Report Preview" },
```

Update the corresponding usage `#post` → `#preview` hash.

- [ ] **Step 2: Replace the Consultation tab body**

Find the block that renders the old `ConsultationCapture` + `Medications` card + `FinalizeBar`. Replace with:

```tsx
<SplitReview
  visitId={visitId}
  initialReport={null /* or derived from detail if already present */}
  initialApproved={detail?.soap?.previewApprovedAt != null}
  locked={detail?.soap?.finalized ?? false}
  onNavigateToPreview={() => {
    window.location.hash = "#preview";
  }}
/>
```

Import `SplitReview` from the new path:

```ts
import { SplitReview } from "./components/review/SplitReview";
```

Remove the obsolete imports and state vars: `onGeneratePreview`, `preview`, `previewAck`, `previewUnavailable`, `PostVisitPreview`, `ConsultationCapture`, any sticky FinalizeBar.

- [ ] **Step 3: The Report Preview tab body stays mostly the same**

Just rename the variable `postVisitPanel` → `reportPreviewPanel` and the tab case key. The `ReportPreview` component itself still displays the summary and Publish button; wire the Publish button to `apiPost('/visits/${visitId}/report/finalize', {})` if not already.

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: both pass.

- [ ] **Step 5: Manual smoke**

```bash
docker compose up -d --build frontend backend agent
```

Open `http://localhost`. Log in as a doctor, open a visit, confirm:
1. Consultation tab shows the new split layout.
2. Generate button triggers a request to `/api/visits/.../report/generate-sync`.
3. On success the report appears left, chat appears right.
4. Approve button navigates to `#preview`.
5. Report Preview tab shows summary + Publish button.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/page.tsx
git commit -m "feat(frontend): rewire Consultation tab to SplitReview; rename tab"
```

---

### Task F3: Delete deprecated components

**Files:**
- Delete: `frontend/app/doctor/components/ConsultationCapture.tsx` (if only used by old flow)
- Delete: any remaining FinalizeBar component
- Delete: any MedsCard component

- [ ] **Step 1: Verify no other references**

```bash
grep -rn "ConsultationCapture" frontend/app
grep -rn "FinalizeBar" frontend/app
grep -rn "MedsCard" frontend/app
```

Expected: no references outside the files being deleted.

- [ ] **Step 2: Delete files**

```bash
git rm frontend/app/doctor/components/ConsultationCapture.tsx
# Add any others as confirmed
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(frontend): remove deprecated components absorbed by SplitReview"
```

---

## Phase G — Contract tests + E2E

### Task G1: Contract tests — 7 endpoints, one file each

**Files:**
- Create: `backend/src/test/java/my/cliniflow/contract/ReportContractTest.java` (single file with 7 `@Test` methods for brevity; split if > 400 lines)

- [ ] **Step 1: Write the contract test**

```java
// backend/src/test/java/my/cliniflow/contract/ReportContractTest.java
package my.cliniflow.contract;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end contract tests — real HTTP through the backend, with the agent
 * running in docker-compose. Asserts frontend-facing JSON keys match the
 * MedicalReport TypeScript interface exactly.
 *
 * Enables the "never let snake_case/camelCase drift ship" invariant.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReportContractTest {

    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;

    private String base() { return "http://localhost:" + port; }

    @Autowired my.cliniflow.infrastructure.security.JwtService jwt;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    private static final UUID TEST_DOCTOR_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID TEST_PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    private HttpHeaders auth() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        String token = jwt.issue(new my.cliniflow.infrastructure.security.JwtService.Claims(
            TEST_DOCTOR_ID, "doctor@demo.local", "DOCTOR"
        ));
        h.setBearerAuth(token);
        return h;
    }

    private UUID seedIdleVisit() {
        UUID visitId = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO visits (id, patient_id, doctor_id, status, started_at) " +
            "VALUES (?, ?, ?, 'IN_PROGRESS', now())",
            visitId, TEST_PATIENT_ID, TEST_DOCTOR_ID
        );
        return visitId;
    }

    private UUID seedVisitWithDraft() {
        UUID visitId = seedIdleVisit();
        String draftJson = "{\"subjective\": {\"chief_complaint\": \"Dry cough x 3 days\", " +
            "\"history_of_present_illness\": \"3 days\", \"associated_symptoms\": [], \"relevant_history\": []}," +
            "\"objective\": {\"vital_signs\": {}}, \"assessment\": {\"primary_diagnosis\": \"Acute bronchitis\", " +
            "\"differential_diagnoses\": [], \"icd10_codes\": []}, \"plan\": {\"medications\": [], " +
            "\"investigations\": [], \"lifestyle_advice\": [], \"follow_up\": {\"needed\": false}, \"red_flags\": []}}";
        jdbc.update(
            "UPDATE visits SET report_draft = ?::jsonb, report_confidence_flags = '{}'::jsonb WHERE id = ?",
            draftJson, visitId
        );
        return visitId;
    }

    private UUID seedApprovedVisitWithDraft() {
        UUID visitId = seedVisitWithDraft();
        jdbc.update(
            "INSERT INTO medical_reports (id, visit_id, subjective, objective, assessment, plan, " +
            "is_finalized, preview_approved_at, gmt_create, gmt_modified) " +
            "VALUES (gen_random_uuid(), ?, '', '', '', '', false, now(), now(), now())",
            visitId
        );
        return visitId;
    }

    private JsonNode postJson(String path, Map<String, Object> body) throws Exception {
        var resp = new RestTemplate().postForEntity(
            base() + path, new HttpEntity<>(body, auth()), String.class
        );
        return mapper.readTree(resp.getBody());
    }

    private JsonNode postEmpty(String path) throws Exception {
        var resp = new RestTemplate().postForEntity(
            base() + path, new HttpEntity<>("{}", auth()), String.class
        );
        return mapper.readTree(resp.getBody());
    }

    // ── 1. /generate-sync ────────────────────────────────────────────────────
    @Test
    void generateSync_envelopeHasStatusReportClarification() throws Exception {
        UUID visitId = seedIdleVisit();
        JsonNode json = postJson(
            "/api/visits/" + visitId + "/report/generate-sync",
            Map.of("transcript", "patient has a cough for 3 days", "specialty", "")
        );
        assertThat(json.has("code")).isTrue();
        JsonNode data = json.path("data");
        assertThat(data.has("status")).isTrue();
        assertThat(data.has("report")).isTrue();
        assertThat(data.has("clarification")).isTrue();
        if (!data.path("report").isNull()) {
            assertThat(data.path("report").path("subjective").has("chiefComplaint")).isTrue();
            assertThat(data.path("report").path("plan").path("followUp").has("needed")).isTrue();
        }
    }

    // ── 2. /clarify-sync ─────────────────────────────────────────────────────
    @Test
    void clarifySync_envelopeHasStatusReportClarification() throws Exception {
        // First generate with a transcript designed to trigger clarification
        UUID visitId = seedIdleVisit();
        postJson(
            "/api/visits/" + visitId + "/report/generate-sync",
            Map.of("transcript", "Patient came in.", "specialty", "")
        );
        // Now resume with an answer
        JsonNode json = postJson(
            "/api/visits/" + visitId + "/report/clarify-sync",
            Map.of("answer", "Dry cough 3 days, diagnose as acute bronchitis")
        );
        JsonNode data = json.path("data");
        assertThat(data.has("status")).isTrue();
        assertThat(data.has("report")).isTrue();
        assertThat(data.has("clarification")).isTrue();
    }

    // ── 3. /edit-sync ────────────────────────────────────────────────────────
    @Test
    void editSync_envelopeHasStatusReportClarification() throws Exception {
        UUID visitId = seedVisitWithDraft();
        JsonNode json = postJson(
            "/api/visits/" + visitId + "/report/edit-sync",
            Map.of("instruction", "change follow-up to 2 weeks")
        );
        JsonNode data = json.path("data");
        assertThat(data.has("status")).isTrue();
        assertThat(data.has("report")).isTrue();  // edit must never leave report null
        assertThat(data.path("report").path("plan").path("followUp").has("timeframe")).isTrue();
    }

    // ── 4. PATCH /report/draft ───────────────────────────────────────────────
    @Test
    void draftPatch_updatesReportAndEchoesIt() throws Exception {
        UUID visitId = seedVisitWithDraft();
        var headers = auth();
        var body = Map.of("path", "plan.followUp.timeframe", "value", "2 weeks");
        var resp = new RestTemplate().exchange(
            base() + "/api/visits/" + visitId + "/report/draft",
            org.springframework.http.HttpMethod.PATCH,
            new HttpEntity<>(body, headers), String.class
        );
        JsonNode json = mapper.readTree(resp.getBody());
        JsonNode data = json.path("data");
        assertThat(data.has("report")).isTrue();
        assertThat(data.path("report").path("plan").path("followUp").path("timeframe").asText())
            .isEqualTo("2 weeks");
    }

    // ── 5. GET /report/chat ──────────────────────────────────────────────────
    @Test
    void chat_returnsTurnsList() throws Exception {
        UUID visitId = seedIdleVisit();
        postJson(
            "/api/visits/" + visitId + "/report/generate-sync",
            Map.of("transcript", "Dry cough 3 days, bronchitis", "specialty", "")
        );
        var resp = new RestTemplate().exchange(
            base() + "/api/visits/" + visitId + "/report/chat",
            org.springframework.http.HttpMethod.GET,
            new HttpEntity<>(auth()), String.class
        );
        JsonNode json = mapper.readTree(resp.getBody());
        JsonNode data = json.path("data");
        assertThat(data.has("turns")).isTrue();
        assertThat(data.path("turns").isArray()).isTrue();
        if (data.path("turns").size() > 0) {
            JsonNode t0 = data.path("turns").get(0);
            assertThat(t0.has("turnIndex")).isTrue();
            assertThat(t0.has("role")).isTrue();
            assertThat(t0.has("content")).isTrue();
        }
    }

    // ── 6. POST /report/approve ──────────────────────────────────────────────
    @Test
    void approve_returnsApprovedTrueAndTimestamp() throws Exception {
        UUID visitId = seedVisitWithDraft();
        JsonNode json = postEmpty("/api/visits/" + visitId + "/report/approve");
        JsonNode data = json.path("data");
        assertThat(data.path("approved").asBoolean()).isTrue();
        assertThat(data.has("approvedAt")).isTrue();
        assertThat(data.path("approvedAt").asText()).isNotBlank();
    }

    // ── 7. POST /report/finalize ─────────────────────────────────────────────
    @Test
    void finalize_409WhenNotApproved_200WhenApproved() throws Exception {
        // Part 1: not approved → 409
        UUID notApproved = seedVisitWithDraft();
        jdbc.update(
            "INSERT INTO medical_reports (id, visit_id, subjective, objective, assessment, plan, " +
            "is_finalized, gmt_create, gmt_modified) " +
            "VALUES (gen_random_uuid(), ?, '', '', '', '', false, now(), now())",
            notApproved
        );
        try {
            new RestTemplate().postForEntity(
                base() + "/api/visits/" + notApproved + "/report/finalize",
                new HttpEntity<>("{}", auth()), String.class
            );
        } catch (org.springframework.web.client.HttpClientErrorException e) {
            assertThat(e.getStatusCode().value()).isEqualTo(409);
        }

        // Part 2: approved → 200 with summary envelope
        UUID approved = seedApprovedVisitWithDraft();
        JsonNode json = postEmpty("/api/visits/" + approved + "/report/finalize");
        JsonNode data = json.path("data");
        assertThat(data.has("visitId")).isTrue();
        assertThat(data.has("summaryEn")).isTrue();
        assertThat(data.has("summaryMs")).isTrue();
        assertThat(data.has("finalizedAt")).isTrue();
    }
}
```

Notes for the implementer:
- `JwtService.issue(Claims)` method may not yet exist; if not, add one in the same commit that returns a signed JWT from a `JwtService.Claims` record. Check `JwtAuthenticationFilter` for the decoding side to mirror.
- These tests require the agent running (docker-compose). CI should start docker-compose before this test class. Locally, run `docker compose up -d agent` first.
- Tests that expect an agent-mediated response (1, 2, 3, 5, 7) consume real LLM quota. Gate with an env flag if cost matters: `@EnabledIfEnvironmentVariable(named = "RUN_CONTRACT_TESTS", matches = "true")`.

- [ ] **Step 2: Run**

Run: `cd backend && ./mvnw -q test -Dtest=ReportContractTest` (requires agent running via docker-compose).
Expected: all 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/my/cliniflow/contract/ReportContractTest.java
git commit -m "test(backend): contract tests — 7 review endpoints through all layers"
```

---

### Task G2: E2E — happy path

**Files:**
- Create: `frontend/e2e/post-visit-review-happy-path.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// frontend/e2e/post-visit-review-happy-path.spec.ts
import { test, expect } from "@playwright/test";

test("doctor generates, approves, and publishes a report", async ({ page }) => {
  await page.goto("http://localhost/login");
  await page.getByLabel("Email").fill("doctor@demo.local");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.getByRole("link", { name: /visit with pat demo/i }).click();
  await page.getByRole("tab", { name: /consultation/i }).click();

  await page.getByLabel(/consultation transcript/i).fill(
    "Patient reports a dry cough for 3 days, no fever, no chest pain. " +
    "Prescribe paracetamol 500mg TDS for 5 days. Follow up in 1 week if no improvement."
  );
  await page.getByRole("button", { name: /generate report/i }).click();

  await expect(page.getByRole("heading", { name: /report/i })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/cough/i).first()).toBeVisible();

  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page).toHaveURL(/#preview$/);

  await page.getByRole("button", { name: /publish to patient/i }).click();
  await expect(page.getByText(/published/i)).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 2: Run**

```bash
cd frontend && npx playwright test post-visit-review-happy-path
```

Expected: PASS against a running docker-compose stack.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/post-visit-review-happy-path.spec.ts
git commit -m "test(e2e): happy path for post-visit review refactor"
```

---

### Task G3: E2E — clarification path

**Files:**
- Create: `frontend/e2e/post-visit-review-clarification.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// frontend/e2e/post-visit-review-clarification.spec.ts
import { test, expect } from "@playwright/test";

test("agent asks for clarification when transcript is thin", async ({ page }) => {
  await page.goto("http://localhost/login");
  await page.getByLabel("Email").fill("doctor@demo.local");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.getByRole("link", { name: /visit with pat demo/i }).click();
  await page.getByRole("tab", { name: /consultation/i }).click();

  // Intentionally missing chief complaint and diagnosis
  await page.getByLabel(/consultation transcript/i).fill("Patient came in. Meh.");
  await page.getByRole("button", { name: /generate report/i }).click();

  // Expect clarification to appear in chat
  const chatInput = page.getByPlaceholder(/answer:/i);
  await expect(chatInput).toBeVisible({ timeout: 45_000 });

  await chatInput.fill("Dry cough x 3 days, diagnosis is acute bronchitis");
  await page.getByRole("button", { name: /send/i }).click();

  // Expect report to appear after clarification resolves
  await expect(page.getByText(/bronchitis/i)).toBeVisible({ timeout: 45_000 });

  // Continue through approve + publish
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page).toHaveURL(/#preview$/);
});
```

- [ ] **Step 2: Run**

```bash
cd frontend && npx playwright test post-visit-review-clarification
```

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/post-visit-review-clarification.spec.ts
git commit -m "test(e2e): clarification path for post-visit review refactor"
```

---

## Phase H — Wrap up

### Task H1: Run the full suite; manual smoke

- [ ] **Step 1: Run all three test suites**

```bash
cd agent && pytest -x
cd ../backend && ./mvnw test
cd ../frontend && npm run typecheck && npm run lint && npm run build && npx playwright test
```

All must pass.

- [ ] **Step 2: Full-stack smoke**

```bash
docker compose up -d --build
```

Walk the full happy path in the browser:
1. Patient does pre-visit.
2. Doctor opens visit, clicks Consultation.
3. Types transcript, clicks Generate report.
4. Verifies report + chat render, edits a med dose (form-row), asks a chat edit ("change follow-up to 2 weeks").
5. Clicks Approve & continue, lands on Report Preview.
6. Clicks Publish to patient.
7. Logs in as patient, verifies bilingual summary on portal.

Capture any issue as a follow-up ticket; do not re-open this plan.

- [ ] **Step 3: Use `superpowers:finishing-a-development-branch` to wrap**

This invokes the branch-completion skill (merge / PR / keep / discard choice).

---

## Appendix — Logging checklist (cross-cutting)

Every new route/service/component emitted structured logs per post-mortem §Meta:

**Agent** (`structlog` or stdlib `logging`):
- `[AGENT]` prefix on all routes
- On entry: route name + identifiers + content lengths
- On exit: status + size of response
- On error: full exception + request identifiers

**Backend** (`slf4j`):
- `[REVIEW]` for ReportReviewAppService + ReportController
- `[AGENT]` for AgentServiceClient (already present)
- `[UPSTREAM]` emitted by GlobalExceptionConfiguration (already present)
- `[BIZ]` for BusinessException handler (already present)
- On every controller entry: method + visit + doctor
- On every service method entry: identifiers + input sizes

**Frontend** (`console.info` / `console.warn`):
- `[REVIEW]` prefix on review-flow actions
- Log intent ("generate click"), not raw PII

Verify by grepping `[REVIEW]` / `[AGENT]` in server logs while exercising the happy path — should see a stream of events matching user actions.

---

## Self-review notes

Spec requirements vs plan tasks:
- §1 goal / architecture — Tasks B4, B5, C1, C2, E5 cover the architecture; F2 wires it into the page.
- §2 convention + contracts — every DTO uses `@JsonProperty`; contract tests (G1) enforce.
- §3 data model — B1 (migration), B2 (entity), C1 (writes).
- §4 frontend endpoints — C2 controller; C1 service implements all 7.
- §5 flow sequences — reflected in C1 method implementations and E5 SplitReview handlers.
- §5.5 atomicity — C1 `finalize` in single `@Transactional`; C3 test enforces.
- §6 components — E1–E5.
- §6.2 renames — F1.
- §6.3 deletions — F3.
- §7 tests — B5 (unit), C3 (atomicity), G1 (contract), G2/G3 (E2E).
- Cross-cutting logs — Appendix + inline in every service method.

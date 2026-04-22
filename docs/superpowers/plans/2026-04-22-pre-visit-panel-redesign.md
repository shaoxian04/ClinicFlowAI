# Pre-Visit Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the transcript dump on the doctor's Pre-Visit Report tab with a structured clinical summary, and wire up the currently-empty Patient Context sidebar to live Neo4j data with a dev-mode bulk-seed for demos.

**Architecture:** Three phases across three services.
- **Phase A** adds a post-hoc LLM slot-extraction call inside the agent's pre-visit `turn_sync` endpoint and a new frontend `PreVisitSummary` component that renders the resulting structured fields (no transcript).
- **Phase B1** adds a new agent patient-context route (combining existing `get_patient_context` + `get_visit_history` Cypher queries) plus a Neo4j healthz endpoint, proxied through a new backend `/patients/{id}/context` route into the already-built `PatientContextPanel`.
- **Phase B2** adds a flag-gated bulk "seed demo graph" endpoint (agent writes a standard clinical bundle for every Postgres patient) with a frontend button inside the context panel, visible only when the `cliniflow.dev.seed-demo-enabled` flag surfaces through `/whoami`.

**Tech Stack:** Python 3.12 (FastAPI, pydantic v2, pytest + testcontainers), Java 21 (Spring Boot 3.3, Maven, JUnit 5 + MockMvc), TypeScript / Next.js 14 (React Testing Library + Jest), Neo4j 5.24, Postgres 16.

**Reference documents:**
- Spec: `docs/superpowers/specs/2026-04-22-pre-visit-panel-redesign-design.md`
- Post-mortem (for testing discipline): `docs/post-mortem/2026-04-22-soap-generate-and-finalize-e2e.md`
- DDD conventions: `docs/details/ddd-conventions.md` (Java suffixes: `XxxReadAppService`, `XxxWriteAppService`, `XxxController`)

---

## Phase A — Pre-Visit Summary (agent extraction + frontend panel)

### Task 1: Add slot-extraction prompt constant

**Files:**
- Modify: `agent/app/prompts/pre_visit.py`

- [ ] **Step 1: Add the extraction prompt constant at the end of the file**

```python
SLOT_EXTRACTION_PROMPT = """\
You are a clinical-data extractor. Given a JSON array of intake conversation turns
between a pre-visit assistant and a patient, extract the confirmed facts into the
schema below. Only include a fact if the patient EXPLICITLY confirmed or stated it
in the conversation. Never infer or guess. Leave any unconfirmed slot as null or [].

Return a single JSON object matching this schema exactly:
{
  "chief_complaint": string | null,
  "symptom_duration": string | null,
  "pain_severity": integer 0-10 | null,
  "known_allergies": string[],
  "current_medications": string[],
  "relevant_history": string[]
}

Rules:
- If the patient explicitly said "no allergies" or confirmed an empty record,
  return known_allergies as [] (an empty, patient-confirmed list).
- If the topic was never raised, also return [] but do not claim confirmation.
- pain_severity must be an integer 0-10; if the patient said e.g. "moderate"
  without a number, leave it null.
- Return ONLY the JSON object. No prose, no markdown fences.
"""
```

- [ ] **Step 2: Commit**

```bash
git add agent/app/prompts/pre_visit.py
git commit -m "feat(agent): add pre-visit slot-extraction prompt"
```

---

### Task 2: Add `extract_slots` method on `PreVisitIntakeAgent`

**Files:**
- Modify: `agent/app/agents/pre_visit_agent.py`
- Test: `agent/tests/unit/test_pre_visit_extraction.py` (create)

- [ ] **Step 1: Write the failing test**

Create `agent/tests/unit/test_pre_visit_extraction.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/unit/test_pre_visit_extraction.py -v`
Expected: FAIL with `AttributeError: 'PreVisitIntakeAgent' object has no attribute 'extract_slots'`

- [ ] **Step 3: Implement `extract_slots`**

Add to `agent/app/agents/pre_visit_agent.py` (add imports at top first, then method inside the class):

```python
# at top of file, with other imports
import json
import logging
import re

from app.prompts.pre_visit import SLOT_EXTRACTION_PROMPT
from app.schemas.pre_visit import PreVisitSlots

_log = logging.getLogger(__name__)
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

# inside class PreVisitIntakeAgent:
    async def extract_slots(self, history: list[dict]) -> PreVisitSlots:
        """Post-hoc structured extraction of slots from the full intake history.

        Uses a dedicated LLM call with a strict JSON-output prompt. Returns an
        empty PreVisitSlots on any parse failure (never raises) so a broken
        extraction cannot break the patient-facing turn response.
        """
        try:
            resp = await self._llm.chat(
                messages=[
                    {"role": "system", "content": SLOT_EXTRACTION_PROMPT},
                    {"role": "user", "content": json.dumps(history)},
                ],
                tools=[],
            )
            text = _FENCE_RE.sub("", resp.text or "").strip()
            data = json.loads(text)
            return PreVisitSlots.model_validate(data)
        except Exception as exc:  # noqa: BLE001 — last-resort graceful fallback
            _log.warning("extract_slots failed, returning empty slots: %s", exc)
            return PreVisitSlots()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd agent && pytest tests/unit/test_pre_visit_extraction.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add agent/app/agents/pre_visit_agent.py agent/tests/unit/test_pre_visit_extraction.py
git commit -m "feat(agent): add PreVisitIntakeAgent.extract_slots post-hoc extractor"
```

---

### Task 3: Wire `extract_slots` into `/turn-sync`

**Files:**
- Modify: `agent/app/routes/pre_visit.py` (the `turn_sync` handler, lines 63-101)

- [ ] **Step 1: Write the failing test**

Append to `agent/tests/unit/test_pre_visit_extraction.py`:

```python
import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def test_turn_sync_returns_extracted_fields(monkeypatch):
    """turn_sync must call extract_slots and return non-empty fields."""
    vid = uuid.uuid4()
    pid = uuid.uuid4()

    async def fake_step(self, ctx, user_input):
        # emit one message.delta then stop
        from app.agents.base import AgentEvent
        yield AgentEvent(event="message.delta", data={"text": "OK."})

    async def fake_extract(self, history):
        return PreVisitSlots(chief_complaint="fever", symptom_duration="2 days")

    monkeypatch.setattr("app.agents.pre_visit_agent.PreVisitIntakeAgent.step", fake_step)
    monkeypatch.setattr("app.agents.pre_visit_agent.PreVisitIntakeAgent.extract_slots", fake_extract)

    # Prevent real Postgres writes from the agent-turns persistence layer.
    async def fake_append(self, rec): return 0
    monkeypatch.setattr("app.persistence.agent_turns.AgentTurnRepository.append", fake_append)

    client = TestClient(app)
    r = client.post("/agents/pre-visit/turn-sync", json={
        "visit_id": str(vid), "patient_id": str(pid), "user_input": "I have fever."
    })
    assert r.status_code == 200
    body = r.json()
    assert body["fields"]["chief_complaint"] == "fever"
    assert body["fields"]["symptom_duration"] == "2 days"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/unit/test_pre_visit_extraction.py::test_turn_sync_returns_extracted_fields -v`
Expected: FAIL — `fields` is empty `{}` (the current hardcoded behavior at `agent/app/routes/pre_visit.py:98`).

- [ ] **Step 3: Modify `turn_sync` to read conversation history and call `extract_slots`**

Replace the body of the `turn_sync` handler in `agent/app/routes/pre_visit.py`. Specifically, replace the block from `parts: list[str] = []` through the `return JSONResponse(...)` with:

```python
    parts: list[str] = []
    history_messages: list[dict] = []
    try:
        async for ev in agent.step(ctx, user_input=req.user_input):
            if ev.event == "message.delta":
                text = ev.data.get("text") or ""
                if text:
                    parts.append(text)
    except ClarificationRequested:
        log.info("pre_visit.turn_sync clarification requested visit_id=%s", req.visit_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("pre_visit.turn_sync failed visit_id=%s", req.visit_id)
        return JSONResponse(
            status_code=500,
            content={"error": f"{type(exc).__name__}: {exc}"},
        )

    assistant_message = "\n".join(p for p in parts if p).strip()
    lowered = assistant_message.lower()
    done = any(s in lowered for s in _DONE_SENTINELS)

    # Rebuild the conversation history for extraction: agent_turns rows + the
    # just-processed user input + the assistant reply we're about to return.
    try:
        turns = await AgentTurnRepository().load(req.visit_id, "pre_visit")
        history_messages = [{"role": t.role, "content": t.content} for t in turns
                            if t.role in ("user", "assistant")]
    except Exception as exc:  # noqa: BLE001
        log.warning("pre_visit.turn_sync history load failed: %s", exc)
        history_messages = []
    if req.user_input:
        history_messages.append({"role": "user", "content": req.user_input})
    if assistant_message:
        history_messages.append({"role": "assistant", "content": assistant_message})

    slots = await agent.extract_slots(history_messages)

    return JSONResponse(
        TurnSyncResponse(
            assistant_message=assistant_message,
            fields=slots.model_dump(),
            done=done,
        ).model_dump()
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd agent && pytest tests/unit/test_pre_visit_extraction.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full agent test suite to check for regressions**

Run: `cd agent && pytest -x`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add agent/app/routes/pre_visit.py agent/tests/unit/test_pre_visit_extraction.py
git commit -m "feat(agent): turn_sync returns extracted pre-visit slots"
```

---

### Task 4: Frontend type mirror for `PreVisitFields`

**Files:**
- Create: `frontend/lib/types/preVisit.ts`

- [ ] **Step 1: Create the type file**

```typescript
// frontend/lib/types/preVisit.ts
// Mirror of agent/app/schemas/pre_visit.py::PreVisitSlots.
// Backend snake_case → frontend camelCase via @JsonAlias on the DTO boundary.
// See spec §2 — single source of truth.

export interface PreVisitFields {
  chiefComplaint: string | null;
  symptomDuration: string | null;
  painSeverity: number | null;   // 0-10
  knownAllergies: string[];
  currentMedications: string[];
  relevantHistory: string[];
}

export function isPreVisitFieldsEmpty(f: PreVisitFields | null | undefined): boolean {
  if (!f) return true;
  return (
    !f.chiefComplaint &&
    !f.symptomDuration &&
    f.painSeverity == null &&
    f.knownAllergies.length === 0 &&
    f.currentMedications.length === 0 &&
    f.relevantHistory.length === 0
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/types/preVisit.ts
git commit -m "feat(frontend): add PreVisitFields type + isPreVisitFieldsEmpty helper"
```

---

### Task 5: `PreVisitSummary` component + CSS

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.tsx`
- Create: `frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.module.css`

- [ ] **Step 1: Create the component**

```tsx
// frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.tsx
"use client";

import type { PreVisitFields } from "@/lib/types/preVisit";
import { isPreVisitFieldsEmpty } from "@/lib/types/preVisit";
import styles from "./PreVisitSummary.module.css";

export interface PreVisitSummaryProps {
  fields: PreVisitFields | null | undefined;
  done: boolean;
  capturedAt?: string | null;  // ISO timestamp of the last intake turn
}

export function PreVisitSummary({ fields, done, capturedAt }: PreVisitSummaryProps) {
  const empty = isPreVisitFieldsEmpty(fields);

  if (empty && !done) {
    return (
      <section className={styles.card}>
        <header className={styles.head}>
          <h2>Pre-visit intake</h2>
          <span className={styles.idx}>01 / INTAKE</span>
        </header>
        <p className={styles.muted}>
          Pre-visit intake in progress. Summary will appear when captured.
        </p>
      </section>
    );
  }

  if (empty && done) {
    return (
      <section className={styles.card}>
        <header className={styles.head}>
          <h2>Pre-visit intake</h2>
          <span className={styles.idx}>01 / INTAKE</span>
        </header>
        <p className={styles.muted}>No pre-visit intake completed.</p>
      </section>
    );
  }

  // Non-null assertion safe: isPreVisitFieldsEmpty returned false.
  const f = fields!;
  return (
    <section className={styles.card}>
      <header className={styles.head}>
        <h2>Pre-visit intake</h2>
        <span className={styles.idx}>01 / INTAKE</span>
      </header>

      {f.chiefComplaint && (
        <div className={styles.section}>
          <div className={styles.label}>Chief complaint</div>
          <div className={styles.value}>{f.chiefComplaint}</div>
        </div>
      )}

      {(f.symptomDuration || f.painSeverity != null) && (
        <div className={styles.grid2}>
          {f.symptomDuration && (
            <div>
              <div className={styles.label}>Duration</div>
              <div className={styles.value}>{f.symptomDuration}</div>
            </div>
          )}
          {f.painSeverity != null && (
            <div>
              <div className={styles.label}>Pain severity</div>
              <div className={styles.value}>{f.painSeverity} / 10</div>
            </div>
          )}
        </div>
      )}

      {(f.knownAllergies.length > 0 ||
        f.currentMedications.length > 0 ||
        f.relevantHistory.length > 0) && (
        <div className={styles.divider}>Confirmed with patient</div>
      )}

      {f.knownAllergies.length > 0 && (
        <ChipSection label="Known allergies" items={f.knownAllergies} />
      )}
      {f.currentMedications.length > 0 && (
        <ChipSection label="Current medications" items={f.currentMedications} />
      )}
      {f.relevantHistory.length > 0 && (
        <ChipSection label="Relevant history" items={f.relevantHistory} />
      )}

      {capturedAt && (
        <footer className={styles.foot}>
          Intake captured {new Date(capturedAt).toLocaleString()}
        </footer>
      )}
    </section>
  );
}

function ChipSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className={styles.section}>
      <div className={styles.label}>{label}</div>
      <div className={styles.chips}>
        {items.map((x, i) => (
          <span key={i} className={styles.chip}>{x}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the CSS module**

```css
/* frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.module.css */
.card {
  background: #fff;
  border: 1px solid #d7d1c0;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid #e5e0d0;
  padding-bottom: 0.5rem;
}
.head h2 { margin: 0; font-size: 1.1rem; font-weight: 600; color: #2f4e3a; }
.idx {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8474;
}
.section { display: flex; flex-direction: column; gap: 0.3rem; }
.label {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6a7468;
  font-weight: 600;
}
.value { font-size: 0.95rem; color: #2a3326; line-height: 1.4; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.divider {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a8474;
  border-top: 1px solid #e5e0d0;
  padding-top: 0.75rem;
  margin-top: 0.2rem;
}
.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip {
  display: inline-block;
  background: #d9e3d0;
  color: #2a3a2c;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.82rem;
}
.foot {
  font-size: 0.75rem;
  color: #8a8474;
  border-top: 1px solid #e5e0d0;
  padding-top: 0.5rem;
}
.muted { color: #8a8474; margin: 0; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.tsx frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.module.css
git commit -m "feat(frontend): add PreVisitSummary component"
```

---

### Task 6: Replace transcript rendering with `PreVisitSummary` in page.tsx

**Files:**
- Modify: `frontend/app/doctor/visits/[visitId]/page.tsx` (lines 77-127, the `preVisitPanel` block; also extend `VisitDetail` type at line 26-36)

- [ ] **Step 1: Extend `VisitDetail` type**

Replace the `VisitDetail` type declaration at `frontend/app/doctor/visits/[visitId]/page.tsx:26-36` with:

```typescript
import type { PreVisitFields } from "@/lib/types/preVisit";

type VisitDetail = {
  visitId: string;
  patientId: string;
  patientName: string;
  status: string;
  preVisitStructured: {
    fields?: PreVisitFields;
    history?: Array<{ role: string; content: string }>;
    done?: boolean;
  };
  soap: Soap;
  createdAt: string;
  finalizedAt: string | null;
  reportDraft?: MedicalReport | null;
};
```

Add the `PreVisitFields` import near the existing `MedicalReport` import.

- [ ] **Step 2: Add `PreVisitSummary` import**

Add to the imports block at the top of `page.tsx`:

```typescript
import { PreVisitSummary } from "./components/PreVisitSummary";
```

- [ ] **Step 3: Replace the `preVisitPanel` definition**

Replace the entire `preVisitPanel = (...)` block in `page.tsx` (currently lines ~87-127) with:

```tsx
  const preVisitPanel = (
    <PreVisitSummary
      fields={detail.preVisitStructured?.fields as PreVisitFields | undefined}
      done={!!detail.preVisitStructured?.done}
      capturedAt={detail.createdAt}
    />
  );
```

Also remove the now-unused local constants `fields`, `history`, `hasFields`, `hasHistory` at the top of the component body.

- [ ] **Step 4: Run frontend typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/page.tsx
git commit -m "refactor(frontend): use PreVisitSummary in place of transcript dump"
```

---

### Task 7: Phase A smoke test — rebuild + manual browser check

**Files:** none edited; manual verification.

- [ ] **Step 1: Rebuild agent + frontend containers**

```bash
docker compose build agent frontend
docker compose up -d agent frontend
```

- [ ] **Step 2: Complete one pre-visit intake as a patient**

- Log in as the demo patient, start a pre-visit session, answer 5+ turns covering chief complaint, duration, and allergies.
- End the intake ("thanks — captured everything…" sentinel).

- [ ] **Step 3: Verify structured fields populated in Postgres**

Run this from the backend container or Supabase SQL editor:
```sql
SELECT pre_visit_structured -> 'fields'
FROM visits
ORDER BY created_at DESC LIMIT 1;
```
Expected: a non-empty JSON object with at least `chief_complaint` and `symptom_duration` set.

- [ ] **Step 4: Verify doctor sees the structured summary, not the transcript**

Log in as the doctor → open the visit → Pre-Visit Report tab. Confirm:
- Structured summary is visible.
- No conversation turns (ASSISTANT: / PATIENT:) appear anywhere.
- The sidebar still says "Context unavailable" (Phase B not done yet — OK).

- [ ] **Step 5: No commit needed for this task** (no file changes)

---

## Phase B1 — Patient Context read path + Neo4j healthz

### Task 8: Agent Neo4j startup probe + `/healthz` endpoint

**Files:**
- Create: `agent/app/routes/patient_context.py`
- Modify: `agent/app/main.py`

- [ ] **Step 1: Write the failing test**

Create `agent/tests/routes/test_patient_context_routes.py`:

```python
from fastapi.testclient import TestClient

from app.main import app


def test_healthz_returns_ok_when_neo4j_up(monkeypatch):
    async def fake_probe():
        return True
    monkeypatch.setattr("app.routes.patient_context._probe_neo4j", fake_probe)
    client = TestClient(app)
    r = client.get("/agents/patient-context/healthz")
    assert r.status_code == 200
    assert r.json() == {"neo4j": "ok"}


def test_healthz_returns_unavailable_when_neo4j_down(monkeypatch):
    async def fake_probe():
        return False
    monkeypatch.setattr("app.routes.patient_context._probe_neo4j", fake_probe)
    client = TestClient(app)
    r = client.get("/agents/patient-context/healthz")
    assert r.status_code == 200
    assert r.json() == {"neo4j": "unavailable"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/routes/test_patient_context_routes.py -v`
Expected: FAIL with 404 on the endpoint (route doesn't exist yet).

- [ ] **Step 3: Create the router file**

`agent/app/routes/patient_context.py`:

```python
from __future__ import annotations

import logging
from fastapi import APIRouter
from starlette.responses import JSONResponse

from app.graph.driver import get_driver

log = logging.getLogger(__name__)
router = APIRouter(prefix="/agents/patient-context", tags=["patient-context"])


async def _probe_neo4j() -> bool:
    """One-shot connectivity check. Returns True if `RETURN 1` succeeds."""
    try:
        driver = get_driver()
        async with driver.session() as session:
            result = await session.run("RETURN 1 AS ok")
            row = await result.single()
            return bool(row and row["ok"] == 1)
    except Exception as exc:  # noqa: BLE001
        log.warning("neo4j probe failed: %s", exc)
        return False


@router.get("/healthz")
async def healthz() -> JSONResponse:
    ok = await _probe_neo4j()
    return JSONResponse({"neo4j": "ok" if ok else "unavailable"})
```

- [ ] **Step 4: Register the router in `main.py`**

In `agent/app/main.py`, find the existing `app.include_router(...)` calls and add:

```python
from app.routes import patient_context as patient_context_routes
# ...
app.include_router(patient_context_routes.router)
```

Also add to the lifespan startup section (after `apply_schema()` call):

```python
    ok = await patient_context_routes._probe_neo4j()
    if ok:
        log.info("neo4j.probe_ok")
    else:
        log.error("neo4j.probe_failed — patient-context features will degrade")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd agent && pytest tests/routes/test_patient_context_routes.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agent/app/routes/patient_context.py agent/app/main.py agent/tests/routes/test_patient_context_routes.py
git commit -m "feat(agent): add Neo4j healthz + startup probe"
```

---

### Task 9: Agent `GET /agents/patient-context/{patient_id}` route

**Files:**
- Modify: `agent/app/routes/patient_context.py`
- Modify: `agent/tests/routes/test_patient_context_routes.py`

- [ ] **Step 1: Write the failing test**

Append to `agent/tests/routes/test_patient_context_routes.py`:

```python
import uuid

import pytest
from testcontainers.neo4j import Neo4jContainer

from app.graph.driver import close_driver


@pytest.fixture(scope="module")
def neo4j():
    with Neo4jContainer("neo4j:5.24") as n4j:
        yield n4j


@pytest.fixture
def neo4j_app(neo4j, monkeypatch):
    monkeypatch.setenv("NEO4J_URI", neo4j.get_connection_url())
    monkeypatch.setenv("NEO4J_USER", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", neo4j.NEO4J_ADMIN_PASSWORD)
    # force driver recreation
    import asyncio
    asyncio.get_event_loop().run_until_complete(close_driver())
    yield
    asyncio.get_event_loop().run_until_complete(close_driver())


@pytest.mark.asyncio
async def test_get_patient_context_returns_empty_for_unknown_patient(neo4j_app):
    client = TestClient(app)
    pid = uuid.uuid4()
    r = client.get(f"/agents/patient-context/{pid}")
    assert r.status_code == 200
    body = r.json()
    assert body["patient_id"] == str(pid)
    assert body["allergies"] == []
    assert body["conditions"] == []
    assert body["medications"] == []
    assert body["recent_visits"] == []


@pytest.mark.asyncio
async def test_get_patient_context_returns_seeded_data(neo4j_app):
    from app.graph.driver import get_driver
    pid = str(uuid.uuid4())
    driver = get_driver()
    async with driver.session() as session:
        await session.run("""
            MERGE (p:Patient {id: $pid}) SET p.full_name = 'Test'
            MERGE (a:Allergy {name: 'Penicillin'}) MERGE (p)-[:ALLERGIC_TO]->(a)
            MERGE (c:Condition {name: 'Asthma'}) MERGE (p)-[:HAS_CONDITION]->(c)
            MERGE (m:Medication {name: 'Salbutamol'}) MERGE (p)-[:TAKES]->(m)
            MERGE (v:Visit {id: 'v1'}) SET v.visited_at='2026-01-01', v.patient_id=$pid
            MERGE (p)-[:HAD_VISIT]->(v)
            MERGE (d:Diagnosis {code: 'J06.9', name: 'URTI'})
            MERGE (v)-[:DIAGNOSED_AS]->(d)
        """, pid=pid)

    client = TestClient(app)
    r = client.get(f"/agents/patient-context/{pid}")
    assert r.status_code == 200
    body = r.json()
    assert "Penicillin" in body["allergies"]
    assert "Asthma" in body["conditions"]
    assert "Salbutamol" in body["medications"]
    assert len(body["recent_visits"]) == 1
    assert body["recent_visits"][0]["primary_diagnosis"] == "URTI"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/routes/test_patient_context_routes.py::test_get_patient_context_returns_empty_for_unknown_patient -v`
Expected: FAIL with 404.

- [ ] **Step 3: Add the GET route**

Append to `agent/app/routes/patient_context.py`:

```python
import asyncio
from uuid import UUID

from app.graph.queries.patient_context import get_patient_context
from app.graph.queries.visit_history import get_visit_history


@router.get("/{patient_id}")
async def patient_context(patient_id: UUID) -> JSONResponse:
    ctx, visits = await asyncio.gather(
        get_patient_context(patient_id),
        get_visit_history(patient_id, limit=5),
    )
    return JSONResponse({
        "patient_id": str(patient_id),
        "allergies":   list(ctx.allergies),
        "conditions":  list(ctx.conditions),
        "medications": list(ctx.medications),
        "recent_visits": [
            {
                "visit_id":          v.visit_id,
                "visited_at":        v.visited_at,
                "primary_diagnosis": v.primary_diagnosis,
                "chief_complaint":   v.chief_complaint,
            }
            for v in visits
        ],
    })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd agent && pytest tests/routes/test_patient_context_routes.py -v`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add agent/app/routes/patient_context.py agent/tests/routes/test_patient_context_routes.py
git commit -m "feat(agent): add GET /agents/patient-context/{id} read route"
```

---

### Task 10: Backend `PatientContextResponse` DTO

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/patient/response/PatientContextResponse.java`

- [ ] **Step 1: Create the DTO**

```java
package my.cliniflow.controller.biz.patient.response;

import java.util.List;

public record PatientContextResponse(
    List<Labeled> allergies,
    List<Labeled> chronicConditions,
    List<Medication> activeMedications,
    List<RecentVisit> recentVisits
) {
    public record Labeled(String id, String label) {}
    public record Medication(String id, String name, String dose) {}
    public record RecentVisit(String visitId, String date, String diagnosis) {}
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/patient/response/PatientContextResponse.java
git commit -m "feat(backend): add PatientContextResponse DTO"
```

---

### Task 11: `AgentServiceClient.getPatientContext(UUID)`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java`

- [ ] **Step 1: Add the agent-side DTO and the new client method**

Add to `AgentServiceClient.java`, as an inner record near the other agent response records:

```java
public record AgentPatientContext(
    String patient_id,
    List<String> allergies,
    List<String> conditions,
    List<String> medications,
    List<AgentRecentVisit> recent_visits
) {
    public record AgentRecentVisit(
        String visit_id,
        String visited_at,
        String primary_diagnosis,
        String chief_complaint
    ) {}
}
```

Add the method in the class body:

```java
public AgentPatientContext getPatientContext(UUID patientId) {
    log.info("[AGENT] GET /agents/patient-context/{}", patientId);
    return webClient.get()
        .uri("/agents/patient-context/{id}", patientId)
        .retrieve()
        .bodyToMono(AgentPatientContext.class)
        .block();
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && ./mvnw -q -DskipTests package`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java
git commit -m "feat(backend): add AgentServiceClient.getPatientContext"
```

---

### Task 12: `PatientReadAppService.getContext(UUID)` + mapping

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java`

- [ ] **Step 1: Add the method + private mapper**

Add imports at top of file:
```java
import my.cliniflow.controller.biz.patient.response.PatientContextResponse;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse.Labeled;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse.Medication;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse.RecentVisit;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import my.cliniflow.infrastructure.client.AgentServiceClient.AgentPatientContext;
```

Add as a constructor-injected field:
```java
private final AgentServiceClient agent;
```
(Extend the constructor accordingly — IF the class doesn't already have an `agent` field, add it; if it does, reuse it.)

Add the method:

```java
public PatientContextResponse getContext(UUID patientId) {
    log.info("[PATIENT] getContext patientId={}", patientId);
    AgentPatientContext a = agent.getPatientContext(patientId);
    return new PatientContextResponse(
        mapLabeled(a.allergies()),
        mapLabeled(a.conditions()),
        mapMeds(a.medications()),
        mapVisits(a.recent_visits())
    );
}

private static List<Labeled> mapLabeled(List<String> names) {
    if (names == null) return List.of();
    return names.stream()
        .filter(n -> n != null && !n.isBlank())
        .map(n -> new Labeled(n.toLowerCase(), titleCase(n)))
        .toList();
}

private static List<Medication> mapMeds(List<String> names) {
    if (names == null) return List.of();
    return names.stream()
        .filter(n -> n != null && !n.isBlank())
        .map(n -> new Medication(n.toLowerCase().replaceAll("\\s+", "-"), titleCase(n), ""))
        .toList();
}

private static List<RecentVisit> mapVisits(List<AgentPatientContext.AgentRecentVisit> rv) {
    if (rv == null) return List.of();
    return rv.stream()
        .map(v -> new RecentVisit(
            v.visit_id(),
            v.visited_at() != null ? v.visited_at() : "",
            chooseDiagnosis(v)
        ))
        .toList();
}

private static String chooseDiagnosis(AgentPatientContext.AgentRecentVisit v) {
    if (v.primary_diagnosis() != null && !v.primary_diagnosis().isBlank())
        return v.primary_diagnosis();
    if (v.chief_complaint() != null && !v.chief_complaint().isBlank())
        return v.chief_complaint();
    return "—";
}

private static String titleCase(String s) {
    String trimmed = s.trim();
    if (trimmed.isEmpty()) return trimmed;
    return Character.toUpperCase(trimmed.charAt(0)) + trimmed.substring(1);
}
```

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw -q -DskipTests package`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java
git commit -m "feat(backend): add PatientReadAppService.getContext + mapping"
```

---

### Task 13: `PatientController` `/context` route + integration test

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/patient/PatientController.java`
- Test: `backend/src/test/java/my/cliniflow/controller/biz/patient/PatientControllerTest.java` (create or extend)

- [ ] **Step 1: Write the failing test**

Create or append to `backend/src/test/java/my/cliniflow/controller/biz/patient/PatientControllerTest.java`:

```java
package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse.Labeled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PatientControllerTest {
    @Autowired MockMvc mvc;
    @MockBean PatientReadAppService reads;

    @Test
    @WithMockUser(roles = "DOCTOR")
    void getContext_returns_mapped_dto() throws Exception {
        UUID pid = UUID.randomUUID();
        when(reads.getContext(any())).thenReturn(new PatientContextResponse(
            List.of(new Labeled("penicillin", "Penicillin")),
            List.of(), List.of(), List.of()
        ));
        mvc.perform(get("/patients/" + pid + "/context").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.allergies[0].label").value("Penicillin"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw -q test -Dtest=PatientControllerTest`
Expected: FAIL — route not found (404).

- [ ] **Step 3: Add the route to `PatientController`**

Add method to the class (alongside any existing `@GetMapping` handlers):

```java
@GetMapping("/{patientId}/context")
public PatientContextResponse getContext(@PathVariable UUID patientId) {
    return reads.getContext(patientId);
}
```
Use whatever field name the class uses for the read-service dependency (`reads`, `readService`, etc.).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw -q test -Dtest=PatientControllerTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/patient/PatientController.java backend/src/test/java/my/cliniflow/controller/biz/patient/PatientControllerTest.java
git commit -m "feat(backend): GET /patients/{id}/context"
```

---

### Task 14: Frontend error-handler broadening in `PatientContextPanel`

**Files:**
- Modify: `frontend/app/doctor/components/PatientContextPanel.tsx` (line 58)

- [ ] **Step 1: Broaden the error predicate**

Replace the existing catch block starting at line ~55:

```tsx
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith("HTTP 404") || msg.startsWith("HTTP 502") || msg.startsWith("HTTP 504")) {
          setState({ kind: "unavailable" });
          return;
        }
        setState({ kind: "error", message: msg });
      });
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/components/PatientContextPanel.tsx
git commit -m "fix(frontend): treat 502/504 patient-context errors as unavailable"
```

---

### Task 15: Phase B1 smoke test — rebuild + browser check

**Files:** none edited.

- [ ] **Step 1: Rebuild all three services**

```bash
docker compose build agent backend frontend
docker compose up -d agent backend frontend
```

- [ ] **Step 2: Verify agent healthz**

```bash
curl http://localhost:8000/agents/patient-context/healthz
```
Expected: `{"neo4j":"ok"}` (if Neo4j creds are configured), otherwise `{"neo4j":"unavailable"}`.

- [ ] **Step 3: Verify backend passes through**

```bash
curl http://localhost/api/patients/<any-uuid>/context -H "Authorization: Bearer <doctor-token>"
```
Expected: `200` with 4 empty arrays (no patient in graph yet).

- [ ] **Step 4: Verify sidebar in browser**

Open the Pre-Visit tab for any patient → sidebar shows 4 empty blocks (no "unavailable" banner). Empty expected — seed comes in Phase B2.

---

## Phase B2 — Bulk demo seed (flag-gated)

### Task 16: Agent bulk-seed Cypher + route

**Files:**
- Create: `agent/app/graph/queries/seed_demo.py`
- Modify: `agent/app/routes/patient_context.py`
- Modify: `agent/tests/routes/test_patient_context_routes.py`

- [ ] **Step 1: Write the failing test**

Append to `agent/tests/routes/test_patient_context_routes.py`:

```python
@pytest.mark.asyncio
async def test_seed_demo_bulk_creates_bundle_per_patient(neo4j_app):
    client = TestClient(app)
    pid1 = str(uuid.uuid4())
    pid2 = str(uuid.uuid4())

    r = client.post("/agents/patient-context/seed-demo-bulk", json={
        "patients": [
            {"id": pid1, "full_name": "Alice", "dob": "1990-01-01", "gender": "FEMALE"},
            {"id": pid2, "full_name": "Bob",   "dob": "1985-05-05", "gender": "MALE"},
        ]
    })
    assert r.status_code == 200
    assert r.json()["seeded"] == 2

    ctx1 = client.get(f"/agents/patient-context/{pid1}").json()
    assert "Penicillin" in ctx1["allergies"]
    assert "Type 2 Diabetes" in ctx1["conditions"]
    assert len(ctx1["recent_visits"]) == 2

    # Idempotent: re-run doesn't duplicate
    r2 = client.post("/agents/patient-context/seed-demo-bulk", json={
        "patients": [{"id": pid1, "full_name": "Alice", "dob": "1990-01-01", "gender": "FEMALE"}]
    })
    ctx1b = client.get(f"/agents/patient-context/{pid1}").json()
    assert len(ctx1b["allergies"]) == 2       # Penicillin + Peanuts
    assert len(ctx1b["recent_visits"]) == 2   # still 2, not 4
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent && pytest tests/routes/test_patient_context_routes.py::test_seed_demo_bulk_creates_bundle_per_patient -v`
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Create the seeding Cypher module**

`agent/app/graph/queries/seed_demo.py`:

```python
from __future__ import annotations

from typing import Iterable
from app.graph.driver import get_driver

_CYPHER = """
UNWIND $patients AS pat
MERGE (p:Patient {id: pat.id})
  SET p.full_name = pat.full_name,
      p.dob       = pat.dob,
      p.gender    = pat.gender

MERGE (a1:Allergy {name: 'Penicillin'})
MERGE (a2:Allergy {name: 'Peanuts'})
MERGE (p)-[:ALLERGIC_TO]->(a1)
MERGE (p)-[:ALLERGIC_TO]->(a2)

MERGE (c:Condition {name: 'Type 2 Diabetes'})
MERGE (p)-[:HAS_CONDITION]->(c)

MERGE (m:Medication {name: 'Metformin 500mg'})
MERGE (p)-[:TAKES]->(m)

WITH p, pat, substring(pat.id, 0, 8) AS prefix
MERGE (v1:Visit {id: 'v-demo-' + prefix + '-1'})
  SET v1.visited_at = '2026-01-05', v1.patient_id = pat.id
MERGE (p)-[:HAD_VISIT]->(v1)
MERGE (s1:Symptom {name: 'Cough'})
MERGE (v1)-[:PRESENTED_WITH]->(s1)
MERGE (d1:Diagnosis {code: 'J06.9', name: 'Acute upper respiratory infection'})
MERGE (v1)-[:DIAGNOSED_AS]->(d1)

MERGE (v2:Visit {id: 'v-demo-' + prefix + '-2'})
  SET v2.visited_at = '2026-04-14', v2.patient_id = pat.id
MERGE (p)-[:HAD_VISIT]->(v2)
MERGE (s2:Symptom {name: 'Fever'})
MERGE (v2)-[:PRESENTED_WITH]->(s2)
MERGE (d2:Diagnosis {code: 'A09', name: 'Gastroenteritis'})
MERGE (v2)-[:DIAGNOSED_AS]->(d2)
"""


async def seed_demo_bundle(patients: Iterable[dict]) -> int:
    """Seed a standard clinical bundle for each patient. Idempotent."""
    p_list = list(patients)
    if not p_list:
        return 0
    driver = get_driver()
    async with driver.session() as session:
        await session.run(_CYPHER, patients=p_list)
    return len(p_list)
```

- [ ] **Step 4: Add the POST route**

Append to `agent/app/routes/patient_context.py`:

```python
from pydantic import BaseModel
from app.graph.queries.seed_demo import seed_demo_bundle


class SeedDemoPatient(BaseModel):
    id: str
    full_name: str
    dob: str | None = None
    gender: str | None = None


class SeedDemoBulkRequest(BaseModel):
    patients: list[SeedDemoPatient]


@router.post("/seed-demo-bulk")
async def seed_demo_bulk(req: SeedDemoBulkRequest) -> JSONResponse:
    n = await seed_demo_bundle([p.model_dump() for p in req.patients])
    log.info("seed_demo_bulk applied for %d patients", n)
    return JSONResponse({"seeded": n})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd agent && pytest tests/routes/test_patient_context_routes.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agent/app/graph/queries/seed_demo.py agent/app/routes/patient_context.py agent/tests/routes/test_patient_context_routes.py
git commit -m "feat(agent): add POST /agents/patient-context/seed-demo-bulk"
```

---

### Task 17: Backend flag wiring + `PatientSeedDemoAppService`

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-dev.yml` (create if missing)
- Create: `backend/src/main/java/my/cliniflow/application/biz/patient/PatientSeedDemoAppService.java`
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java`

- [ ] **Step 1: Add the flag to application.yml (default off)**

Append to `backend/src/main/resources/application.yml`:

```yaml
cliniflow:
  dev:
    seed-demo-enabled: false
```

- [ ] **Step 2: Override in the dev profile**

If `application-dev.yml` exists, append:
```yaml
cliniflow:
  dev:
    seed-demo-enabled: true
```
If it doesn't exist, create it with that content.

- [ ] **Step 3: Add `seedDemoBulk` method to `AgentServiceClient`**

Add record + method to `AgentServiceClient.java`:

```java
public record SeedDemoBulkRequest(List<SeedDemoPatient> patients) {
    public record SeedDemoPatient(String id, String full_name, String dob, String gender) {}
}
public record SeedDemoBulkResponse(int seeded) {}

public SeedDemoBulkResponse seedDemoBulk(SeedDemoBulkRequest body) {
    log.info("[AGENT] POST /agents/patient-context/seed-demo-bulk n={}", body.patients().size());
    return webClient.post()
        .uri("/agents/patient-context/seed-demo-bulk")
        .bodyValue(body)
        .retrieve()
        .bodyToMono(SeedDemoBulkResponse.class)
        .block();
}
```

- [ ] **Step 4: Create `PatientSeedDemoAppService`**

```java
package my.cliniflow.application.biz.patient;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import my.cliniflow.infrastructure.client.AgentServiceClient.SeedDemoBulkRequest;
import my.cliniflow.infrastructure.client.AgentServiceClient.SeedDemoBulkRequest.SeedDemoPatient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;

@Service
public class PatientSeedDemoAppService {
    private static final Logger log = LoggerFactory.getLogger(PatientSeedDemoAppService.class);

    private final PatientRepository patients;
    private final AgentServiceClient agent;
    private final boolean enabled;

    public PatientSeedDemoAppService(
        PatientRepository patients,
        AgentServiceClient agent,
        @Value("${cliniflow.dev.seed-demo-enabled:false}") boolean enabled
    ) {
        this.patients = patients;
        this.agent = agent;
        this.enabled = enabled;
    }

    public boolean isEnabled() { return enabled; }

    public int seedAll() {
        if (!enabled) {
            throw new IllegalStateException("demo seeding disabled");
        }
        var all = patients.findAll().stream()
            .map(this::toSeedPatient)
            .toList();
        log.info("[SEED] sending {} patients to agent", all.size());
        var resp = agent.seedDemoBulk(new SeedDemoBulkRequest(all));
        return resp.seeded();
    }

    private SeedDemoPatient toSeedPatient(PatientModel p) {
        String dob = p.getDateOfBirth() != null
            ? p.getDateOfBirth().format(DateTimeFormatter.ISO_LOCAL_DATE)
            : null;
        String gender = p.getGender() != null ? p.getGender().name() : null;
        return new SeedDemoPatient(p.getId().toString(), p.getFullName(), dob, gender);
    }
}
```

- [ ] **Step 5: Verify `PatientRepository.findAll()` exists and field names match**

Run: `grep -n "findAll\|getDateOfBirth\|getFullName\|getGender" backend/src/main/java/my/cliniflow/domain/biz/patient/*.java backend/src/main/java/my/cliniflow/domain/biz/patient/model/*.java`
Expected: `findAll` present on `PatientRepository` (it extends Spring Data `JpaRepository` so this is usually inherited). Field getters may differ — adjust the `toSeedPatient` mapper if needed (e.g. if the DOB field is called `dob` → `getDob()`).

- [ ] **Step 6: Compile**

Run: `cd backend && ./mvnw -q -DskipTests package`
Expected: BUILD SUCCESS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/application.yml backend/src/main/resources/application-dev.yml backend/src/main/java/my/cliniflow/application/biz/patient/PatientSeedDemoAppService.java backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java
git commit -m "feat(backend): add PatientSeedDemoAppService + flag wiring"
```

---

### Task 18: Backend `POST /patients/context/seed-demo-all` + 403 test

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/patient/PatientController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/patient/response/SeedDemoResponse.java`
- Modify: `backend/src/test/java/my/cliniflow/controller/biz/patient/PatientControllerTest.java`

- [ ] **Step 1: Create the response DTO**

`backend/src/main/java/my/cliniflow/controller/biz/patient/response/SeedDemoResponse.java`:

```java
package my.cliniflow.controller.biz.patient.response;

public record SeedDemoResponse(int patientsSeeded) {}
```

- [ ] **Step 2: Write the failing test**

Append to `PatientControllerTest.java`:

```java
@MockBean PatientSeedDemoAppService seed;

@Test
@WithMockUser(roles = "DOCTOR")
void seedDemoAll_returns_403_when_flag_off() throws Exception {
    when(seed.isEnabled()).thenReturn(false);
    mvc.perform(post("/patients/context/seed-demo-all"))
        .andExpect(status().isForbidden());
}

@Test
@WithMockUser(roles = "DOCTOR")
void seedDemoAll_returns_count_when_flag_on() throws Exception {
    when(seed.isEnabled()).thenReturn(true);
    when(seed.seedAll()).thenReturn(7);
    mvc.perform(post("/patients/context/seed-demo-all"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.patientsSeeded").value(7));
}
```
Add needed imports: `post` from `MockMvcRequestBuilders`, `PatientSeedDemoAppService`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && ./mvnw -q test -Dtest=PatientControllerTest`
Expected: FAIL — route not found.

- [ ] **Step 4: Add the route to `PatientController`**

Add `@Autowired` or constructor-inject `PatientSeedDemoAppService seed`. Add the method:

```java
@PostMapping("/context/seed-demo-all")
public ResponseEntity<SeedDemoResponse> seedDemoAll() {
    if (!seed.isEnabled()) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    int n = seed.seedAll();
    return ResponseEntity.ok(new SeedDemoResponse(n));
}
```

Add imports: `HttpStatus`, `ResponseEntity`, `SeedDemoResponse`, `PatientSeedDemoAppService`, `PostMapping`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && ./mvnw -q test -Dtest=PatientControllerTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/patient/PatientController.java backend/src/main/java/my/cliniflow/controller/biz/patient/response/SeedDemoResponse.java backend/src/test/java/my/cliniflow/controller/biz/patient/PatientControllerTest.java
git commit -m "feat(backend): POST /patients/context/seed-demo-all (flag-gated)"
```

---

### Task 19: Expose `devSeedAllowed` via `/whoami`

**Files:**
- Find and modify: the existing `/whoami` or equivalent auth-status controller + DTO.

- [ ] **Step 1: Locate the endpoint**

Run: `grep -rn '"whoami"\|whoAmI\|getCurrentUser' backend/src/main/java`
Note the controller + response DTO paths.

- [ ] **Step 2: Add `devSeedAllowed: boolean` to the response DTO**

Extend the existing record by adding a new field at the end of the parameter list, e.g.:

```java
public record WhoAmIResponse(
    // ...existing fields
    boolean devSeedAllowed
) {}
```

- [ ] **Step 3: Populate it in the controller**

Inject `@Value("${cliniflow.dev.seed-demo-enabled:false}") boolean seedEnabled` into the controller (or use the existing `PatientSeedDemoAppService.isEnabled()` — reuse is preferred). Pass it to the constructor call that builds `WhoAmIResponse`.

- [ ] **Step 4: Compile**

Run: `cd backend && ./mvnw -q -DskipTests package`
Expected: BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/**/WhoAmI*.java backend/src/main/java/my/cliniflow/**/AuthController.java
git commit -m "feat(backend): expose devSeedAllowed via /whoami"
```
(Adjust paths after grep finds them.)

---

### Task 20: Frontend — extend `AuthUser` + render seed button

**Files:**
- Modify: `frontend/lib/auth.ts`
- Modify: `frontend/app/doctor/components/PatientContextPanel.tsx`

- [ ] **Step 1: Extend `AuthUser`**

In `frontend/lib/auth.ts`, add the optional field:

```typescript
export type AuthUser = {
    userId: string;
    email: string;
    role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
    fullName: string;
    consentGiven?: boolean;
    devSeedAllowed?: boolean;
};
```

- [ ] **Step 2: Add the seed button + API call in `PatientContextPanel.tsx`**

At the top of the file, add:
```tsx
import { apiPost } from "@/lib/api";
import { getUser } from "@/lib/auth";
```

Inside the `PanelBody` function (the existing component that renders the four blocks), AFTER the four `<details>` blocks but BEFORE the closing `</div>`, add:

```tsx
<SeedDemoButton
  allEmpty={
    allergies.length === 0 &&
    chronicConditions.length === 0 &&
    activeMedications.length === 0 &&
    recentVisits.length === 0
  }
/>
```

Then define the component at the bottom of the file:

```tsx
function SeedDemoButton({ allEmpty }: { allEmpty: boolean }) {
  const user = getUser();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!allEmpty || !user?.devSeedAllowed) return null;

  async function click() {
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/patients/context/seed-demo-all", {});
      window.location.reload();  // simplest: force a full refetch of whoami + context
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pcx-seed-bar">
      <button type="button" className="btn btn-ghost" onClick={click} disabled={busy}>
        {busy ? "Seeding…" : "Seed demo graph (all patients)"}
      </button>
      {err && <p className="pcx-seed-error">{err}</p>}
    </div>
  );
}
```

Also import `useState` if not already imported: `import { useCallback, useEffect, useId, useState } from "react";`.

- [ ] **Step 3: Add CSS for the seed bar**

Append to `frontend/app/globals.css` (or wherever `.pcx-*` styles live — grep for `pcx-panel` to find the file):

```css
.pcx-seed-bar {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed #d7d1c0;
  text-align: center;
}
.pcx-seed-error {
  color: #6a1f1f;
  font-size: 0.8rem;
  margin: 0.4rem 0 0;
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/auth.ts frontend/app/doctor/components/PatientContextPanel.tsx frontend/app/globals.css
git commit -m "feat(frontend): seed demo graph button (flag-gated via /whoami)"
```

---

### Task 21: Persist `devSeedAllowed` into local storage on login

**Files:**
- Modify: login code path — find via `grep -rn saveAuth frontend`.

- [ ] **Step 1: Propagate the new field**

Wherever login response is converted to `AuthUser` and passed to `saveAuth(token, user)`, ensure the new `devSeedAllowed` field is copied from the backend response. Example diff inside the login handler:

```typescript
const user: AuthUser = {
  userId: resp.userId,
  email: resp.email,
  role: resp.role,
  fullName: resp.fullName,
  consentGiven: resp.consentGiven,
  devSeedAllowed: resp.devSeedAllowed,   // ← add
};
saveAuth(resp.token, user);
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/login/page.tsx   # or wherever saveAuth is called
git commit -m "feat(frontend): persist devSeedAllowed on login"
```

---

### Task 22: Phase B2 end-to-end smoke test

**Files:** none edited.

- [ ] **Step 1: Rebuild and restart all services with dev profile active**

Confirm `.env` or docker-compose has `SPRING_PROFILES_ACTIVE=dev`. Then:
```bash
docker compose build agent backend frontend
docker compose up -d agent backend frontend
```

- [ ] **Step 2: Log out and log in as doctor**

Needed to pick up the new `/whoami` field in `AuthUser`.

- [ ] **Step 3: Navigate to Pre-Visit tab for any patient**

Expected: sidebar shows 4 empty blocks **and** a "Seed demo graph (all patients)" button at the bottom.

- [ ] **Step 4: Click the button**

Expected: page reloads, sidebar now shows:
- Allergies: Penicillin · Peanuts
- Chronic conditions: Type 2 Diabetes
- Active medications: Metformin 500mg
- Recent visits: 2 entries (2026-04-14 Gastroenteritis, 2026-01-05 Acute upper respiratory infection)

- [ ] **Step 5: Re-click the button — confirm idempotency**

Expected: sidebar unchanged (no duplicate rows).

- [ ] **Step 6: Verify production-safety — disable flag**

Set `cliniflow.dev.seed-demo-enabled=false` (edit dev yml or set env override). Restart backend. Reload the page → log back in. Confirm:
- The seed button is gone.
- `POST /patients/context/seed-demo-all` returns `403`.

---

## Phase C — Wrap-up

### Task 23: Update CLAUDE.md and project docs

**Files:**
- Modify: `CLAUDE.md` (add to the Post-mortem or Architecture index if warranted — check before adding)
- Modify: `docs/details/agent-design.md` (note new routes)

- [ ] **Step 1: Add one-line index entry**

In `docs/details/agent-design.md`, under the routes list, add:
```
- `GET /agents/patient-context/healthz` — Neo4j connectivity probe.
- `GET /agents/patient-context/{id}` — aggregated patient context (allergies/conditions/meds/recent visits).
- `POST /agents/patient-context/seed-demo-bulk` — dev-only bulk demo seeding.
```

- [ ] **Step 2: Commit**

```bash
git add docs/details/agent-design.md CLAUDE.md
git commit -m "docs: index new patient-context routes"
```

---

### Task 24: Final end-to-end sanity pass

- [ ] **Step 1: Run agent full test suite**

```bash
cd agent && pytest
```
Expected: all PASS.

- [ ] **Step 2: Run backend full test suite**

```bash
cd backend && ./mvnw test
```
Expected: all PASS.

- [ ] **Step 3: Run frontend tests + lint + typecheck**

```bash
cd frontend && npm run lint && npm run typecheck && npm test
```
Expected: all PASS.

- [ ] **Step 4: Browser E2E smoke**

Per the post-mortem (`docs/post-mortem/2026-04-22-soap-generate-and-finalize-e2e.md`), unit + integration tests have missed contract bugs in the past. Do a manual run-through:
1. Fresh patient → pre-visit intake (5+ turns) → doctor sees structured summary (no transcript).
2. Doctor's sidebar loads with real data (or, in demo mode, seeds via button).
3. No regressions in Consultation / Report Preview tabs.

- [ ] **Step 5: If all green, proceed to superpowers:finishing-a-development-branch to pick a merge path.**

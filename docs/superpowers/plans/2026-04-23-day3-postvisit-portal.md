# Day 3 — Post-Visit Summary + Patient Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Frontend tasks (Tasks 10–12):** Before writing any `.tsx` in `frontend/app/`, invoke the `frontend-design` skill via the Skill tool — per the user's standing preference (memory `feedback_frontend_design_skill.md`).

**Goal:** On the doctor's review screen, one "Finalize & notify patient" button finalizes the SOAP, persists 0–3 doctor-entered medications, and triggers a single LLM call that rewrites the finalized SOAP into bilingual EN/MS layperson summaries. Patients log in to `/portal`, see a list of their finalized visits, and can open one to read the summary (EN/MS toggle) plus medication list. Raw SOAP is never exposed on the patient side.

**Architecture:** Spring Boot owns the `post_visit_summaries` (1 per visit) and `medications` (N per visit) JPA aggregates under the existing `visit` bounded context. Backend adds one write path (`POST /api/postvisit/{visitId}/generate`) that wraps the full post-visit workflow, and one read path (`GET /api/patient/visits`, `GET /api/patient/visits/{visitId}`). Agent exposes stateless `POST /agents/post-visit/summarize` taking `{soap, medications}` and returning `{summary_en, summary_ms}` via one LLM call in JSON mode. Next.js gets a new `/portal` tree (list + detail with language toggle) and the doctor page gains a medication editor + single merged finalize button.

**Tech Stack:** Spring Boot 3.3 / Java 21 · Spring Data JPA · FastAPI + LangChain-OpenAI · Next.js 14 App Router · React 18. (**Flyway removed** — schema managed manually via Supabase.)

---

## Scope Contract

**In scope:**
- V3 migration: add `summary_en`, `summary_ms` text columns to `post_visit_summaries` (NOT NULL DEFAULT '').
- `PostVisitSummaryModel` + repo.
- `MedicationModel` + repo (existing `medications` table).
- Agent graph `post_visit.summarize(soap, medications) -> {summary_en, summary_ms}` (single LLM call, JSON mode).
- Backend `POST /api/postvisit/{visitId}/generate`: requires visit finalized, upserts meds (replace-all), calls agent, upserts summary.
- Backend `GET /api/patient/visits`, `GET /api/patient/visits/{visitId}` — returns patient-facing view (summary + meds only, never raw SOAP).
- Doctor review screen: medications editor (0–3 rows: name, dosage, frequency) + single "Finalize & notify patient" button that chains finalize → postvisit-generate.
- Patient portal: `/portal` list page, `/portal/visits/[visitId]` detail with EN/MS language toggle.
- Post-login redirect: PATIENT role goes to `/portal` instead of `/previsit/new`; `/portal` has a "Start pre-visit chat" CTA for visits still needing intake.

**Out of scope (later days):**
- Audit-log aspects (Day 5).
- RBAC annotations (`@PreAuthorize`) on the new endpoints — endpoints still require JWT but don't enforce role beyond "is authenticated" (Day 5).
- Graphify entity extraction from the finalized SOAP (Day 4).
- Hermes rule capture on doctor edits (Day 4).
- Real i18n framework (`next-intl`, etc.); language toggle is a local `useState` swap of two strings.
- STT, voice notes, or any audio on the doctor side (Day 5 polish).

**Done means:**
1. Doctor finishes Day-2 SOAP editor, adds 2 medications (e.g., "Paracetamol 500mg / TDS" and "Amoxicillin 500mg / BID"), clicks "Finalize & notify patient".
2. Backend finalizes the visit, persists 2 `medications` rows, calls the agent, persists one `post_visit_summaries` row with non-empty `summary_en` and `summary_ms`.
3. Patient logs in → redirected to `/portal` → sees the finalized visit in the list → clicks it → sees EN summary by default, toggles to MS, sees the 2 medications listed.
4. `curl GET /api/patient/visits` with the patient's JWT returns the visit with `summaryEn` and `summaryMs` populated; `curl GET /api/visits/{id}` still shows the raw SOAP (doctor-side).

---

## File Map

### Backend (Java)

| File | Action | Responsibility |
|---|---|---|
| `backend/src/main/resources/db/migration/V3__post_visit_bilingual.sql` | CREATE | Add `summary_en`, `summary_ms` columns. |
| `domain/biz/visit/model/PostVisitSummaryModel.java` | CREATE | JPA entity for `post_visit_summaries`. |
| `domain/biz/visit/repository/PostVisitSummaryRepository.java` | CREATE | `findByVisitId(UUID)`. |
| `domain/biz/visit/model/MedicationModel.java` | CREATE | JPA entity for `medications`. |
| `domain/biz/visit/repository/MedicationRepository.java` | CREATE | `findByVisitIdOrderByGmtCreate(UUID)`, `deleteByVisitId(UUID)`. |
| `infrastructure/client/AgentServiceClient.java` | MODIFY | Add `callPostVisitSummarize(soap, meds) -> PostVisitResult`. |
| `application/biz/visit/PostVisitWriteAppService.java` | CREATE | `generate(visitId, meds)` → replace-meds + agent call + upsert summary. |
| `application/biz/patient/PatientReadAppService.java` | CREATE | `listForUser(userId)`, `detailForUser(userId, visitId)` — patient-facing, finalized only. |
| `controller/biz/visit/PostVisitController.java` | CREATE | `POST /api/postvisit/{visitId}/generate`. |
| `controller/biz/visit/request/PostVisitGenerateRequest.java` | CREATE | DTO with list of meds. |
| `controller/biz/visit/request/MedicationInput.java` | CREATE | DTO for one med (name, dosage, frequency). |
| `controller/biz/visit/response/PostVisitResponse.java` | CREATE | DTO with summaries + meds. |
| `controller/biz/patient/PatientController.java` | CREATE | `GET /api/patient/visits`, `GET /api/patient/visits/{visitId}`. |
| `controller/biz/patient/response/PatientVisitSummaryResponse.java` | CREATE | List-item DTO. |
| `controller/biz/patient/response/PatientVisitDetailResponse.java` | CREATE | Detail DTO (summary + meds, no SOAP). |

### Agent (Python)

| File | Action | Responsibility |
|---|---|---|
| `agent/app/graphs/post_visit.py` | CREATE | `summarize(soap, medications) -> {summary_en, summary_ms}`. |
| `agent/app/routes/post_visit.py` | REPLACE | Wire `POST /agents/post-visit/summarize` to graph; camelCase aliases. |
| `agent/tests/test_post_visit_graph.py` | CREATE | Happy path + malformed-JSON fallback. |
| `agent/tests/test_post_visit_route.py` | CREATE | Service-token guard + happy path. |

### Frontend (Next.js)

| File | Action | Responsibility |
|---|---|---|
| `frontend/app/doctor/visits/[visitId]/page.tsx` | MODIFY | Medications editor (0–3 rows) + single "Finalize & notify patient" button. |
| `frontend/app/login/page.tsx` | MODIFY | PATIENT post-login redirect → `/portal`. |
| `frontend/app/portal/page.tsx` | CREATE | List patient's visits with "Start pre-visit" CTA. |
| `frontend/app/portal/visits/[visitId]/page.tsx` | CREATE | Summary detail with EN/MS toggle + medications list. |

---

## Task Breakdown

### Task 1: V3 migration — add bilingual summary columns

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__post_visit_bilingual.sql`

- [ ] **Step 1: Create the migration**

```sql
-- V3__post_visit_bilingual.sql
-- Add EN + MS summary columns for the post-visit agent output.
-- Keeps legacy `patient_summary` for backwards compat; unused going forward.

ALTER TABLE post_visit_summaries
    ADD COLUMN summary_en text NOT NULL DEFAULT '',
    ADD COLUMN summary_ms text NOT NULL DEFAULT '';
```

- [ ] **Step 2: Apply the migration manually via Supabase SQL editor**

Flyway is not used. Paste the SQL from `V3__post_visit_bilingual.sql` into the Supabase SQL editor and run it directly.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V3__post_visit_bilingual.sql
git commit -m "feat: V3 migration adds bilingual summary columns"
```

---

### Task 2: `PostVisitSummaryModel` + repository

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/PostVisitSummaryModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/PostVisitSummaryRepository.java`

- [ ] **Step 1: Create `PostVisitSummaryModel.java`**

```java
package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "post_visit_summaries")
public class PostVisitSummaryModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "visit_id", nullable = false, unique = true)
    private UUID visitId;

    @Column(name = "summary_en", nullable = false, columnDefinition = "text")
    private String summaryEn = "";

    @Column(name = "summary_ms", nullable = false, columnDefinition = "text")
    private String summaryMs = "";

    @Column(name = "gmt_create", nullable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false)
    private OffsetDateTime gmtModified;

    @PrePersist
    void onInsert() {
        OffsetDateTime now = OffsetDateTime.now();
        gmtCreate = now;
        gmtModified = now;
    }

    @PreUpdate
    void onUpdate() { gmtModified = OffsetDateTime.now(); }

    public UUID getId() { return id; }
    public UUID getVisitId() { return visitId; }
    public void setVisitId(UUID v) { this.visitId = v; }
    public String getSummaryEn() { return summaryEn; }
    public void setSummaryEn(String v) { this.summaryEn = v == null ? "" : v; }
    public String getSummaryMs() { return summaryMs; }
    public void setSummaryMs(String v) { this.summaryMs = v == null ? "" : v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
```

- [ ] **Step 2: Create `PostVisitSummaryRepository.java`**

```java
package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PostVisitSummaryRepository extends JpaRepository<PostVisitSummaryModel, UUID> {
    Optional<PostVisitSummaryModel> findByVisitId(UUID visitId);
}
```

- [ ] **Step 3: Verify compilation**

Run: `./mvnw -DskipTests compile` (inside `backend/`).
Expected: `BUILD SUCCESS`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/model/PostVisitSummaryModel.java \
        backend/src/main/java/my/cliniflow/domain/biz/visit/repository/PostVisitSummaryRepository.java
git commit -m "feat: PostVisitSummary JPA entity + repo"
```

---

### Task 3: `MedicationModel` + repository

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/MedicationModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/MedicationRepository.java`

- [ ] **Step 1: Create `MedicationModel.java`**

```java
package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "medications")
public class MedicationModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "visit_id", nullable = false)
    private UUID visitId;

    @Column(nullable = false, length = 255)
    private String name = "";

    @Column(nullable = false, length = 128)
    private String dosage = "";

    @Column(nullable = false, length = 128)
    private String frequency = "";

    @Column(name = "duration_days")
    private Integer durationDays;

    @Column(columnDefinition = "text")
    private String instructions;

    @Column(name = "gmt_create", nullable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false)
    private OffsetDateTime gmtModified;

    @PrePersist
    void onInsert() {
        OffsetDateTime now = OffsetDateTime.now();
        gmtCreate = now;
        gmtModified = now;
    }

    @PreUpdate
    void onUpdate() { gmtModified = OffsetDateTime.now(); }

    public UUID getId() { return id; }
    public UUID getVisitId() { return visitId; }
    public void setVisitId(UUID v) { this.visitId = v; }
    public String getName() { return name; }
    public void setName(String v) { this.name = v == null ? "" : v; }
    public String getDosage() { return dosage; }
    public void setDosage(String v) { this.dosage = v == null ? "" : v; }
    public String getFrequency() { return frequency; }
    public void setFrequency(String v) { this.frequency = v == null ? "" : v; }
    public Integer getDurationDays() { return durationDays; }
    public void setDurationDays(Integer v) { this.durationDays = v; }
    public String getInstructions() { return instructions; }
    public void setInstructions(String v) { this.instructions = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
```

- [ ] **Step 2: Create `MedicationRepository.java`**

```java
package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.MedicationModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface MedicationRepository extends JpaRepository<MedicationModel, UUID> {
    List<MedicationModel> findByVisitIdOrderByGmtCreateAsc(UUID visitId);

    @Transactional
    void deleteByVisitId(UUID visitId);
}
```

- [ ] **Step 3: Verify compilation**

Run: `./mvnw -DskipTests compile` (inside `backend/`).
Expected: `BUILD SUCCESS`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/model/MedicationModel.java \
        backend/src/main/java/my/cliniflow/domain/biz/visit/repository/MedicationRepository.java
git commit -m "feat: Medication JPA entity + repo"
```

---

### Task 4: Agent — post-visit summarize graph + tests (TDD)

**Files:**
- Create: `agent/app/graphs/post_visit.py`
- Create: `agent/tests/test_post_visit_graph.py`

- [ ] **Step 1: Write the failing tests**

Create `agent/tests/test_post_visit_graph.py`:

```python
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.graphs import post_visit


SAMPLE_SOAP = {
    "subjective": "Patient reports 3 days of cough and low-grade fever.",
    "objective": "Temp 37.9 C. Clear lungs on auscultation.",
    "assessment": "Viral upper respiratory infection.",
    "plan": "Paracetamol PRN. Fluids. Rest 3 days. Review if worsens.",
}
SAMPLE_MEDS = [
    {"name": "Paracetamol", "dosage": "500 mg", "frequency": "QID PRN"},
]


@pytest.mark.asyncio
async def test_summarize_happy_path() -> None:
    fake = json.dumps(
        {
            "summary_en": "You have a viral infection. Rest and drink fluids.",
            "summary_ms": "Anda mengalami jangkitan virus. Rehat dan minum banyak air.",
        }
    )
    with patch.object(post_visit, "_llm_call", new=AsyncMock(return_value=fake)):
        result = await post_visit.summarize(soap=SAMPLE_SOAP, medications=SAMPLE_MEDS)
    assert result["summary_en"].startswith("You have")
    assert "virus" in result["summary_ms"]
    assert set(result.keys()) == {"summary_en", "summary_ms"}


@pytest.mark.asyncio
async def test_summarize_malformed_json_falls_back_to_empty() -> None:
    with patch.object(post_visit, "_llm_call", new=AsyncMock(return_value="not json")):
        result = await post_visit.summarize(soap=SAMPLE_SOAP, medications=[])
    assert result == {"summary_en": "", "summary_ms": ""}
```

- [ ] **Step 2: Run tests to verify they fail**

From repo root:
```bash
cd agent && /c/Users/shaoxian04/AppData/Local/Programs/Python/Python313/python.exe -m pytest tests/test_post_visit_graph.py -v
```
Expected: `ModuleNotFoundError` or `AttributeError` (`post_visit.summarize` doesn't exist yet).

- [ ] **Step 3: Create `agent/app/graphs/post_visit.py`**

```python
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.openai_client import get_chat_model

SUMMARY_KEYS = ("summary_en", "summary_ms")

_SYSTEM_PROMPT = """You are a clinical scribe writing a patient-friendly post-visit summary.
Rewrite the SOAP note in plain language at a Primary-6 reading level, in BOTH English and Malay.
Include clear guidance on any prescribed medications (name, dose, how to take them).
Output ONLY a single JSON object with exactly these keys: summary_en, summary_ms.
Each value is a plain-text paragraph (no markdown, no bullet lists, no commentary)."""


async def _llm_call(system: str, user: str) -> str:
    model = get_chat_model()
    resp = await model.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
    return resp.content if isinstance(resp.content, str) else str(resp.content)


async def summarize(soap: dict[str, Any], medications: list[dict[str, Any]]) -> dict[str, str]:
    user = (
        f"SOAP note (JSON): {json.dumps(soap, ensure_ascii=False)}\n\n"
        f"Prescribed medications (JSON): {json.dumps(medications, ensure_ascii=False)}\n\n"
        "Return the JSON summary now."
    )
    raw = await _llm_call(_SYSTEM_PROMPT, user)
    try:
        data = json.loads(raw)
        return {k: str(data.get(k, "")) for k in SUMMARY_KEYS}
    except (json.JSONDecodeError, TypeError):
        return {k: "" for k in SUMMARY_KEYS}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd agent && /c/Users/shaoxian04/AppData/Local/Programs/Python/Python313/python.exe -m pytest tests/test_post_visit_graph.py -v
```
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add agent/app/graphs/post_visit.py agent/tests/test_post_visit_graph.py
git commit -m "feat: post-visit summarize graph with bilingual output"
```

---

### Task 5: Agent — wire up `POST /agents/post-visit/summarize` + tests

**Files:**
- Modify: `agent/app/routes/post_visit.py` (REPLACE the current `NotImplementedError` stub)
- Create: `agent/tests/test_post_visit_route.py`

- [ ] **Step 1: Write the failing route test**

Create `agent/tests/test_post_visit_route.py`:

```python
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_post_visit_summarize_requires_service_token() -> None:
    r = client.post("/agents/post-visit/summarize", json={"visitId": "v1"})
    assert r.status_code in (401, 403)


def test_post_visit_summarize_happy_path() -> None:
    fake = {"summary_en": "Plain EN.", "summary_ms": "Melayu ringkas."}
    with patch("app.routes.post_visit.summarize", new=AsyncMock(return_value=fake)):
        r = client.post(
            "/agents/post-visit/summarize",
            headers={"X-Service-Token": "change-me"},
            json={
                "visitId": "v1",
                "soap": {
                    "subjective": "s", "objective": "o",
                    "assessment": "a", "plan": "p",
                },
                "medications": [
                    {"name": "Paracetamol", "dosage": "500 mg", "frequency": "QID"}
                ],
            },
        )
    assert r.status_code == 200
    body = r.json()
    assert body["visitId"] == "v1"
    assert body["summaryEn"] == "Plain EN."
    assert body["summaryMs"] == "Melayu ringkas."
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd agent && /c/Users/shaoxian04/AppData/Local/Programs/Python/Python313/python.exe -m pytest tests/test_post_visit_route.py -v
```
Expected: token test passes (already 401), happy path fails (`NotImplementedError`).

- [ ] **Step 3: Replace `agent/app/routes/post_visit.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.graphs.post_visit import summarize

router = APIRouter()


class Soap(BaseModel):
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""


class Medication(BaseModel):
    name: str
    dosage: str
    frequency: str


class PostVisitSummarizeRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    visit_id: str
    soap: Soap = Field(default_factory=Soap)
    medications: list[Medication] = Field(default_factory=list)


class PostVisitSummarizeResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    visit_id: str
    summary_en: str
    summary_ms: str


@router.post("/summarize", response_model=PostVisitSummarizeResponse, response_model_by_alias=True)
async def summarize_route(req: PostVisitSummarizeRequest) -> PostVisitSummarizeResponse:
    out = await summarize(
        soap=req.soap.model_dump(),
        medications=[m.model_dump() for m in req.medications],
    )
    return PostVisitSummarizeResponse(
        visit_id=req.visit_id,
        summary_en=out["summary_en"],
        summary_ms=out["summary_ms"],
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd agent && /c/Users/shaoxian04/AppData/Local/Programs/Python/Python313/python.exe -m pytest tests/test_post_visit_route.py -v
```
Expected: `2 passed`.

- [ ] **Step 5: Also run full agent suite to check no regressions**

```bash
cd agent && /c/Users/shaoxian04/AppData/Local/Programs/Python/Python313/python.exe -m pytest -v
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add agent/app/routes/post_visit.py agent/tests/test_post_visit_route.py
git commit -m "feat: wire POST /agents/post-visit/summarize"
```

---

### Task 6: Extend `AgentServiceClient` with `callPostVisitSummarize`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java`

- [ ] **Step 1: Add the method and DTOs**

Append to `AgentServiceClient.java` (above the final `}`):

```java
    public PostVisitResult callPostVisitSummarize(
        UUID visitId,
        String subjective, String objective, String assessment, String plan,
        List<MedicationView> medications
    ) {
        PostVisitSummarizeRequest req = new PostVisitSummarizeRequest(
            visitId.toString(),
            new SoapBody(nz(subjective), nz(objective), nz(assessment), nz(plan)),
            medications == null ? List.of() : medications
        );
        PostVisitSummarizeResponse resp = withCorrelation(client.post().uri("/agents/post-visit/summarize"))
            .bodyValue(req)
            .retrieve()
            .bodyToMono(PostVisitSummarizeResponse.class)
            .block();
        if (resp == null) return new PostVisitResult("", "");
        return new PostVisitResult(nz(resp.summaryEn()), nz(resp.summaryMs()));
    }

    private static String nz(String s) { return s == null ? "" : s; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PostVisitSummarizeRequest(String visitId, SoapBody soap, List<MedicationView> medications) {}

    public record SoapBody(String subjective, String objective, String assessment, String plan) {}

    public record MedicationView(String name, String dosage, String frequency) {}

    public record PostVisitSummarizeResponse(String visitId, String summaryEn, String summaryMs) {}

    public record PostVisitResult(String summaryEn, String summaryMs) {}
```

Add the import at the top if not already present:
```java
import java.util.List;
```

- [ ] **Step 2: Verify compilation**

Run: `./mvnw -DskipTests compile` (inside `backend/`).
Expected: `BUILD SUCCESS`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java
git commit -m "feat: AgentServiceClient.callPostVisitSummarize"
```

---

### Task 7: `PostVisitWriteAppService`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/PostVisitWriteAppService.java`

- [ ] **Step 1: Create the service**

```java
package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.PostVisitSummaryRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class PostVisitWriteAppService {

    public record MedicationInput(String name, String dosage, String frequency) {}

    public record PostVisitResult(
        PostVisitSummaryModel summary,
        List<MedicationModel> medications
    ) {}

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final MedicationRepository meds;
    private final PostVisitSummaryRepository summaries;
    private final AgentServiceClient agent;

    public PostVisitWriteAppService(
        VisitRepository visits,
        MedicalReportRepository reports,
        MedicationRepository meds,
        PostVisitSummaryRepository summaries,
        AgentServiceClient agent
    ) {
        this.visits = visits;
        this.reports = reports;
        this.meds = meds;
        this.summaries = summaries;
        this.agent = agent;
    }

    @Transactional
    public PostVisitResult generate(UUID visitId, List<MedicationInput> medInputs) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        if (v.getStatus() != VisitStatus.FINALIZED) {
            throw new IllegalStateException("visit must be FINALIZED before post-visit generation: " + visitId);
        }
        MedicalReportModel report = reports.findByVisitId(visitId).orElseThrow(
            () -> new IllegalArgumentException("no medical report for visit: " + visitId));
        if (!report.isFinalized()) {
            throw new IllegalStateException("medical report must be finalized: " + visitId);
        }
        if (medInputs != null && medInputs.size() > 3) {
            throw new IllegalArgumentException("max 3 medications allowed, got " + medInputs.size());
        }

        // Replace-all medications for this visit.
        meds.deleteByVisitId(visitId);
        List<MedicationModel> saved = new ArrayList<>();
        if (medInputs != null) {
            for (MedicationInput in : medInputs) {
                if (in.name() == null || in.name().isBlank()) continue;
                MedicationModel m = new MedicationModel();
                m.setVisitId(visitId);
                m.setName(in.name().trim());
                m.setDosage(in.dosage() == null ? "" : in.dosage().trim());
                m.setFrequency(in.frequency() == null ? "" : in.frequency().trim());
                saved.add(meds.save(m));
            }
        }

        List<AgentServiceClient.MedicationView> medViews = saved.stream()
            .map(m -> new AgentServiceClient.MedicationView(m.getName(), m.getDosage(), m.getFrequency()))
            .toList();

        AgentServiceClient.PostVisitResult agentOut = agent.callPostVisitSummarize(
            visitId,
            report.getSubjective(), report.getObjective(),
            report.getAssessment(), report.getPlan(),
            medViews
        );

        PostVisitSummaryModel summary = summaries.findByVisitId(visitId).orElseGet(() -> {
            PostVisitSummaryModel s = new PostVisitSummaryModel();
            s.setVisitId(visitId);
            return s;
        });
        summary.setSummaryEn(agentOut.summaryEn());
        summary.setSummaryMs(agentOut.summaryMs());
        summary = summaries.save(summary);

        return new PostVisitResult(summary, saved);
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `./mvnw -DskipTests compile` (inside `backend/`).
Expected: `BUILD SUCCESS`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/application/biz/visit/PostVisitWriteAppService.java
git commit -m "feat: PostVisitWriteAppService generates bilingual summary"
```

---

### Task 8: `PostVisitController` + request/response DTOs

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/request/MedicationInput.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/request/PostVisitGenerateRequest.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/response/PostVisitResponse.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/PostVisitController.java`

- [ ] **Step 1: Create `MedicationInput.java`**

```java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record MedicationInput(
    @NotBlank String name,
    @NotBlank String dosage,
    @NotBlank String frequency
) {}
```

- [ ] **Step 2: Create `PostVisitGenerateRequest.java`**

```java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;

public record PostVisitGenerateRequest(
    @Valid
    @Size(max = 3, message = "at most 3 medications")
    List<MedicationInput> medications
) {}
```

- [ ] **Step 3: Create `PostVisitResponse.java`**

```java
package my.cliniflow.controller.biz.visit.response;

import java.util.List;
import java.util.UUID;

public record PostVisitResponse(
    UUID visitId,
    String summaryEn,
    String summaryMs,
    List<Medication> medications
) {
    public record Medication(UUID id, String name, String dosage, String frequency) {}
}
```

- [ ] **Step 4: Create `PostVisitController.java`**

```java
package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.PostVisitWriteAppService;
import my.cliniflow.application.biz.visit.PostVisitWriteAppService.MedicationInput;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.request.PostVisitGenerateRequest;
import my.cliniflow.controller.biz.visit.response.PostVisitResponse;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/postvisit")
public class PostVisitController {

    private final PostVisitWriteAppService svc;

    public PostVisitController(PostVisitWriteAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/{visitId}/generate")
    public WebResult<PostVisitResponse> generate(
        @PathVariable UUID visitId,
        @Valid @RequestBody PostVisitGenerateRequest req
    ) {
        List<MedicationInput> inputs = req.medications() == null ? List.of() :
            req.medications().stream()
                .map(m -> new MedicationInput(m.name(), m.dosage(), m.frequency()))
                .toList();
        PostVisitWriteAppService.PostVisitResult result = svc.generate(visitId, inputs);
        return WebResult.ok(toResponse(visitId, result.summary(), result.medications()));
    }

    private static PostVisitResponse toResponse(UUID visitId, PostVisitSummaryModel s, List<MedicationModel> meds) {
        List<PostVisitResponse.Medication> medDtos = meds.stream()
            .map(m -> new PostVisitResponse.Medication(m.getId(), m.getName(), m.getDosage(), m.getFrequency()))
            .toList();
        return new PostVisitResponse(visitId, s.getSummaryEn(), s.getSummaryMs(), medDtos);
    }
}
```

- [ ] **Step 5: Verify compilation**

Run: `./mvnw -DskipTests compile` (inside `backend/`).
Expected: `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/visit/request/MedicationInput.java \
        backend/src/main/java/my/cliniflow/controller/biz/visit/request/PostVisitGenerateRequest.java \
        backend/src/main/java/my/cliniflow/controller/biz/visit/response/PostVisitResponse.java \
        backend/src/main/java/my/cliniflow/controller/biz/visit/PostVisitController.java
git commit -m "feat: POST /api/postvisit/{visitId}/generate"
```

---

### Task 9: Patient-facing read API (`PatientReadAppService` + `PatientController`)

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/patient/PatientController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/patient/response/PatientVisitSummaryResponse.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/patient/response/PatientVisitDetailResponse.java`

- [ ] **Step 1: Create `PatientVisitSummaryResponse.java`**

```java
package my.cliniflow.controller.biz.patient.response;

import java.time.OffsetDateTime;
import java.util.UUID;

public record PatientVisitSummaryResponse(
    UUID visitId,
    OffsetDateTime finalizedAt,
    String summaryEnPreview,
    int medicationCount
) {}
```

- [ ] **Step 2: Create `PatientVisitDetailResponse.java`**

```java
package my.cliniflow.controller.biz.patient.response;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record PatientVisitDetailResponse(
    UUID visitId,
    OffsetDateTime finalizedAt,
    String summaryEn,
    String summaryMs,
    List<Medication> medications
) {
    public record Medication(String name, String dosage, String frequency) {}
}
```

- [ ] **Step 3: Extend `PatientRepository`**

Replace `backend/src/main/java/my/cliniflow/domain/biz/patient/repository/PatientRepository.java`:

```java
package my.cliniflow.domain.biz.patient.repository;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PatientRepository extends JpaRepository<PatientModel, UUID> {
    Optional<PatientModel> findByUserId(UUID userId);
}
```

- [ ] **Step 4: Extend `VisitRepository`**

Append to `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/VisitRepository.java` interface body (before the closing `}`):

```java
    List<VisitModel> findByPatientIdAndStatusOrderByFinalizedAtDesc(UUID patientId, VisitStatus status);
```

- [ ] **Step 5: Create `PatientReadAppService.java`**

```java
package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.biz.patient.response.PatientVisitDetailResponse;
import my.cliniflow.controller.biz.patient.response.PatientVisitSummaryResponse;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.PostVisitSummaryRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class PatientReadAppService {

    private static final int PREVIEW_LEN = 160;

    private final PatientRepository patients;
    private final VisitRepository visits;
    private final PostVisitSummaryRepository summaries;
    private final MedicationRepository meds;

    public PatientReadAppService(
        PatientRepository patients,
        VisitRepository visits,
        PostVisitSummaryRepository summaries,
        MedicationRepository meds
    ) {
        this.patients = patients;
        this.visits = visits;
        this.summaries = summaries;
        this.meds = meds;
    }

    public List<PatientVisitSummaryResponse> listForUser(UUID userId) {
        PatientModel p = patients.findByUserId(userId).orElse(null);
        if (p == null) return List.of();
        return visits.findByPatientIdAndStatusOrderByFinalizedAtDesc(p.getId(), VisitStatus.FINALIZED).stream()
            .map(v -> {
                PostVisitSummaryModel s = summaries.findByVisitId(v.getId()).orElse(null);
                int medCount = meds.findByVisitIdOrderByGmtCreateAsc(v.getId()).size();
                String preview = s == null ? "" : truncate(s.getSummaryEn(), PREVIEW_LEN);
                return new PatientVisitSummaryResponse(v.getId(), v.getFinalizedAt(), preview, medCount);
            })
            .toList();
    }

    public PatientVisitDetailResponse detailForUser(UUID userId, UUID visitId) {
        PatientModel p = patients.findByUserId(userId).orElseThrow(
            () -> new IllegalArgumentException("no patient profile for user: " + userId));
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        if (!p.getId().equals(v.getPatientId())) {
            throw new IllegalArgumentException("visit does not belong to this patient");
        }
        if (v.getStatus() != VisitStatus.FINALIZED) {
            throw new IllegalStateException("visit is not finalized yet");
        }
        PostVisitSummaryModel s = summaries.findByVisitId(visitId).orElse(null);
        List<MedicationModel> ms = meds.findByVisitIdOrderByGmtCreateAsc(visitId);
        List<PatientVisitDetailResponse.Medication> medDtos = ms.stream()
            .map(m -> new PatientVisitDetailResponse.Medication(m.getName(), m.getDosage(), m.getFrequency()))
            .toList();
        return new PatientVisitDetailResponse(
            v.getId(),
            v.getFinalizedAt(),
            s == null ? "" : s.getSummaryEn(),
            s == null ? "" : s.getSummaryMs(),
            medDtos
        );
    }

    private static String truncate(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }
}
```

- [ ] **Step 6: Create `PatientController.java`**

```java
package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.patient.response.PatientVisitDetailResponse;
import my.cliniflow.controller.biz.patient.response.PatientVisitSummaryResponse;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/patient")
public class PatientController {

    private final PatientReadAppService reads;

    public PatientController(PatientReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping("/visits")
    public WebResult<List<PatientVisitSummaryResponse>> list(Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(reads.listForUser(userId));
    }

    @GetMapping("/visits/{visitId}")
    public WebResult<PatientVisitDetailResponse> detail(@PathVariable UUID visitId, Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(reads.detailForUser(userId, visitId));
    }
}
```

- [ ] **Step 7: Verify compilation**

Run: `./mvnw -DskipTests compile` (inside `backend/`).
Expected: `BUILD SUCCESS`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/my/cliniflow/application/biz/patient/ \
        backend/src/main/java/my/cliniflow/controller/biz/patient/ \
        backend/src/main/java/my/cliniflow/domain/biz/patient/repository/PatientRepository.java \
        backend/src/main/java/my/cliniflow/domain/biz/visit/repository/VisitRepository.java
git commit -m "feat: patient portal read API (list + detail, finalized only)"
```

---

### Task 10: Doctor review page — medication editor + merged finalize button

**⚠️ Before starting Task 10, invoke the `frontend-design` skill via the Skill tool** (per memory `feedback_frontend_design_skill.md`).

**Files:**
- Modify: `frontend/app/doctor/visits/[visitId]/page.tsx`

- [ ] **Step 1: Replace the file with the updated version**

Full contents of `frontend/app/doctor/visits/[visitId]/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { getUser } from "@/lib/auth";

type Soap = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  finalized: boolean;
  aiDraftHash: string | null;
};

type VisitDetail = {
  visitId: string;
  patientId: string;
  patientName: string;
  status: string;
  preVisitStructured: Record<string, unknown>;
  soap: Soap;
  createdAt: string;
  finalizedAt: string | null;
};

type MedRow = { name: string; dosage: string; frequency: string };

type PostVisitResponse = {
  visitId: string;
  summaryEn: string;
  summaryMs: string;
  medications: { id: string; name: string; dosage: string; frequency: string }[];
};

const EMPTY_MED: MedRow = { name: "", dosage: "", frequency: "" };

export default function VisitDetailPage() {
  const router = useRouter();
  const params = useParams<{ visitId: string }>();
  const visitId = params.visitId;
  const [detail, setDetail] = useState<VisitDetail | null>(null);
  const [transcript, setTranscript] = useState("");
  const [soap, setSoap] = useState<Soap>({
    subjective: "", objective: "", assessment: "", plan: "",
    finalized: false, aiDraftHash: null,
  });
  const [meds, setMeds] = useState<MedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAiDraft, setHasAiDraft] = useState(false);
  const [notified, setNotified] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "DOCTOR") { router.replace("/login"); return; }
    apiGet<VisitDetail>(`/visits/${visitId}`)
      .then((d) => {
        setDetail(d);
        setSoap(d.soap);
        setHasAiDraft(!!d.soap.aiDraftHash);
      })
      .catch((e) => setError(e.message));
  }, [visitId, router]);

  async function onGenerate() {
    if (!transcript.trim()) { setError("Transcript is required"); return; }
    setBusy(true); setError(null);
    try {
      const s = await apiPost<Soap>(`/visits/${visitId}/soap/generate`, { transcript });
      setSoap(s); setHasAiDraft(true);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onSaveDraft() {
    setBusy(true); setError(null);
    try {
      const s = await apiPut<Soap>(`/visits/${visitId}/soap`, soap);
      setSoap(s);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  function addMed() {
    if (meds.length >= 3) return;
    setMeds([...meds, { ...EMPTY_MED }]);
  }

  function updateMed(idx: number, patch: Partial<MedRow>) {
    setMeds(meds.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  function removeMed(idx: number) {
    setMeds(meds.filter((_, i) => i !== idx));
  }

  async function onFinalizeAndNotify() {
    if (!soap.subjective.trim() || !soap.objective.trim() || !soap.assessment.trim() || !soap.plan.trim()) {
      setError("All 4 SOAP sections must be non-empty to finalize");
      return;
    }
    for (const m of meds) {
      if (!m.name.trim() || !m.dosage.trim() || !m.frequency.trim()) {
        setError("Each medication needs name, dosage, and frequency (or remove the row)");
        return;
      }
    }
    if (!confirm("Finalize this SOAP and notify the patient? The record will be locked.")) return;
    setBusy(true); setError(null); setNotified(false);
    try {
      const s = await apiPost<Soap>(`/visits/${visitId}/soap/finalize`, soap);
      setSoap(s);
      const postVisit = await apiPost<PostVisitResponse>(`/postvisit/${visitId}/generate`, { medications: meds });
      setNotified(postVisit.summaryEn.length > 0 || postVisit.summaryMs.length > 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <div style={{ padding: 24 }}>Loading…</div>;

  const fields = (detail.preVisitStructured?.fields ?? {}) as Record<string, unknown>;
  const locked = soap.finalized;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Visit — {detail.patientName}</h1>
      <p>Status: <strong>{detail.status}</strong> · Visit ID: <code>{detail.visitId}</code></p>

      <section style={{ background: "#f4f4f8", padding: 12, borderRadius: 6, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Pre-visit intake</h3>
        {Object.keys(fields).length === 0 ? (
          <p style={{ color: "#666" }}>No pre-visit data captured.</p>
        ) : (
          <ul>
            {Object.entries(fields).map(([k, v]) => (
              <li key={k}><strong>{k}:</strong> {String(v)}</li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Consultation transcript</h3>
        <textarea
          rows={6}
          style={{ width: "100%", fontFamily: "inherit", padding: 8 }}
          placeholder="Paste the consultation transcript here…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={locked}
        />
        <button onClick={onGenerate} disabled={busy || locked} style={{ marginTop: 8 }}>
          {busy ? "Generating…" : "Generate SOAP"}
        </button>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>
          SOAP note {hasAiDraft && !locked && <span style={{ color: "#b36b00", fontSize: 14 }}>(AI draft — review before finalizing)</span>}
          {locked && <span style={{ color: "green", fontSize: 14 }}> ✓ Finalized</span>}
        </h3>
        {(["subjective", "objective", "assessment", "plan"] as const).map((k) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: "bold", textTransform: "capitalize" }}>{k}</label>
            <textarea
              rows={3}
              style={{ width: "100%", padding: 8, fontFamily: "inherit", background: locked ? "#f7f7f7" : "white" }}
              value={soap[k]}
              onChange={(e) => setSoap({ ...soap, [k]: e.target.value })}
              disabled={locked}
            />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSaveDraft} disabled={busy || locked || !hasAiDraft}>Save draft</button>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h3>Medications ({meds.length}/3)</h3>
        {meds.length === 0 && <p style={{ color: "#666" }}>No medications. Click "Add medication" to add up to 3.</p>}
        {meds.map((m, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Name (e.g. Paracetamol)"
              value={m.name}
              onChange={(e) => updateMed(i, { name: e.target.value })}
              disabled={locked}
              style={{ padding: 6 }}
            />
            <input
              placeholder="Dosage (e.g. 500 mg)"
              value={m.dosage}
              onChange={(e) => updateMed(i, { dosage: e.target.value })}
              disabled={locked}
              style={{ padding: 6 }}
            />
            <input
              placeholder="Frequency (e.g. TDS)"
              value={m.frequency}
              onChange={(e) => updateMed(i, { frequency: e.target.value })}
              disabled={locked}
              style={{ padding: 6 }}
            />
            <button onClick={() => removeMed(i)} disabled={locked}>Remove</button>
          </div>
        ))}
        <button onClick={addMed} disabled={locked || meds.length >= 3}>Add medication</button>
      </section>

      <section style={{ marginTop: 20 }}>
        <button
          onClick={onFinalizeAndNotify}
          disabled={busy || locked || !hasAiDraft}
          style={{ background: "#0070f3", color: "white", padding: "10px 16px", fontSize: 15 }}
        >
          {busy ? "Finalizing…" : "Finalize & notify patient"}
        </button>
        {notified && (
          <p style={{ color: "green", marginTop: 8 }}>
            ✓ Patient notified — summary published to their portal.
          </p>
        )}
      </section>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>Error: {error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` (inside `frontend/`).
Expected: no errors.

- [ ] **Step 3: Verify lint**

Run: `npm run lint` (inside `frontend/`).
Expected: no errors (warnings OK).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/page.tsx
git commit -m "feat(frontend): medication editor + finalize-and-notify on doctor review"
```

---

### Task 11: Patient portal — list + detail with EN/MS toggle

**⚠️ Before starting Task 11, invoke the `frontend-design` skill via the Skill tool** (per memory `feedback_frontend_design_skill.md`).

**Files:**
- Create: `frontend/app/portal/page.tsx`
- Create: `frontend/app/portal/visits/[visitId]/page.tsx`

- [ ] **Step 1: Create `frontend/app/portal/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

type VisitSummary = {
  visitId: string;
  finalizedAt: string | null;
  summaryEnPreview: string;
  medicationCount: number;
};

export default function PortalHome() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "PATIENT") { router.replace("/login"); return; }
    apiGet<VisitSummary[]>(`/patient/visits`)
      .then((v) => { setVisits(v); setLoaded(true); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  }, [router]);

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <h1>My visits</h1>
      <p style={{ color: "#555" }}>
        Your finalized consultation summaries appear here.{" "}
        <Link href="/previsit/new">Start a new pre-visit chat →</Link>
      </p>

      {!loaded && <p>Loading…</p>}
      {loaded && visits.length === 0 && (
        <div style={{ padding: 16, background: "#f4f4f8", borderRadius: 6 }}>
          <p style={{ margin: 0 }}>No finalized visits yet.</p>
          <p style={{ margin: "6px 0 0", color: "#666" }}>
            Once your doctor finalizes a visit, its summary will show up here.
          </p>
        </div>
      )}

      {visits.map((v) => (
        <Link
          key={v.visitId}
          href={`/portal/visits/${v.visitId}`}
          style={{
            display: "block",
            padding: 16,
            border: "1px solid #e3e3e8",
            borderLeft: "4px solid #10b981",
            borderRadius: 6,
            marginBottom: 12,
            textDecoration: "none",
            color: "inherit",
            background: "white",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <strong>Visit {v.visitId.slice(0, 8)}…</strong>
            <span style={{ color: "#666", fontSize: 13 }}>
              {v.finalizedAt ? new Date(v.finalizedAt).toLocaleString() : "—"}
            </span>
          </div>
          <div style={{ color: "#333", fontSize: 14 }}>{v.summaryEnPreview || "(no summary yet)"}</div>
          <div style={{ color: "#666", fontSize: 13, marginTop: 6 }}>
            {v.medicationCount} medication{v.medicationCount === 1 ? "" : "s"}
          </div>
        </Link>
      ))}

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/app/portal/visits/[visitId]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

type Detail = {
  visitId: string;
  finalizedAt: string | null;
  summaryEn: string;
  summaryMs: string;
  medications: { name: string; dosage: string; frequency: string }[];
};

export default function PortalVisitDetail() {
  const router = useRouter();
  const params = useParams<{ visitId: string }>();
  const visitId = params.visitId;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user || user.role !== "PATIENT") { router.replace("/login"); return; }
    apiGet<Detail>(`/patient/visits/${visitId}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [visitId, router]);

  if (error) return <div style={{ padding: 24, color: "crimson" }}>Error: {error}</div>;
  if (!detail) return <div style={{ padding: 24 }}>Loading…</div>;

  const body = lang === "en" ? detail.summaryEn : detail.summaryMs;

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <Link href="/portal" style={{ color: "#0070f3" }}>&larr; Back to my visits</Link>
      <h1 style={{ marginTop: 12 }}>Your visit summary</h1>
      <p style={{ color: "#666" }}>
        Finalized {detail.finalizedAt ? new Date(detail.finalizedAt).toLocaleString() : "—"}
      </p>

      <div role="tablist" style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <button
          role="tab"
          aria-selected={lang === "en"}
          onClick={() => setLang("en")}
          style={{
            padding: "6px 12px",
            background: lang === "en" ? "#0070f3" : "#eee",
            color: lang === "en" ? "white" : "#333",
            border: 0, borderRadius: 4,
          }}
        >English</button>
        <button
          role="tab"
          aria-selected={lang === "ms"}
          onClick={() => setLang("ms")}
          style={{
            padding: "6px 12px",
            background: lang === "ms" ? "#0070f3" : "#eee",
            color: lang === "ms" ? "white" : "#333",
            border: 0, borderRadius: 4,
          }}
        >Bahasa Melayu</button>
      </div>

      <section style={{
        padding: 16, background: "#f8fafb",
        borderLeft: "4px solid #10b981", borderRadius: 6,
        whiteSpace: "pre-wrap", lineHeight: 1.6,
      }}>
        {body || "(summary not yet generated)"}
      </section>

      <section style={{ marginTop: 20 }}>
        <h3>Medications</h3>
        {detail.medications.length === 0 ? (
          <p style={{ color: "#666" }}>No medications prescribed.</p>
        ) : (
          <ul>
            {detail.medications.map((m, i) => (
              <li key={i}>
                <strong>{m.name}</strong> — {m.dosage}, {m.frequency}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck` (inside `frontend/`).
Expected: no errors.

- [ ] **Step 4: Verify lint**

Run: `npm run lint` (inside `frontend/`).
Expected: no errors (warnings OK).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/portal
git commit -m "feat(frontend): patient portal list + detail with EN/MS toggle"
```

---

### Task 12: Post-login redirect — PATIENT → `/portal`

**Files:**
- Modify: `frontend/app/login/page.tsx` (only the redirect line)

- [ ] **Step 1: Edit `frontend/app/login/page.tsx`**

In the `onSubmit` function, replace:
```tsx
if (user.role === "PATIENT") router.replace("/previsit/new");
```
with:
```tsx
if (user.role === "PATIENT") router.replace("/portal");
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` (inside `frontend/`).
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/login/page.tsx
git commit -m "feat(frontend): patient login redirects to /portal"
```

---

### Task 13: End-to-end smoke test (manual Playwright walkthrough)

No files. Validate the full Day-3 flow in a browser.

- [ ] **Step 1: Start all services**

Three terminals, each exporting the env vars from `.env` (or use the earlier Day-2 launch commands):

```bash
# Terminal 1 — backend
cd backend && SPRING_PROFILES_ACTIVE=local AGENT_SERVICE_TOKEN=change-me AGENT_SERVICE_URL=http://localhost:8000 ./mvnw spring-boot:run

# Terminal 2 — agent (from repo root so root .env loads)
/c/Users/shaoxian04/AppData/Local/Programs/Python/Python313/python.exe -m uvicorn app.main:app --app-dir agent --reload --port 8000

# Terminal 3 — frontend
cd frontend && npm run dev
```

Wait for: backend "Started CliniflowApplication", agent "Uvicorn running on http://0.0.0.0:8000", frontend "Ready on http://localhost:3000".

- [ ] **Step 2: Patient pre-visit turn (if no existing in-progress visit)**

1. Open `http://localhost:3000/login`, log in as `patient@demo.local` / `password`.
2. Expect redirect to `/portal`. List is empty or shows past visits only.
3. Click "Start a new pre-visit chat →", answer all 5 questions.
4. Confirm the done-state message appears.

- [ ] **Step 3: Doctor SOAP generation**

1. In a private/incognito window, log in as `doctor@demo.local` / `password`.
2. Click into the newly-created visit.
3. Paste this transcript and click "Generate SOAP":
   ```
   Patient reports 3 days of productive cough with low-grade fever.
   Vitals: T 37.8 C, HR 88, BP 118/74. Lungs clear on auscultation.
   Assessment: viral URI. Plan: rest, fluids, paracetamol PRN, review if worsens.
   ```
4. Add 2 medications:
   - Paracetamol / 500 mg / QID PRN
   - Amoxicillin / 500 mg / TDS
5. Click "Finalize & notify patient". Accept the browser confirm dialog.
6. Expect green "✓ Patient notified" message.

- [ ] **Step 4: Verify backend state via API**

Get the patient's JWT from the browser's localStorage (`auth.token`) and query:

```bash
curl -s http://localhost:8080/api/patient/visits \
  -H "Authorization: Bearer <PATIENT_JWT>" | jq
```
Expected: array with at least one visit, `summaryEnPreview` non-empty, `medicationCount: 2`.

```bash
curl -s http://localhost:8080/api/patient/visits/<VISIT_ID> \
  -H "Authorization: Bearer <PATIENT_JWT>" | jq
```
Expected: `summaryEn` and `summaryMs` are non-empty paragraphs, `medications` array has 2 entries.

- [ ] **Step 5: Verify patient UI**

1. Return to the patient window; navigate to `http://localhost:3000/portal`.
2. See the newly-finalized visit at the top with a green left-border card.
3. Click it. See EN summary by default.
4. Click "Bahasa Melayu" tab. Body text swaps to Malay content.
5. See both medications listed with name, dosage, frequency.

- [ ] **Step 6: Verify DB invariants (optional but recommended)**

Connect to Postgres (Supabase dashboard or psql):

```sql
SELECT id, visit_id, left(summary_en, 60) AS en, left(summary_ms, 60) AS ms
FROM post_visit_summaries WHERE visit_id = '<VISIT_ID>';
-- exactly 1 row, both summaries non-empty

SELECT name, dosage, frequency FROM medications
WHERE visit_id = '<VISIT_ID>' ORDER BY gmt_create;
-- exactly 2 rows
```

- [ ] **Step 7: If everything green, mark Day 3 complete**

No commit needed — validation only. If any step fails, diagnose and fix via an implementer subagent re-dispatch on the failing task.

---

## Acceptance Checklist (tick before moving to Day 4)

- [ ] V3 migration ran on boot; `post_visit_summaries` has `summary_en` + `summary_ms`.
- [ ] `agent pytest` passes (pre-visit + soap + post-visit all green).
- [ ] `./mvnw test` passes (or at least compiles — Day 3 adds no new backend tests beyond compile-time).
- [ ] Doctor "Finalize & notify patient" button succeeds on a transcript + 2 meds.
- [ ] `/api/patient/visits` returns the finalized visit; raw SOAP is NOT in the response.
- [ ] Patient portal EN/MS toggle swaps the summary body.
- [ ] Hard safety invariants intact:
  - Doctor-in-the-loop: SOAP still requires explicit finalize click (unchanged).
  - Frontend → backend only: `/portal` calls `/api/patient/...`, never the agent directly.
  - Audit log untouched (Day 5 work).
  - No learned style rules yet (Day 4 work).

---

## Notes for the executor

- **Hermes gap is intentional.** Day 3 finalizes without firing any rule-feedback call. Day 4's Hermes task will wrap the existing finalize path.
- **Replace-all medications.** Doctor editing meds after finalize is out of scope — once finalized, the doctor page is read-only. So `deleteByVisitId` + insert is safe and simpler than per-row diffing.
- **Why bilingual columns, not JSON blob.** SAD data-model expects explicit columns for queryable fields. A JSON wrapper would hide the MS column from future audit dashboards.
- **Why the patient endpoint hides SOAP.** PRD + safety invariant: patients never see raw clinical notes, only the rewritten layperson summary. Putting this on the server side (different DTO) prevents accidental frontend leakage.

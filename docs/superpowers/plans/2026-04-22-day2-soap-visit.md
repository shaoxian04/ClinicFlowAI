# Day 2 — Visit Capture + SOAP Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doctor opens a pending visit, sees the pre-visit intake, pastes a consultation transcript, the agent generates a SOAP draft, the doctor edits it, and clicks "Finalize" — visit moves to FINALIZED and the `medical_reports` row is locked with `is_finalized=true`, `finalized_by=<doctor uuid>`, `finalized_at=<now>`.

**Architecture:** Spring Boot owns the `medical_reports` aggregate (one per visit, UNIQUE visit_id) and orchestrates the SOAP agent call. Agent service exposes a stateless `POST /agents/visit/generate` that takes `{pre_visit, transcript}` and returns `{subjective, objective, assessment, plan}` via a single LLM call. Next.js doctor page consumes backend-only endpoints (no direct agent call). Doctor-in-the-loop invariant: `medical_reports.is_finalized` flips only via an explicit finalize endpoint that requires all 4 SOAP fields to be non-empty.

**Tech Stack:** Spring Boot 3.3 / Java 21 · Spring Data JPA · FastAPI + LangChain-OpenAI · Next.js 14 App Router · React 18.

---

## Scope Contract

**In scope:**
- Doctor dashboard listing IN_PROGRESS visits with completed pre-visit reports.
- Visit detail page: pre-visit summary (read-only) + transcript textarea + SOAP editor.
- SOAP generation endpoint (backend → agent → LLM → structured JSON).
- SOAP draft save (update Medical Report row).
- Finalize endpoint: flips `is_finalized`, stamps `finalized_by` + `finalized_at`, transitions visit to FINALIZED.
- Frontend role-based redirect after login (Day 1 already redirects PATIENT → previsit).

**Out of scope (later days):**
- Audio/STT upload (Day 5 polish — we paste text for Day 2).
- Real RBAC guards on routes (Day 5).
- Hermes adaptive style rules (Day 4).
- Knowledge-graph-RAG context (Day 4).
- Post-visit patient summary (Day 3).
- Edit-distance hash on `ai_draft_hash` (Day 4 — we just store SHA-256 of the AI draft for Day 2).

**Done means:** You log in as `doctor@demo.local`, see the patient visit seeded by Day 1 (after a patient completes pre-visit), click into it, paste a transcript, click "Generate SOAP", see 4 populated sections, edit one, click "Finalize", and confirm via `curl GET /api/visits/{id}` that `is_finalized=true` and `status=FINALIZED`.

---

## File Map

### Backend (Java)

| File | Responsibility |
|---|---|
| `domain/biz/visit/model/MedicalReportModel.java` | CREATE — JPA entity for `medical_reports`. SOAP fields + finalize stamps. `@PrePersist`/`@PreUpdate` for timestamps. |
| `domain/biz/visit/repository/MedicalReportRepository.java` | CREATE — Spring Data repo, `findByVisitId(UUID)`. |
| `domain/biz/visit/repository/VisitRepository.java` | MODIFY — add `findByDoctorIdAndStatus(UUID, VisitStatus)` for the doctor dashboard list. |
| `infrastructure/client/AgentServiceClient.java` | MODIFY — add `callVisitGenerate(UUID visitId, Map<String,Object> preVisit, String transcript)` returning `SoapResult`. |
| `application/biz/visit/SoapWriteAppService.java` | CREATE — generate draft (call agent + upsert report), save draft (update fields), finalize (stamp + transition visit). |
| `application/biz/visit/VisitReadAppService.java` | CREATE — list visits for doctor, get single visit with pre-visit and SOAP. |
| `controller/biz/visit/VisitController.java` | CREATE — `GET /api/visits`, `GET /api/visits/{visitId}`. |
| `controller/biz/visit/SoapController.java` | CREATE — `POST /api/visits/{visitId}/soap/generate`, `PUT /api/visits/{visitId}/soap`, `POST /api/visits/{visitId}/soap/finalize`. |
| `controller/biz/visit/request/SoapDraftRequest.java` | CREATE — DTO with 4 SOAP fields. |
| `controller/biz/visit/request/SoapGenerateRequest.java` | CREATE — DTO with transcript string. |
| `controller/biz/visit/response/VisitSummaryResponse.java` | CREATE — list item DTO. |
| `controller/biz/visit/response/VisitDetailResponse.java` | CREATE — detail DTO (visit + previsit structured + SOAP draft). |

### Agent (Python)

| File | Responsibility |
|---|---|
| `agent/app/graphs/soap.py` | CREATE — async `generate_soap(pre_visit: dict, transcript: str) -> dict`. Single LLM call, JSON-mode output, strict key validation. |
| `agent/app/routes/visit.py` | REPLACE — wire up `POST /agents/visit/generate` to `generate_soap`, extend `VisitGenerateRequest` with `pre_visit: dict = {}`. |
| `agent/tests/test_soap_graph.py` | CREATE — 2 tests: happy path with mocked LLM returns 4-key dict; malformed LLM response falls back to empty sections. |
| `agent/tests/test_visit_route.py` | CREATE — 2 tests: service-token required; happy path with mocked `generate_soap`. |

### Frontend (Next.js)

| File | Responsibility |
|---|---|
| `frontend/lib/api.ts` | MODIFY — add `apiGet<T>(path)` helper (we already have `apiPost`). |
| `frontend/app/login/page.tsx` | MODIFY — change post-login redirect for DOCTOR role from `/` to `/doctor`. |
| `frontend/app/doctor/page.tsx` | CREATE — dashboard listing visits, linking to `/doctor/visits/{id}`. |
| `frontend/app/doctor/visits/[visitId]/page.tsx` | CREATE — visit detail: pre-visit summary (read-only), transcript textarea, SOAP editor, Generate/Save-Draft/Finalize buttons. |

---

## Task Breakdown

### Task 1: MedicalReportModel + MedicalReportRepository

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/MedicalReportModel.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/MedicalReportRepository.java`

- [ ] **Step 1: Create `MedicalReportModel.java`**

```java
package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "medical_reports")
public class MedicalReportModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "visit_id", nullable = false, unique = true)
    private UUID visitId;

    @Column(nullable = false, columnDefinition = "text")
    private String subjective = "";

    @Column(nullable = false, columnDefinition = "text")
    private String objective = "";

    @Column(nullable = false, columnDefinition = "text")
    private String assessment = "";

    @Column(nullable = false, columnDefinition = "text")
    private String plan = "";

    @Column(name = "ai_draft_hash", length = 64)
    private String aiDraftHash;

    @Column(name = "is_finalized", nullable = false)
    private boolean finalized = false;

    @Column(name = "finalized_by")
    private UUID finalizedBy;

    @Column(name = "finalized_at")
    private OffsetDateTime finalizedAt;

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
    public String getSubjective() { return subjective; }
    public void setSubjective(String v) { this.subjective = v == null ? "" : v; }
    public String getObjective() { return objective; }
    public void setObjective(String v) { this.objective = v == null ? "" : v; }
    public String getAssessment() { return assessment; }
    public void setAssessment(String v) { this.assessment = v == null ? "" : v; }
    public String getPlan() { return plan; }
    public void setPlan(String v) { this.plan = v == null ? "" : v; }
    public String getAiDraftHash() { return aiDraftHash; }
    public void setAiDraftHash(String v) { this.aiDraftHash = v; }
    public boolean isFinalized() { return finalized; }
    public void setFinalized(boolean v) { this.finalized = v; }
    public UUID getFinalizedBy() { return finalizedBy; }
    public void setFinalizedBy(UUID v) { this.finalizedBy = v; }
    public OffsetDateTime getFinalizedAt() { return finalizedAt; }
    public void setFinalizedAt(OffsetDateTime v) { this.finalizedAt = v; }
}
```

- [ ] **Step 2: Create `MedicalReportRepository.java`**

```java
package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface MedicalReportRepository extends JpaRepository<MedicalReportModel, UUID> {
    Optional<MedicalReportModel> findByVisitId(UUID visitId);
}
```

- [ ] **Step 3: Verify compile**

Run: `mvn -q compile` in `backend/`. Expected: BUILD SUCCESS, no errors.

---

### Task 2: VisitRepository doctor-filter method

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/domain/biz/visit/repository/VisitRepository.java`

- [ ] **Step 1: Add `findByDoctorIdAndStatus`**

Replace the file contents with:

```java
package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VisitRepository extends JpaRepository<VisitModel, UUID> {
    List<VisitModel> findByDoctorIdAndStatusOrderByGmtCreateDesc(UUID doctorId, VisitStatus status);
    List<VisitModel> findByDoctorIdOrderByGmtCreateDesc(UUID doctorId);
}
```

- [ ] **Step 2: Add `gmtCreate` getter to `VisitModel`**

`VisitModel` currently has no `gmtCreate` field. Add it so JPA can create the column + order by it. Open `backend/src/main/java/my/cliniflow/domain/biz/visit/model/VisitModel.java` and insert BEFORE the `@OneToOne` line:

```java
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

    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
```

- [ ] **Step 3: Verify compile**

Run: `mvn -q compile` in `backend/`. Expected: BUILD SUCCESS.

---

### Task 3: Agent SOAP graph

**Files:**
- Create: `agent/app/graphs/soap.py`
- Create: `agent/tests/test_soap_graph.py`

- [ ] **Step 1: Write the failing test**

Create `agent/tests/test_soap_graph.py`:

```python
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.graphs import soap


@pytest.mark.asyncio
async def test_generate_soap_happy_path() -> None:
    fake_llm_reply = json.dumps(
        {
            "subjective": "Patient reports 3 days of cough.",
            "objective": "Temp 37.8 C. Clear lungs.",
            "assessment": "Viral URI.",
            "plan": "Fluids, rest, paracetamol PRN.",
        }
    )
    with patch.object(soap, "_llm_call", new=AsyncMock(return_value=fake_llm_reply)):
        result = await soap.generate_soap(
            pre_visit={"chief_complaint": "cough", "duration": "3 days"},
            transcript="Patient presents with cough x3 days.",
        )
    assert result["subjective"].startswith("Patient reports")
    assert result["assessment"] == "Viral URI."
    assert set(result.keys()) == {"subjective", "objective", "assessment", "plan"}


@pytest.mark.asyncio
async def test_generate_soap_malformed_json_falls_back_to_empty() -> None:
    with patch.object(soap, "_llm_call", new=AsyncMock(return_value="not json at all")):
        result = await soap.generate_soap(pre_visit={}, transcript="hi")
    assert result == {"subjective": "", "objective": "", "assessment": "", "plan": ""}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `py -3.13 -m pytest tests/test_soap_graph.py -v` in `agent/`.
Expected: FAIL — `ModuleNotFoundError: app.graphs.soap`.

- [ ] **Step 3: Create `agent/app/graphs/soap.py`**

```python
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.llm.openai_client import get_chat_model

SOAP_KEYS = ("subjective", "objective", "assessment", "plan")

_SYSTEM_PROMPT = """You are a clinical scribe. Produce a SOAP note from a
consultation transcript and a pre-visit intake. Output ONLY a single JSON
object with exactly these keys: subjective, objective, assessment, plan.
Each value is a plain-text string. No markdown, no commentary."""


async def _llm_call(system: str, user: str) -> str:
    model = get_chat_model()
    resp = await model.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
    return resp.content if isinstance(resp.content, str) else str(resp.content)


async def generate_soap(pre_visit: dict[str, Any], transcript: str) -> dict[str, str]:
    user = (
        f"Pre-visit intake (JSON): {json.dumps(pre_visit, ensure_ascii=False)}\n\n"
        f"Consultation transcript:\n{transcript or '(none provided)'}\n\n"
        "Return the JSON SOAP note now."
    )
    raw = await _llm_call(_SYSTEM_PROMPT, user)
    try:
        data = json.loads(raw)
        return {k: str(data.get(k, "")) for k in SOAP_KEYS}
    except (json.JSONDecodeError, TypeError):
        return {k: "" for k in SOAP_KEYS}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3.13 -m pytest tests/test_soap_graph.py -v` in `agent/`.
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add agent/app/graphs/soap.py agent/tests/test_soap_graph.py
git commit -m "feat(agent): SOAP generation graph"
```

---

### Task 4: Agent visit route

**Files:**
- Modify (replace): `agent/app/routes/visit.py`
- Create: `agent/tests/test_visit_route.py`

- [ ] **Step 1: Write the failing tests**

Create `agent/tests/test_visit_route.py`:

```python
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_visit_generate_requires_service_token() -> None:
    r = client.post("/agents/visit/generate", json={"visit_id": "v1", "transcript": "hi"})
    assert r.status_code in (401, 403)


def test_visit_generate_happy_path() -> None:
    fake = {
        "subjective": "s text",
        "objective": "o text",
        "assessment": "a text",
        "plan": "p text",
    }
    with patch("app.routes.visit.generate_soap", new=AsyncMock(return_value=fake)):
        r = client.post(
            "/agents/visit/generate",
            headers={"X-Service-Token": "change-me"},
            json={"visit_id": "v1", "transcript": "hi", "pre_visit": {"chief_complaint": "cough"}},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["visitId"] == "v1"
    assert body["report"]["subjective"] == "s text"
    assert body["isAiDraft"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3.13 -m pytest tests/test_visit_route.py -v` in `agent/`.
Expected: FAIL — route returns 501 NotImplementedError.

- [ ] **Step 3: Replace `agent/app/routes/visit.py`**

```python
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.graphs.soap import generate_soap

router = APIRouter()


class VisitGenerateRequest(BaseModel):
    visit_id: str
    transcript: str = ""
    pre_visit: dict = Field(default_factory=dict)


class SoapReport(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class VisitGenerateResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    visit_id: str
    report: SoapReport
    is_ai_draft: bool = True


@router.post("/generate", response_model=VisitGenerateResponse, response_model_by_alias=True)
async def generate(req: VisitGenerateRequest) -> VisitGenerateResponse:
    soap = await generate_soap(pre_visit=req.pre_visit, transcript=req.transcript)
    return VisitGenerateResponse(visit_id=req.visit_id, report=SoapReport(**soap))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3.13 -m pytest tests/test_visit_route.py tests/test_soap_graph.py -v` in `agent/`.
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add agent/app/routes/visit.py agent/tests/test_visit_route.py
git commit -m "feat(agent): wire /agents/visit/generate to SOAP graph"
```

---

### Task 5: Spring Boot AgentServiceClient — callVisitGenerate

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java`

- [ ] **Step 1: Add `callVisitGenerate` method + result record**

Append inside the class (before the closing `}`):

```java
    public SoapResult callVisitGenerate(UUID visitId, Map<String, Object> preVisit, String transcript) {
        VisitGenerateRequest req = new VisitGenerateRequest(visitId.toString(), transcript == null ? "" : transcript, preVisit == null ? Map.of() : preVisit);
        VisitGenerateResponse resp = withCorrelation(client.post().uri("/agents/visit/generate"))
            .bodyValue(req)
            .retrieve()
            .bodyToMono(VisitGenerateResponse.class)
            .block();
        if (resp == null || resp.report() == null) {
            return new SoapResult("", "", "", "");
        }
        SoapReport r = resp.report();
        return new SoapResult(r.subjective(), r.objective(), r.assessment(), r.plan());
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record VisitGenerateRequest(String visitId, String transcript, Map<String, Object> preVisit) {}

    public record VisitGenerateResponse(String visitId, SoapReport report, boolean isAiDraft) {}

    public record SoapReport(String subjective, String objective, String assessment, String plan) {}

    public record SoapResult(String subjective, String objective, String assessment, String plan) {}
```

Also add these imports at the top of the file if missing:
```java
import java.util.UUID;
```

- [ ] **Step 2: Verify compile**

Run: `mvn -q compile` in `backend/`. Expected: BUILD SUCCESS.

---

### Task 6: SoapWriteAppService

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/SoapWriteAppService.java`

- [ ] **Step 1: Create the service**

```java
package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
public class SoapWriteAppService {

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final AgentServiceClient agent;

    public SoapWriteAppService(VisitRepository visits, MedicalReportRepository reports, AgentServiceClient agent) {
        this.visits = visits;
        this.reports = reports;
        this.agent = agent;
    }

    @Transactional
    public MedicalReportModel generateDraft(UUID visitId, String transcript) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        if (v.getStatus() == VisitStatus.FINALIZED) {
            throw new IllegalStateException("visit already finalized: " + visitId);
        }
        PreVisitReportModel pv = v.getPreVisitReport();
        Map<String, Object> preVisitFields = pv == null ? Map.of()
            : extractFields(pv.getStructured());

        AgentServiceClient.SoapResult soap = agent.callVisitGenerate(visitId, preVisitFields, transcript);

        MedicalReportModel r = reports.findByVisitId(visitId).orElseGet(() -> {
            MedicalReportModel m = new MedicalReportModel();
            m.setVisitId(visitId);
            return m;
        });
        if (r.isFinalized()) throw new IllegalStateException("medical report already finalized");
        r.setSubjective(soap.subjective());
        r.setObjective(soap.objective());
        r.setAssessment(soap.assessment());
        r.setPlan(soap.plan());
        r.setAiDraftHash(sha256(soap.subjective() + "|" + soap.objective() + "|" + soap.assessment() + "|" + soap.plan()));
        return reports.save(r);
    }

    @Transactional
    public MedicalReportModel saveDraft(UUID visitId, String subjective, String objective, String assessment, String plan) {
        MedicalReportModel r = reports.findByVisitId(visitId).orElseThrow(
            () -> new IllegalArgumentException("no draft for visit: " + visitId));
        if (r.isFinalized()) throw new IllegalStateException("medical report already finalized");
        r.setSubjective(subjective);
        r.setObjective(objective);
        r.setAssessment(assessment);
        r.setPlan(plan);
        return reports.save(r);
    }

    @Transactional
    public MedicalReportModel finalize(UUID visitId, UUID doctorUserId, String subjective, String objective, String assessment, String plan) {
        MedicalReportModel r = reports.findByVisitId(visitId).orElseThrow(
            () -> new IllegalArgumentException("no draft for visit: " + visitId));
        if (r.isFinalized()) return r;
        if (isBlank(subjective) || isBlank(objective) || isBlank(assessment) || isBlank(plan)) {
            throw new IllegalArgumentException("all 4 SOAP sections must be non-empty to finalize");
        }
        r.setSubjective(subjective);
        r.setObjective(objective);
        r.setAssessment(assessment);
        r.setPlan(plan);
        r.setFinalized(true);
        r.setFinalizedBy(doctorUserId);
        r.setFinalizedAt(OffsetDateTime.now());
        reports.save(r);

        VisitModel v = visits.findById(visitId).orElseThrow();
        v.setStatus(VisitStatus.FINALIZED);
        v.setFinalizedAt(OffsetDateTime.now());
        visits.save(v);
        return r;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> extractFields(Map<String, Object> structured) {
        Object fields = structured == null ? null : structured.get("fields");
        return fields instanceof Map ? (Map<String, Object>) fields : Map.of();
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

- [ ] **Step 2: Verify compile**

Run: `mvn -q compile` in `backend/`. Expected: BUILD SUCCESS.

---

### Task 7: VisitReadAppService + DTOs

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/VisitReadAppService.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/response/VisitSummaryResponse.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/response/VisitDetailResponse.java`

- [ ] **Step 1: Create `VisitSummaryResponse.java`**

```java
package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public record VisitSummaryResponse(
    UUID visitId,
    UUID patientId,
    String patientName,
    VisitStatus status,
    boolean preVisitDone,
    boolean soapFinalized,
    OffsetDateTime createdAt
) {}
```

- [ ] **Step 2: Create `VisitDetailResponse.java`**

```java
package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record VisitDetailResponse(
    UUID visitId,
    UUID patientId,
    String patientName,
    VisitStatus status,
    Map<String, Object> preVisitStructured,
    Soap soap,
    OffsetDateTime createdAt,
    OffsetDateTime finalizedAt
) {
    public record Soap(
        String subjective,
        String objective,
        String assessment,
        String plan,
        boolean finalized,
        String aiDraftHash
    ) {}
}
```

- [ ] **Step 3: Create `VisitReadAppService.java`**

```java
package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.controller.biz.visit.response.VisitSummaryResponse;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class VisitReadAppService {

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final PatientRepository patients;

    public VisitReadAppService(VisitRepository visits, MedicalReportRepository reports, PatientRepository patients) {
        this.visits = visits;
        this.reports = reports;
        this.patients = patients;
    }

    public List<VisitSummaryResponse> listForDoctor(UUID doctorId) {
        return visits.findByDoctorIdOrderByGmtCreateDesc(doctorId).stream()
            .map(v -> toSummary(v, reports.findByVisitId(v.getId()).orElse(null)))
            .toList();
    }

    public VisitDetailResponse detail(UUID visitId) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        MedicalReportModel r = reports.findByVisitId(visitId).orElse(null);
        PreVisitReportModel pv = v.getPreVisitReport();
        Map<String, Object> structured = pv == null ? Map.of() : pv.getStructured();
        String patientName = patients.findById(v.getPatientId()).map(PatientModel::getFullName).orElse("(unknown)");
        VisitDetailResponse.Soap soap = r == null
            ? new VisitDetailResponse.Soap("", "", "", "", false, null)
            : new VisitDetailResponse.Soap(r.getSubjective(), r.getObjective(), r.getAssessment(), r.getPlan(), r.isFinalized(), r.getAiDraftHash());
        return new VisitDetailResponse(
            v.getId(), v.getPatientId(), patientName, v.getStatus(),
            structured, soap, v.getGmtCreate(), v.getFinalizedAt()
        );
    }

    private VisitSummaryResponse toSummary(VisitModel v, MedicalReportModel r) {
        PreVisitReportModel pv = v.getPreVisitReport();
        boolean preDone = pv != null && Boolean.TRUE.equals(pv.getStructured().get("done"));
        boolean soapFinalized = r != null && r.isFinalized();
        String patientName = patients.findById(v.getPatientId()).map(PatientModel::getFullName).orElse("(unknown)");
        return new VisitSummaryResponse(v.getId(), v.getPatientId(), patientName, v.getStatus(), preDone, soapFinalized, v.getGmtCreate());
    }
}
```

- [ ] **Step 4: Verify compile**

Run: `mvn -q compile` in `backend/`. Expected: BUILD SUCCESS.

---

### Task 8: VisitController + SoapController + request DTOs

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/VisitController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/SoapController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/request/SoapGenerateRequest.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/visit/request/SoapDraftRequest.java`

- [ ] **Step 1: Create `SoapGenerateRequest.java`**

```java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotNull;

public record SoapGenerateRequest(@NotNull String transcript) {}
```

- [ ] **Step 2: Create `SoapDraftRequest.java`**

```java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotNull;

public record SoapDraftRequest(
    @NotNull String subjective,
    @NotNull String objective,
    @NotNull String assessment,
    @NotNull String plan
) {}
```

- [ ] **Step 3: Create `VisitController.java`**

```java
package my.cliniflow.controller.biz.visit;

import my.cliniflow.application.biz.visit.VisitReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.controller.biz.visit.response.VisitSummaryResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/visits")
public class VisitController {

    private final VisitReadAppService reads;

    public VisitController(VisitReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping
    public WebResult<List<VisitSummaryResponse>> list(Authentication auth) {
        UUID doctorId = UUID.fromString(auth.getName());
        return WebResult.ok(reads.listForDoctor(doctorId));
    }

    @GetMapping("/{visitId}")
    public WebResult<VisitDetailResponse> detail(@PathVariable UUID visitId) {
        return WebResult.ok(reads.detail(visitId));
    }
}
```

- [ ] **Step 4: Create `SoapController.java`**

```java
package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.SoapWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.request.SoapDraftRequest;
import my.cliniflow.controller.biz.visit.request.SoapGenerateRequest;
import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/visits/{visitId}/soap")
public class SoapController {

    private final SoapWriteAppService svc;

    public SoapController(SoapWriteAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/generate")
    public WebResult<VisitDetailResponse.Soap> generate(@PathVariable UUID visitId, @Valid @RequestBody SoapGenerateRequest req) {
        MedicalReportModel r = svc.generateDraft(visitId, req.transcript());
        return WebResult.ok(toSoap(r));
    }

    @PutMapping
    public WebResult<VisitDetailResponse.Soap> saveDraft(@PathVariable UUID visitId, @Valid @RequestBody SoapDraftRequest req) {
        MedicalReportModel r = svc.saveDraft(visitId, req.subjective(), req.objective(), req.assessment(), req.plan());
        return WebResult.ok(toSoap(r));
    }

    @PostMapping("/finalize")
    public WebResult<VisitDetailResponse.Soap> finalize(
        @PathVariable UUID visitId,
        @Valid @RequestBody SoapDraftRequest req,
        Authentication auth
    ) {
        UUID doctorId = UUID.fromString(auth.getName());
        MedicalReportModel r = svc.finalize(visitId, doctorId, req.subjective(), req.objective(), req.assessment(), req.plan());
        return WebResult.ok(toSoap(r));
    }

    private static VisitDetailResponse.Soap toSoap(MedicalReportModel r) {
        return new VisitDetailResponse.Soap(
            r.getSubjective(), r.getObjective(), r.getAssessment(), r.getPlan(),
            r.isFinalized(), r.getAiDraftHash()
        );
    }
}
```

- [ ] **Step 5: Open GET/POST for visits in SecurityConfiguration**

Open `backend/src/main/java/my/cliniflow/controller/config/SecurityConfiguration.java` and confirm `/api/visits/**` is NOT explicitly permitAll (the JWT filter handles auth — Authentication is required). If `/api/visits/**` is listed under `.permitAll()`, remove it. Leave the rest untouched.

- [ ] **Step 6: Verify compile**

Run: `mvn -q compile` in `backend/`. Expected: BUILD SUCCESS.

- [ ] **Step 7: Commit backend**

```bash
git add backend/
git commit -m "feat(backend): SOAP write/read services + /api/visits endpoints"
```

---

### Task 9: Frontend api.ts helper

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `apiGet` helper**

Open `frontend/lib/api.ts` and append before the closing of the file:

```typescript
export async function apiGet<T>(path: string): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("cf_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json();
  if (body.code !== 0) throw new Error(body.message || "request failed");
  return body.data as T;
}

export async function apiPut<T>(path: string, payload: unknown): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("cf_token") : null;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (body.code !== 0) throw new Error(body.message || "request failed");
  return body.data as T;
}
```

If `API_BASE` is not already exported, this will fail — check the file and make sure `apiPost` and this new helper share the same base constant.

---

### Task 10: Frontend login redirect update

**Files:**
- Modify: `frontend/app/login/page.tsx`

- [ ] **Step 1: Change DOCTOR redirect**

Find the block that redirects based on role and ensure:
- `PATIENT` → `/previsit/new`
- `DOCTOR` → `/doctor`
- anything else → `/`

Exact diff: replace the redirect switch with:

```typescript
if (user.role === "PATIENT") router.replace("/previsit/new");
else if (user.role === "DOCTOR") router.replace("/doctor");
else router.replace("/");
```

---

### Task 11: Doctor dashboard page

**Files:**
- Create: `frontend/app/doctor/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";

type VisitSummary = {
  visitId: string;
  patientId: string;
  patientName: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINALIZED" | "CANCELLED";
  preVisitDone: boolean;
  soapFinalized: boolean;
  createdAt: string;
};

export default function DoctorDashboard() {
  const router = useRouter();
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "DOCTOR") { router.replace("/"); return; }
    apiGet<VisitSummary[]>("/visits")
      .then(setVisits)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <div style={{ padding: 24 }}>Loading visits…</div>;
  if (error) return <div style={{ padding: 24, color: "crimson" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Doctor Dashboard</h1>
      <p>Visits assigned to you:</p>
      {visits.length === 0 ? (
        <p style={{ color: "#666" }}>No visits yet. Ask a patient to complete a pre-visit intake.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: 8 }}>Patient</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Pre-visit</th>
              <th style={{ padding: 8 }}>SOAP</th>
              <th style={{ padding: 8 }}>Created</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.visitId} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{v.patientName}</td>
                <td style={{ padding: 8 }}>{v.status}</td>
                <td style={{ padding: 8 }}>{v.preVisitDone ? "✓" : "…"}</td>
                <td style={{ padding: 8 }}>{v.soapFinalized ? "✓ finalized" : "draft"}</td>
                <td style={{ padding: 8 }}>{new Date(v.createdAt).toLocaleString()}</td>
                <td style={{ padding: 8 }}>
                  <Link href={`/doctor/visits/${v.visitId}`}>Open →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

---

### Task 12: Visit detail / SOAP editor page

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/page.tsx`

- [ ] **Step 1: Create the page**

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAiDraft, setHasAiDraft] = useState(false);

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

  async function onFinalize() {
    if (!soap.subjective.trim() || !soap.objective.trim() || !soap.assessment.trim() || !soap.plan.trim()) {
      setError("All 4 SOAP sections must be non-empty to finalize");
      return;
    }
    if (!confirm("Finalize this SOAP note? This locks the record.")) return;
    setBusy(true); setError(null);
    try {
      const s = await apiPost<Soap>(`/visits/${visitId}/soap/finalize`, soap);
      setSoap(s);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
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
          <button onClick={onFinalize} disabled={busy || locked || !hasAiDraft} style={{ background: "#0070f3", color: "white" }}>
            Finalize
          </button>
        </div>
      </section>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>Error: {error}</p>}
    </div>
  );
}
```

---

### Task 13: End-to-end smoke test

- [ ] **Step 1: Restart backend, agent, frontend**

With OPENAI_API_KEY exported (or Z.AI GLM equivalent), restart all three services.

- [ ] **Step 2: Patient flow — create a finished pre-visit**

1. Open http://localhost:3000/login, login as `patient@demo.local` / `password`.
2. Complete all 5 pre-visit questions until the chat shows `done: true`.
3. Note the visit ID shown in the response (or copy from DB).

- [ ] **Step 3: Doctor flow — generate/edit/finalize SOAP**

1. Open a new incognito window, login as `doctor@demo.local` / `password`.
2. Should redirect to `/doctor` and show the patient's visit in the list with Pre-visit `✓`.
3. Click "Open →", paste a short transcript (e.g. "Patient reports 3-day cough, T 37.8, lungs clear."), click Generate SOAP.
4. Verify all 4 sections populate with AI-draft content and the warning banner shows.
5. Edit the Assessment to add `(reviewed)`, click Save draft — reload page, confirm edit persisted.
6. Click Finalize, confirm dialog, observe "✓ Finalized" badge and fields become read-only.

- [ ] **Step 4: Verify DB state**

```bash
curl -s http://localhost:8080/api/visits/<visitId> \
  -H "Authorization: Bearer <doctor-jwt>" | jq '.data | {status, soap: {finalized: .soap.finalized, aiDraftHash: .soap.aiDraftHash}}'
```

Expected: `status: "FINALIZED"`, `soap.finalized: true`, `aiDraftHash` non-null.

- [ ] **Step 5: Commit**

```bash
git add frontend/ docs/
git commit -m "feat(frontend): doctor dashboard + SOAP editor"
```

---

## Self-Review Checklist

- Spec covers: doctor lists visits ✓, views pre-visit ✓, generates SOAP ✓, edits ✓, finalizes ✓, backend blocks edits after finalize ✓, AI-draft visibly distinguished ✓.
- No placeholders (every code block is complete).
- Types consistent: `SoapResult` (agent client) / `MedicalReportModel` / `VisitDetailResponse.Soap` / frontend `Soap` all have `subjective/objective/assessment/plan`. Backend finalize hash is `String` everywhere.
- `Authentication.getName()` returns the user UUID as a string because `JwtAuthenticationFilter` sets the principal to `userId.toString()` (Day 1) — same pattern used in `AuthController`.

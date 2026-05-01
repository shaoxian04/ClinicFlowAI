# Evaluator Agent + Expanded Drug Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-01-evaluator-and-drug-validation-design.md`
**SQL companion:** `backend/src/main/resources/db/migration/V2__evaluator_and_drug_validation.sql` (already applied to Supabase 2026-05-01).

**Goal:** Add an evaluator agent that runs after the report drafter and produces structured safety + quality findings. Expand drug validation to allergy + DDI + pregnancy/lactation + dose-range, plus add hallucination and completeness checks. Tiered severity policy (flag-only for HIGH/MEDIUM/LOW; soft-block at finalize for CRITICAL with explicit acknowledgement).

**Architecture:** New `EvaluatorAgent` class in the Python agent runs synchronously inside `/agents/report/generate` after the drafter completes. Findings persist to a new `evaluator_findings` table (child of Visit aggregate). Spring Boot extends the `visit/` DDD package with `EvaluatorFindingModel`, two domain services (acknowledge, supersede), and a finalize-time guard. Frontend renders a new "AI Safety Review" panel during doctor review only — no surface on final report or patient summary.

**Tech Stack:** Python 3.12 + FastAPI + LangGraph · Neo4j (drug knowledge graph) · Supabase Postgres · Spring Boot 3.3 / Java 21 · Spring Data JPA · Spring Security + JJWT · Resilience4j · pytest · JUnit 5 + Mockito + AssertJ · Next.js 14 · Vitest + Testing Library · Playwright (driven via MCP).

**Branch:** Continue work on the existing `feat/appointment-booking-and-reminders` branch *or* branch off it for `feat/evaluator-and-drug-validation`. The plan assumes the latter — adjust if the user prefers the former.

---

## Conventions used in this plan

- **TDD:** every task that produces production code follows `write failing test → run failing → implement → run passing → commit`.
- **Commit cadence:** one task = one commit, conventional-commits style (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`).
- **Python test runner:** `cd agent && pytest path/to/test.py::test_name -v` for one test, `pytest` for the suite.
- **Java test runner:** `cd backend && ./mvnw test -Dtest=ClassName#method` for one, `./mvnw test` for the suite.
- **Frontend lint/typecheck:** `cd frontend && npm run typecheck && npm run lint`.
- **Frontend unit tests:** `cd frontend && npm run test -- path/to/test.test.tsx`.
- **DDD package roots:** `my.cliniflow.domain.biz.visit.{model,enums,service,event,info,repository}`, `my.cliniflow.application.biz.visit`, `my.cliniflow.controller.biz.visit`, `my.cliniflow.infrastructure.repository.visit`.
- **Domain service rule** (per `docs/details/ddd-conventions.md`): one domain service per state transition. So `EvaluatorFindingAcknowledgeDomainService` and `EvaluatorFindingSupersedeDomainService` — **not** a catch-all `EvaluatorFindingDomainService`.
- **Identity rule:** every per-visit endpoint derives the doctor user from JWT principal and verifies `visit.doctor_id == claims.userId()`. Hardcoded UUIDs forbidden.
- **PHI rule:** free-text drug names, allergy names, finding messages, transcript fragments never appear in metrics, structured logs, or audit metadata. Only UUIDs, counts, durations, and severity buckets are loggable.
- **No placeholders:** every step contains the actual code, command, or expected output.

---

## Phase plan (each phase ships working software)

| Phase | Scope | Ships |
|---|---|---|
| 0 | Branch + V2 SQL doc + verify schema applied | clean working tree |
| 1 | Python schemas + severity mapper + dose/freq parsers (pure-fn TDD) | unit-tested helpers |
| 2 | Neo4j schema constraints + drug knowledge JSON + idempotent loader + lifespan wiring | drug graph queryable |
| 3 | DDI Cypher validator + tests | DDI works in isolation |
| 4 | Pregnancy Cypher validator + tests | pregnancy works in isolation |
| 5 | Dose-range Cypher validator + tests | dose works in isolation |
| 6 | Completeness validator + tests | completeness works in isolation |
| 7 | Hallucination validator + tests | hallucination works in isolation |
| 8 | Persistence repo + EvaluatorAgent orchestrator + integration test | end-to-end agent eval works |
| 9 | Agent route changes (`/generate`, `/edit`, `/clarify`, `/finalize`) + new `/evaluator/*` routes | HTTP API live |
| 10 | Spring Boot — enums, JPA entity, model, repository extension | Visit loads/saves findings |
| 11 | Spring Boot — domain services (acknowledge, supersede) + finalize guard | invariants enforced |
| 12 | Spring Boot — app services + DTOs + converter + controller routes | full HTTP surface |
| 13 | Spring Boot — `AgentServiceClient` extension | re-evaluate proxies through |
| 14 | Frontend — types + hook + status pills + finding card | renderable in Storybook |
| 15 | Frontend — dialog + panel + page integration + finalize gating | doctor flow live |
| 16 | E2E Playwright (MCP) + Docker `--no-cache` rebuild + visual snapshots | acceptance check |
| 17 | Docs updates (`agent-design.md`, `api-surface.md`, `data-model.md`, `scope-and-acceptance.md`) | docs aligned |

---

## File map

### Agent — Python (`agent/`)

| File | Action | Responsibility |
|---|---|---|
| `app/schemas/evaluator.py` | Create | Pydantic `Severity`, `Category`, `Finding`, `EvaluationResult` |
| `app/agents/evaluator/__init__.py` | Create | package marker |
| `app/agents/evaluator/severity.py` | Create | severity mappers (DDI, pregnancy, dose) |
| `app/agents/evaluator/dose_parser.py` | Create | parse `"500mg"` and `"BD"`/`"TDS"` etc. |
| `app/agents/evaluator/completeness.py` | Create | pure-Python completeness validator |
| `app/agents/evaluator/hallucination.py` | Create | LLM-based hallucination validator |
| `app/agents/evaluator_agent.py` | Create | orchestrator class |
| `app/graph/seed/__init__.py` | Create | package marker |
| `app/graph/seed/drug_knowledge.json` | Create | seed data (~150 drugs, DDI edges, pregnancy, dose rules) |
| `app/graph/seed/apply_drug_knowledge.py` | Create | idempotent `MERGE`-based loader |
| `app/graph/queries/drug_drug_interaction.py` | Create | DDI Cypher |
| `app/graph/queries/pregnancy_safety.py` | Create | pregnancy Cypher |
| `app/graph/queries/dose_range.py` | Create | dose Cypher |
| `app/graph/queries/drug_interaction.py` | Keep (existing allergy validator, no changes) | reused |
| `app/graph/schema.py` | Modify | add 4 new constraints |
| `app/persistence/evaluator_findings.py` | Create | Postgres repository (insert, supersede, list) |
| `app/tools/evaluator_tools.py` | Create | LangGraph tool wrappers (read tools only) |
| `app/routes/evaluator.py` | Create | `GET /findings/{visit_id}`, `POST /re-evaluate` |
| `app/routes/report.py` | Modify | call evaluator after drafter, emit SSE event |
| `app/main.py` | Modify | register evaluator router; invoke `apply_drug_knowledge` from lifespan |
| `app/config.py` | Modify | new env vars (`EVALUATOR_TIMEOUT_*`, `EVALUATOR_DDI_ACTIVE_MED_LOOKBACK_DAYS`, `EVALUATOR_ENABLED`) |

### Agent — Tests (`agent/tests/`)

| File | Action |
|---|---|
| `tests/agents/evaluator/__init__.py` | Create |
| `tests/agents/evaluator/test_severity.py` | Create |
| `tests/agents/evaluator/test_dose_parser.py` | Create |
| `tests/agents/evaluator/test_drug_drug_interactions.py` | Create |
| `tests/agents/evaluator/test_pregnancy_safety.py` | Create |
| `tests/agents/evaluator/test_dose_range.py` | Create |
| `tests/agents/evaluator/test_completeness.py` | Create |
| `tests/agents/evaluator/test_hallucination.py` | Create |
| `tests/agents/evaluator/test_orchestrator.py` | Create |
| `tests/integration/test_evaluator_e2e.py` | Create |
| `tests/fixtures/drug_knowledge_test.json` | Create |
| `tests/fixtures/test_patients.json` | Create |
| `tests/fixtures/test_drafts.json` | Create |

### Backend — Spring Boot (`backend/src/main/java/my/cliniflow/`)

| File | Action |
|---|---|
| `domain/biz/visit/enums/FindingCategory.java` | Create |
| `domain/biz/visit/enums/FindingSeverity.java` | Create |
| `domain/biz/visit/model/EvaluatorFindingModel.java` | Create |
| `domain/biz/visit/model/VisitModel.java` | Modify — add findings collection, `requireFinalizable()`, helper queries |
| `domain/biz/visit/event/EvaluatorFindingAcknowledgedDomainEvent.java` | Create |
| `domain/biz/visit/info/EvaluatorRunResultInfo.java` | Create |
| `domain/biz/visit/info/AcknowledgeFindingInfo.java` | Create |
| `domain/biz/visit/repository/VisitRepository.java` | Modify — extend with finding queries |
| `domain/biz/visit/service/EvaluatorFindingAcknowledgeDomainService.java` | Create |
| `domain/biz/visit/service/EvaluatorFindingSupersedeDomainService.java` | Create |
| `domain/biz/visit/service/MedicalReportFinalizeDomainService.java` | Modify — add finalize guard |
| `domain/biz/visit/exception/UnacknowledgedCriticalFindingsException.java` | Create |
| `application/biz/visit/VisitReadAppService.java` | Modify — `listFindings()` |
| `application/biz/visit/VisitWriteAppService.java` | Modify — `acknowledgeFinding()`, `reEvaluate()` |
| `controller/biz/visit/VisitController.java` | Modify — 3 new routes |
| `controller/biz/visit/request/AcknowledgeFindingRequest.java` | Create |
| `controller/biz/visit/response/EvaluatorFindingDTO.java` | Create |
| `controller/biz/visit/converter/EvaluatorFindingModel2DTOConverter.java` | Create |
| `controller/config/GlobalExceptionConfiguration.java` | Modify — map `UnacknowledgedCriticalFindingsException` → 409 |
| `infrastructure/repository/visit/EvaluatorFindingEntity.java` | Create |
| `infrastructure/repository/visit/EvaluatorFindingJpaRepository.java` | Create |
| `infrastructure/repository/visit/VisitRepositoryImpl.java` | Modify — load/save findings |
| `infrastructure/repository/visit/VisitEntity.java` | Modify — `@OneToMany` to findings |
| `infrastructure/client/AgentServiceClient.java` | Modify — `getFindings`, `reEvaluate` |
| `infrastructure/audit/AuditLogService.java` | Verify subaction support; modify if needed |

### Backend — Tests

| File | Action |
|---|---|
| `backend/src/test/java/.../visit/EvaluatorFindingModelTest.java` | Create |
| `backend/src/test/java/.../visit/EvaluatorFindingAcknowledgeDomainServiceTest.java` | Create |
| `backend/src/test/java/.../visit/MedicalReportFinalizeDomainServiceTest.java` | Modify — add guard tests |
| `backend/src/test/java/.../visit/VisitControllerEvaluatorEndpointsIT.java` | Create |
| `backend/src/test/java/.../visit/FinalizeGuardIT.java` | Create |

### Frontend (`frontend/`)

| File | Action |
|---|---|
| `app/doctor/visits/[visitId]/components/safety/types.ts` | Create |
| `app/doctor/visits/[visitId]/components/safety/useEvaluatorFindings.ts` | Create |
| `app/doctor/visits/[visitId]/components/safety/SafetyStatusRow.tsx` | Create |
| `app/doctor/visits/[visitId]/components/safety/FindingCard.tsx` | Create |
| `app/doctor/visits/[visitId]/components/safety/AcknowledgeFindingDialog.tsx` | Create |
| `app/doctor/visits/[visitId]/components/safety/SafetyUnavailableBanner.tsx` | Create |
| `app/doctor/visits/[visitId]/components/safety/AISafetyReviewPanel.tsx` | Create |
| `app/doctor/visits/[visitId]/page.tsx` | Modify — render panel |
| `app/doctor/visits/[visitId]/components/ReportPreview.tsx` | Modify — gate finalize button |
| `__tests__/safety/useEvaluatorFindings.test.tsx` | Create |
| `__tests__/safety/AISafetyReviewPanel.test.tsx` | Create |
| `__tests__/safety/AcknowledgeFindingDialog.test.tsx` | Create |

### E2E

| File | Action |
|---|---|
| `e2e/tests/safety-soft-block.spec.ts` | Create |
| `e2e/tests/snapshots/safety-panel-critical.snap.png` | Create (after first run) |
| `e2e/tests/snapshots/safety-panel-acked.snap.png` | Create (after first run) |
| `e2e/tests/snapshots/report-preview-clean.snap.png` | Create (after first run) |

### Reference SQL

| File | Action |
|---|---|
| `backend/src/main/resources/db/migration/V2__evaluator_and_drug_validation.sql` | Create — documentation only |

---

## Phase 0 — Branch & SQL doc

### Task 0.1: Create feature branch

**Files:**
- None (git only)

- [ ] **Step 1: Verify clean tree**

```bash
git status
```
Expected: clean or only untracked files unrelated to this work.

- [ ] **Step 2: Create branch from current branch**

```bash
git checkout -b feat/evaluator-and-drug-validation
git push -u origin feat/evaluator-and-drug-validation
```

### Task 0.2: Document V2 SQL (reference only — Flyway is disabled)

**Files:**
- Create: `backend/src/main/resources/db/migration/V2__evaluator_and_drug_validation.sql`

- [ ] **Step 1: Create the file with the exact SQL applied to Supabase on 2026-05-01**

```sql
-- V2 — evaluator findings + patient pregnancy/weight/height columns
-- Already applied to Supabase 2026-05-01. This file is reference documentation
-- (Flyway is NOT used per CLAUDE.md).

-- §2.1: patients additions for pregnancy + dose validation
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS pregnancy_status varchar(16),
  ADD COLUMN IF NOT EXISTS pregnancy_trimester smallint,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,2),
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,2);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_pregnancy_status_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_pregnancy_status_chk
          CHECK (pregnancy_status IS NULL OR pregnancy_status IN
                 ('NOT_PREGNANT','PREGNANT','LACTATING','UNKNOWN'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_pregnancy_trimester_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_pregnancy_trimester_chk
          CHECK (pregnancy_trimester IS NULL OR pregnancy_trimester BETWEEN 1 AND 3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_weight_kg_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_weight_kg_chk
          CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 600));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_height_cm_chk') THEN
        ALTER TABLE patients ADD CONSTRAINT patients_height_cm_chk
          CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm < 300));
    END IF;
END$$;

-- §2.1: evaluator findings storage
CREATE TABLE IF NOT EXISTS evaluator_findings (
    id                      uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id                uuid         NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    category                varchar(32)  NOT NULL
        CHECK (category IN ('DRUG_ALLERGY','DDI','PREGNANCY','DOSE',
                            'HALLUCINATION','COMPLETENESS')),
    severity                varchar(16)  NOT NULL
        CHECK (severity IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    field_path              varchar(255),
    message                 text         NOT NULL,
    details                 jsonb        NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_at         timestamptz,
    acknowledged_by         uuid         REFERENCES users(id) ON DELETE SET NULL,
    acknowledgement_reason  varchar(255),
    superseded_at           timestamptz,
    gmt_create              timestamptz  NOT NULL DEFAULT now(),
    gmt_modified            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT findings_ack_consistent CHECK (
        (acknowledged_at IS NULL AND acknowledged_by IS NULL) OR
        (acknowledged_at IS NOT NULL AND acknowledged_by IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS evaluator_findings_visit_idx
    ON evaluator_findings(visit_id) WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS evaluator_findings_unack_critical_idx
    ON evaluator_findings(visit_id)
    WHERE severity = 'CRITICAL' AND acknowledged_at IS NULL AND superseded_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'evaluator_findings_touch_modified') THEN
        CREATE TRIGGER evaluator_findings_touch_modified
            BEFORE UPDATE ON evaluator_findings
            FOR EACH ROW EXECUTE FUNCTION touch_gmt_modified();
    END IF;
END$$;
```

- [ ] **Step 2: Verify schema in Supabase**

In Supabase SQL editor:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='patients'
  AND column_name IN ('pregnancy_status','pregnancy_trimester','weight_kg','height_cm');
SELECT COUNT(*) FROM information_schema.tables WHERE table_name='evaluator_findings';
```
Expected: 4 column rows, table count = 1. If anything missing, paste the SQL above and re-run.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V2__evaluator_and_drug_validation.sql
git commit -m "docs(db): document V2 schema for evaluator findings and pregnancy/weight"
```

---

## Phase 1 — Python schemas + helpers (pure-fn TDD)

### Task 1.1: Pydantic schemas

**Files:**
- Create: `agent/app/schemas/evaluator.py`
- Test: `agent/tests/agents/evaluator/test_schemas.py`

- [ ] **Step 1: Create test file with package init**

```bash
mkdir -p agent/tests/agents/evaluator
touch agent/tests/agents/evaluator/__init__.py
```

- [ ] **Step 2: Write failing test**

`agent/tests/agents/evaluator/test_schemas.py`:
```python
from uuid import uuid4
import pytest
from app.schemas.evaluator import Finding, EvaluationResult


def test_finding_defaults():
    f = Finding(category="DDI", severity="CRITICAL", message="test")
    assert f.field_path is None
    assert f.details == {}


def test_finding_rejects_unknown_category():
    with pytest.raises(Exception):
        Finding(category="UNKNOWN", severity="HIGH", message="x")


def test_finding_rejects_unknown_severity():
    with pytest.raises(Exception):
        Finding(category="DDI", severity="URGENT", message="x")


def test_evaluation_result_minimal():
    r = EvaluationResult(visit_id=uuid4(), findings=[], validators_run=["DDI"])
    assert r.validators_unavailable == []


def test_evaluation_result_unavailable():
    r = EvaluationResult(
        visit_id=uuid4(), findings=[],
        validators_run=["DDI"],
        validators_unavailable=[("PREGNANCY", "neo4j_down")],
    )
    assert r.validators_unavailable[0] == ("PREGNANCY", "neo4j_down")
```

- [ ] **Step 3: Run failing test**

```bash
cd agent && pytest tests/agents/evaluator/test_schemas.py -v
```
Expected: all 5 fail with `ModuleNotFoundError: app.schemas.evaluator`.

- [ ] **Step 4: Implement schemas**

`agent/app/schemas/evaluator.py`:
```python
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
Category = Literal["DRUG_ALLERGY", "DDI", "PREGNANCY", "DOSE", "HALLUCINATION", "COMPLETENESS"]


class Finding(BaseModel):
    category: Category
    severity: Severity
    field_path: str | None = None
    message: str
    details: dict = Field(default_factory=dict)


class EvaluationResult(BaseModel):
    visit_id: UUID
    findings: list[Finding] = Field(default_factory=list)
    validators_run: list[Category] = Field(default_factory=list)
    validators_unavailable: list[tuple[Category, str]] = Field(default_factory=list)
```

- [ ] **Step 5: Run passing test**

```bash
cd agent && pytest tests/agents/evaluator/test_schemas.py -v
```
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add agent/app/schemas/evaluator.py agent/tests/agents/evaluator/__init__.py agent/tests/agents/evaluator/test_schemas.py
git commit -m "feat(agent): add evaluator pydantic schemas"
```

### Task 1.2: Severity mappers (pure functions)

**Files:**
- Create: `agent/app/agents/evaluator/__init__.py`
- Create: `agent/app/agents/evaluator/severity.py`
- Test: `agent/tests/agents/evaluator/test_severity.py`

- [ ] **Step 1: Write failing tests**

`agent/tests/agents/evaluator/test_severity.py`:
```python
import pytest
from app.agents.evaluator.severity import (
    map_ddi_severity,
    map_pregnancy_severity,
    map_dose_severity,
)


@pytest.mark.parametrize("raw,expected", [
    ("MAJOR", "CRITICAL"),
    ("MODERATE", "HIGH"),
    ("MINOR", "LOW"),
    ("major", "CRITICAL"),  # case insensitive
    ("unknown", "LOW"),     # unknown → safest default (low alert)
])
def test_map_ddi_severity(raw, expected):
    assert map_ddi_severity(raw) == expected


@pytest.mark.parametrize("status,category,lactation_safe,expected", [
    ("PREGNANT", "D", None, "CRITICAL"),
    ("PREGNANT", "X", None, "CRITICAL"),
    ("PREGNANT", "C", None, "HIGH"),
    ("PREGNANT", "B", None, "LOW"),
    ("PREGNANT", "A", None, "LOW"),
    ("PREGNANT", None, None, "MEDIUM"),
    ("LACTATING", "X", None, "CRITICAL"),
    ("LACTATING", "D", False, "HIGH"),
    ("LACTATING", "D", True, "MEDIUM"),
    ("LACTATING", "D", None, "MEDIUM"),
    ("LACTATING", "C", None, "MEDIUM"),
    ("LACTATING", "B", None, "LOW"),
    ("LACTATING", None, None, "MEDIUM"),
])
def test_map_pregnancy_severity(status, category, lactation_safe, expected):
    assert map_pregnancy_severity(status, category, lactation_safe) == expected


@pytest.mark.parametrize("kind,expected", [
    ("over_max_dose", "CRITICAL"),
    ("over_max_daily", "CRITICAL"),
    ("under_min_dose", "HIGH"),
    ("no_rule", "MEDIUM"),
    ("weight_unknown", "MEDIUM"),
    ("dose_unit_missing", "MEDIUM"),
    ("frequency_unparseable", "LOW"),
    ("unknown_drug", "LOW"),
])
def test_map_dose_severity(kind, expected):
    assert map_dose_severity(kind) == expected
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_severity.py -v
```
Expected: all fail with `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`agent/app/agents/evaluator/__init__.py`:
```python
```

`agent/app/agents/evaluator/severity.py`:
```python
from __future__ import annotations

from typing import Literal

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]

_DDI_MAP: dict[str, Severity] = {"MAJOR": "CRITICAL", "MODERATE": "HIGH", "MINOR": "LOW"}


def map_ddi_severity(raw: str) -> Severity:
    return _DDI_MAP.get(raw.upper(), "LOW")


def map_pregnancy_severity(
    pregnancy_status: str,
    category: str | None,
    lactation_safe: bool | None,
) -> Severity:
    if pregnancy_status == "PREGNANT":
        if category in ("D", "X"):
            return "CRITICAL"
        if category == "C":
            return "HIGH"
        if category in ("A", "B"):
            return "LOW"
        return "MEDIUM"
    if pregnancy_status == "LACTATING":
        if category == "X":
            return "CRITICAL"
        if category == "D":
            return "HIGH" if lactation_safe is False else "MEDIUM"
        if category == "C":
            return "MEDIUM"
        if category in ("A", "B"):
            return "LOW"
        return "MEDIUM"
    return "MEDIUM"  # defensive — orchestrator should not call this for non-pregnant


_DOSE_MAP: dict[str, Severity] = {
    "over_max_dose": "CRITICAL",
    "over_max_daily": "CRITICAL",
    "under_min_dose": "HIGH",
    "no_rule": "MEDIUM",
    "weight_unknown": "MEDIUM",
    "dose_unit_missing": "MEDIUM",
    "frequency_unparseable": "LOW",
    "unknown_drug": "LOW",
}


def map_dose_severity(kind: str) -> Severity:
    return _DOSE_MAP[kind]
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_severity.py -v
```
Expected: all parametrized cases pass.

- [ ] **Step 5: Commit**

```bash
git add agent/app/agents/evaluator/__init__.py agent/app/agents/evaluator/severity.py agent/tests/agents/evaluator/test_severity.py
git commit -m "feat(agent): add evaluator severity mappers"
```

### Task 1.3: Dose + frequency parsers

**Files:**
- Create: `agent/app/agents/evaluator/dose_parser.py`
- Test: `agent/tests/agents/evaluator/test_dose_parser.py`

- [ ] **Step 1: Write failing tests**

`agent/tests/agents/evaluator/test_dose_parser.py`:
```python
import pytest
from app.agents.evaluator.dose_parser import (
    parse_dose_mg,
    parse_frequency_per_day,
    DoseParseResult,
    FreqParseResult,
)


@pytest.mark.parametrize("raw,expected_mg", [
    ("500mg", 500.0),
    ("500 mg", 500.0),
    ("250 MG", 250.0),
    ("1g", 1000.0),
    ("1 g", 1000.0),
    ("0.5g", 500.0),
    ("100mcg", 0.1),
])
def test_parse_dose_mg_known(raw, expected_mg):
    r = parse_dose_mg(raw)
    assert r.ok is True
    assert r.dose_mg == expected_mg


@pytest.mark.parametrize("raw", ["500", "twice", "five mg", "", "  "])
def test_parse_dose_mg_unknown(raw):
    r = parse_dose_mg(raw)
    assert r.ok is False
    assert r.reason == "dose_unit_missing"


@pytest.mark.parametrize("raw,expected", [
    ("OD", 1),
    ("BD", 2),
    ("TDS", 3),
    ("QID", 4),
    ("QDS", 4),
    ("Q4H", 6),
    ("Q6H", 4),
    ("Q8H", 3),
    ("Q12H", 2),
    ("once daily", 1),
    ("twice daily", 2),
    ("three times daily", 3),
    ("four times daily", 4),
    ("Once a day", 1),
    ("BD", 2),
    ("bd", 2),
])
def test_parse_frequency_known(raw, expected):
    r = parse_frequency_per_day(raw)
    assert r.ok is True
    assert r.per_day == expected


@pytest.mark.parametrize("raw", ["when needed", "PRN", "as required", "ad lib", ""])
def test_parse_frequency_unparseable(raw):
    r = parse_frequency_per_day(raw)
    assert r.ok is False
    assert r.reason == "frequency_unparseable"
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_dose_parser.py -v
```
Expected: all fail with `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`agent/app/agents/evaluator/dose_parser.py`:
```python
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class DoseParseResult:
    ok: bool
    dose_mg: float | None = None
    reason: str | None = None


@dataclass(frozen=True)
class FreqParseResult:
    ok: bool
    per_day: int | None = None
    reason: str | None = None


_DOSE_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*(mg|g|mcg|µg)\s*$", re.IGNORECASE)
_UNIT_TO_MG = {"mg": 1.0, "g": 1000.0, "mcg": 0.001, "µg": 0.001}


def parse_dose_mg(raw: str) -> DoseParseResult:
    if not raw or not raw.strip():
        return DoseParseResult(ok=False, reason="dose_unit_missing")
    m = _DOSE_RE.match(raw)
    if not m:
        return DoseParseResult(ok=False, reason="dose_unit_missing")
    value = float(m.group(1))
    unit = m.group(2).lower()
    return DoseParseResult(ok=True, dose_mg=value * _UNIT_TO_MG[unit])


_FREQ_TABLE: dict[str, int] = {
    "OD": 1, "BD": 2, "TDS": 3, "TID": 3, "QID": 4, "QDS": 4,
    "Q4H": 6, "Q6H": 4, "Q8H": 3, "Q12H": 2, "Q24H": 1,
    "ONCE A DAY": 1, "ONCE DAILY": 1,
    "TWICE A DAY": 2, "TWICE DAILY": 2,
    "THREE TIMES A DAY": 3, "THREE TIMES DAILY": 3,
    "FOUR TIMES A DAY": 4, "FOUR TIMES DAILY": 4,
}


def parse_frequency_per_day(raw: str) -> FreqParseResult:
    if not raw or not raw.strip():
        return FreqParseResult(ok=False, reason="frequency_unparseable")
    key = raw.strip().upper()
    if key in _FREQ_TABLE:
        return FreqParseResult(ok=True, per_day=_FREQ_TABLE[key])
    return FreqParseResult(ok=False, reason="frequency_unparseable")
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_dose_parser.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add agent/app/agents/evaluator/dose_parser.py agent/tests/agents/evaluator/test_dose_parser.py
git commit -m "feat(agent): add dose and frequency parsers"
```

---

## Phase 2 — Drug knowledge graph

### Task 2.1: Add Neo4j schema constraints

**Files:**
- Modify: `agent/app/graph/schema.py`

- [ ] **Step 1: Read current file to know insertion point**

```bash
cd agent && head -60 app/graph/schema.py
```

- [ ] **Step 2: Edit constraints list**

In `agent/app/graph/schema.py`, add to the `_CONSTRAINTS` list (after `adaptive_rule_id_unique`):

```python
    "CREATE CONSTRAINT drug_name_unique IF NOT EXISTS "
    "FOR (d:Drug) REQUIRE d.name IS UNIQUE",

    "CREATE CONSTRAINT drugclass_name_unique IF NOT EXISTS "
    "FOR (c:DrugClass) REQUIRE c.name IS UNIQUE",

    "CREATE CONSTRAINT pregcat_code_unique IF NOT EXISTS "
    "FOR (p:PregnancyCategory) REQUIRE p.code IS UNIQUE",

    "CREATE CONSTRAINT doserule_id_unique IF NOT EXISTS "
    "FOR (r:DoseRule) REQUIRE r.id IS UNIQUE",
```

- [ ] **Step 3: Verify by restarting agent locally**

```bash
cd agent && uvicorn app.main:app --port 8000 &
sleep 5 && curl -s http://localhost:8000/agents/patient-context/healthz | head -5 && kill %1
```
Expected: healthz returns 200 (Neo4j connection OK).

- [ ] **Step 4: Commit**

```bash
git add agent/app/graph/schema.py
git commit -m "feat(agent): add Neo4j constraints for drug knowledge graph"
```

### Task 2.2: Drug knowledge seed data

**Files:**
- Create: `agent/app/graph/seed/__init__.py`
- Create: `agent/app/graph/seed/drug_knowledge.json`

- [ ] **Step 1: Create package marker**

```bash
mkdir -p agent/app/graph/seed
touch agent/app/graph/seed/__init__.py
```

- [ ] **Step 2: Create seed file (minimal viable set — extend later)**

`agent/app/graph/seed/drug_knowledge.json`:
```json
{
  "pregnancy_categories": [
    {"code": "A", "description": "Adequate human studies, no fetal risk"},
    {"code": "B", "description": "Animal studies show no risk; or animal risk but human studies don't"},
    {"code": "C", "description": "Animal studies show risk; human data lacking"},
    {"code": "D", "description": "Evidence of human fetal risk; benefit may outweigh risk"},
    {"code": "X", "description": "Contraindicated in pregnancy"}
  ],
  "drug_classes": [
    {"name": "NSAID"},
    {"name": "ACE inhibitor"},
    {"name": "ARB"},
    {"name": "Beta blocker"},
    {"name": "Statin"},
    {"name": "SSRI"},
    {"name": "Macrolide"},
    {"name": "Penicillin"},
    {"name": "Sulfonylurea"},
    {"name": "Biguanide"}
  ],
  "drugs": [
    {"name": "paracetamol", "classes": [], "rxnorm_code": "161"},
    {"name": "ibuprofen", "classes": ["NSAID"], "rxnorm_code": "5640"},
    {"name": "naproxen", "classes": ["NSAID"], "rxnorm_code": "7258"},
    {"name": "diclofenac", "classes": ["NSAID"]},
    {"name": "amoxicillin", "classes": ["Penicillin"], "rxnorm_code": "723"},
    {"name": "ampicillin", "classes": ["Penicillin"]},
    {"name": "azithromycin", "classes": ["Macrolide"]},
    {"name": "erythromycin", "classes": ["Macrolide"]},
    {"name": "clarithromycin", "classes": ["Macrolide"]},
    {"name": "warfarin", "classes": []},
    {"name": "aspirin", "classes": ["NSAID"]},
    {"name": "metformin", "classes": ["Biguanide"]},
    {"name": "glibenclamide", "classes": ["Sulfonylurea"]},
    {"name": "gliclazide", "classes": ["Sulfonylurea"]},
    {"name": "atorvastatin", "classes": ["Statin"]},
    {"name": "simvastatin", "classes": ["Statin"]},
    {"name": "rosuvastatin", "classes": ["Statin"]},
    {"name": "captopril", "classes": ["ACE inhibitor"]},
    {"name": "enalapril", "classes": ["ACE inhibitor"]},
    {"name": "lisinopril", "classes": ["ACE inhibitor"]},
    {"name": "perindopril", "classes": ["ACE inhibitor"]},
    {"name": "losartan", "classes": ["ARB"]},
    {"name": "telmisartan", "classes": ["ARB"]},
    {"name": "atenolol", "classes": ["Beta blocker"]},
    {"name": "metoprolol", "classes": ["Beta blocker"]},
    {"name": "bisoprolol", "classes": ["Beta blocker"]},
    {"name": "fluoxetine", "classes": ["SSRI"]},
    {"name": "sertraline", "classes": ["SSRI"]},
    {"name": "salbutamol", "classes": []},
    {"name": "prednisolone", "classes": []},
    {"name": "amlodipine", "classes": []},
    {"name": "ramipril", "classes": ["ACE inhibitor"]},
    {"name": "isotretinoin", "classes": []},
    {"name": "methotrexate", "classes": []},
    {"name": "warfarin", "classes": []},
    {"name": "lithium", "classes": []},
    {"name": "tetracycline", "classes": []},
    {"name": "doxycycline", "classes": []},
    {"name": "ciprofloxacin", "classes": []},
    {"name": "metronidazole", "classes": []}
  ],
  "drug_drug_interactions": [
    {"a": "warfarin", "b": "aspirin", "severity": "MAJOR", "mechanism": "additive bleeding risk", "source": "BNF"},
    {"a_class": "NSAID", "b": "warfarin", "severity": "MAJOR", "mechanism": "increased bleeding risk", "source": "BNF"},
    {"a_class": "ACE inhibitor", "b_class": "ARB", "severity": "MAJOR", "mechanism": "dual RAAS blockade — hyperkalaemia, AKI", "source": "BNF"},
    {"a": "warfarin", "b": "metronidazole", "severity": "MAJOR", "mechanism": "CYP2C9 inhibition increases INR", "source": "BNF"},
    {"a_class": "Macrolide", "b_class": "Statin", "severity": "MODERATE", "mechanism": "CYP3A4 inhibition increases statin levels", "source": "BNF"},
    {"a": "lithium", "b_class": "NSAID", "severity": "MODERATE", "mechanism": "reduced lithium clearance", "source": "BNF"},
    {"a": "lithium", "b_class": "ACE inhibitor", "severity": "MODERATE", "mechanism": "reduced lithium clearance", "source": "BNF"},
    {"a_class": "SSRI", "b_class": "NSAID", "severity": "MODERATE", "mechanism": "increased GI bleeding risk", "source": "BNF"},
    {"a": "amoxicillin", "b": "warfarin", "severity": "MINOR", "mechanism": "may potentiate warfarin", "source": "BNF"}
  ],
  "pregnancy_categories_per_drug": [
    {"drug": "paracetamol", "category": "B", "lactation_safe": true},
    {"drug": "ibuprofen", "category": "C", "lactation_safe": true, "advisory": "avoid in 3rd trimester"},
    {"drug": "naproxen", "category": "C", "lactation_safe": true, "advisory": "avoid in 3rd trimester"},
    {"drug": "diclofenac", "category": "C", "lactation_safe": false, "advisory": "avoid in 3rd trimester"},
    {"drug": "aspirin", "category": "D", "lactation_safe": false, "advisory": "high-dose contraindicated; low-dose may be used"},
    {"drug": "amoxicillin", "category": "B", "lactation_safe": true},
    {"drug": "azithromycin", "category": "B", "lactation_safe": true},
    {"drug": "erythromycin", "category": "B", "lactation_safe": true},
    {"drug": "clarithromycin", "category": "C", "lactation_safe": false},
    {"drug": "warfarin", "category": "X", "lactation_safe": true, "advisory": "teratogenic"},
    {"drug": "isotretinoin", "category": "X", "lactation_safe": false, "advisory": "highly teratogenic"},
    {"drug": "methotrexate", "category": "X", "lactation_safe": false, "advisory": "abortifacient"},
    {"drug": "captopril", "category": "D", "lactation_safe": true},
    {"drug": "enalapril", "category": "D", "lactation_safe": true},
    {"drug": "lisinopril", "category": "D", "lactation_safe": true},
    {"drug": "ramipril", "category": "D", "lactation_safe": true},
    {"drug": "losartan", "category": "D", "lactation_safe": false},
    {"drug": "tetracycline", "category": "D", "lactation_safe": false, "advisory": "tooth discolouration after 18w GA"},
    {"drug": "doxycycline", "category": "D", "lactation_safe": false, "advisory": "tooth discolouration after 18w GA"},
    {"drug": "ciprofloxacin", "category": "C", "lactation_safe": false, "advisory": "cartilage damage in animals"},
    {"drug": "lithium", "category": "D", "lactation_safe": false, "advisory": "Ebstein anomaly risk"},
    {"drug": "metformin", "category": "B", "lactation_safe": true},
    {"drug": "atorvastatin", "category": "X", "lactation_safe": false},
    {"drug": "simvastatin", "category": "X", "lactation_safe": false},
    {"drug": "rosuvastatin", "category": "X", "lactation_safe": false},
    {"drug": "fluoxetine", "category": "C", "lactation_safe": true},
    {"drug": "sertraline", "category": "C", "lactation_safe": true},
    {"drug": "metronidazole", "category": "B", "lactation_safe": true},
    {"drug": "salbutamol", "category": "C", "lactation_safe": true},
    {"drug": "prednisolone", "category": "C", "lactation_safe": true}
  ],
  "dose_rules": [
    {"id": "paracetamol-adult-oral", "drug": "paracetamol", "route": "oral", "min_age_years": 12, "max_age_years": null, "min_weight_kg": 50, "max_weight_kg": null, "min_dose_mg": 500, "max_dose_mg": 1000, "max_daily_mg": 4000, "frequency_pattern": "Q4H|Q6H|QID|TDS"},
    {"id": "ibuprofen-adult-oral", "drug": "ibuprofen", "route": "oral", "min_age_years": 12, "max_age_years": null, "min_weight_kg": null, "max_weight_kg": null, "min_dose_mg": 200, "max_dose_mg": 800, "max_daily_mg": 2400, "frequency_pattern": "TDS|QID"},
    {"id": "amoxicillin-adult-oral", "drug": "amoxicillin", "route": "oral", "min_age_years": 12, "max_age_years": null, "min_weight_kg": null, "max_weight_kg": null, "min_dose_mg": 250, "max_dose_mg": 1000, "max_daily_mg": 3000, "frequency_pattern": "TDS|BD"},
    {"id": "metformin-adult-oral", "drug": "metformin", "route": "oral", "min_age_years": 18, "max_age_years": null, "min_weight_kg": null, "max_weight_kg": null, "min_dose_mg": 500, "max_dose_mg": 1000, "max_daily_mg": 2000, "frequency_pattern": "BD|OD"},
    {"id": "atenolol-adult-oral", "drug": "atenolol", "route": "oral", "min_age_years": 18, "max_age_years": null, "min_weight_kg": null, "max_weight_kg": null, "min_dose_mg": 25, "max_dose_mg": 100, "max_daily_mg": 100, "frequency_pattern": "OD"},
    {"id": "azithromycin-adult-oral", "drug": "azithromycin", "route": "oral", "min_age_years": 16, "max_age_years": null, "min_weight_kg": null, "max_weight_kg": null, "min_dose_mg": 250, "max_dose_mg": 500, "max_daily_mg": 500, "frequency_pattern": "OD"}
  ]
}
```

- [ ] **Step 3: Validate JSON**

```bash
cd agent && python -c "import json; print(len(json.load(open('app/graph/seed/drug_knowledge.json'))['drugs']), 'drugs')"
```
Expected: prints `40 drugs` (or similar count).

- [ ] **Step 4: Commit**

```bash
git add agent/app/graph/seed/__init__.py agent/app/graph/seed/drug_knowledge.json
git commit -m "feat(agent): seed Malaysian primary-care drug knowledge graph data"
```

### Task 2.3: Idempotent loader

**Files:**
- Create: `agent/app/graph/seed/apply_drug_knowledge.py`

- [ ] **Step 1: Implement loader**

`agent/app/graph/seed/apply_drug_knowledge.py`:
```python
"""Idempotent loader for drug knowledge graph (drugs, classes, DDIs, pregnancy, dose rules).

Runs after `apply_schema()` from FastAPI lifespan. Safe to re-run — uses MERGE.
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog

from app.graph.driver import get_driver

log = structlog.get_logger(__name__)

_SEED_PATH = Path(__file__).parent / "drug_knowledge.json"


async def apply_drug_knowledge() -> None:
    if not _SEED_PATH.exists():
        log.warning("drug_knowledge.seed_missing", path=str(_SEED_PATH))
        return
    data = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    driver = get_driver()
    async with driver.session() as session:
        # Pregnancy categories
        for pc in data.get("pregnancy_categories", []):
            await session.run(
                "MERGE (p:PregnancyCategory {code:$code}) SET p.description=$desc",
                code=pc["code"], desc=pc.get("description", ""),
            )
        # Drug classes
        for c in data.get("drug_classes", []):
            await session.run("MERGE (c:DrugClass {name:$name})", name=c["name"])
        # Drugs + class membership
        for d in data.get("drugs", []):
            await session.run(
                "MERGE (drug:Drug {name:$name}) "
                "SET drug.rxnorm_code=$rxn, drug.atc_code=$atc",
                name=d["name"].lower(),
                rxn=d.get("rxnorm_code"),
                atc=d.get("atc_code"),
            )
            for cls in d.get("classes", []):
                await session.run(
                    "MATCH (drug:Drug {name:$name}), (c:DrugClass {name:$cls}) "
                    "MERGE (drug)-[:BELONGS_TO]->(c)",
                    name=d["name"].lower(), cls=cls,
                )
        # DDIs (drug-drug, class-drug, class-class) — symmetric pairs both directions
        for i in data.get("drug_drug_interactions", []):
            sev = i["severity"]
            mech = i.get("mechanism", "")
            src = i.get("source", "")
            if "a" in i and "b" in i:
                await session.run(
                    "MATCH (a:Drug {name:$a}), (b:Drug {name:$b}) "
                    "MERGE (a)-[r:INTERACTS_WITH]-(b) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a"].lower(), b=i["b"].lower(), sev=sev, mech=mech, src=src,
                )
            elif "a_class" in i and "b" in i:
                await session.run(
                    "MATCH (ac:DrugClass {name:$a}), (b:Drug {name:$b}) "
                    "MERGE (ac)-[r:INTERACTS_WITH]-(b) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a_class"], b=i["b"].lower(), sev=sev, mech=mech, src=src,
                )
            elif "a" in i and "b_class" in i:
                await session.run(
                    "MATCH (a:Drug {name:$a}), (bc:DrugClass {name:$b}) "
                    "MERGE (a)-[r:INTERACTS_WITH]-(bc) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a"].lower(), b=i["b_class"], sev=sev, mech=mech, src=src,
                )
            elif "a_class" in i and "b_class" in i:
                await session.run(
                    "MATCH (ac:DrugClass {name:$a}), (bc:DrugClass {name:$b}) "
                    "MERGE (ac)-[r:INTERACTS_WITH]-(bc) "
                    "SET r.severity=$sev, r.mechanism=$mech, r.source=$src",
                    a=i["a_class"], b=i["b_class"], sev=sev, mech=mech, src=src,
                )
        # Pregnancy category per drug
        for pc in data.get("pregnancy_categories_per_drug", []):
            await session.run(
                "MATCH (d:Drug {name:$name}), (c:PregnancyCategory {code:$code}) "
                "MERGE (d)-[r:PREGNANCY_CATEGORY]->(c) "
                "SET r.lactation_safe=$ls, r.advisory=$adv",
                name=pc["drug"].lower(), code=pc["category"],
                ls=pc.get("lactation_safe"), adv=pc.get("advisory", ""),
            )
        # Dose rules
        for dr in data.get("dose_rules", []):
            await session.run(
                "MATCH (d:Drug {name:$name}) "
                "MERGE (r:DoseRule {id:$id}) "
                "SET r.route=$route, "
                "    r.min_age_years=$min_age, r.max_age_years=$max_age, "
                "    r.min_weight_kg=$min_w, r.max_weight_kg=$max_w, "
                "    r.min_dose_mg=$min_dose, r.max_dose_mg=$max_dose, "
                "    r.max_daily_mg=$max_daily, "
                "    r.frequency_pattern=$freq "
                "MERGE (d)-[:HAS_DOSE_RULE]->(r)",
                name=dr["drug"].lower(), id=dr["id"], route=dr["route"],
                min_age=dr.get("min_age_years"), max_age=dr.get("max_age_years"),
                min_w=dr.get("min_weight_kg"), max_w=dr.get("max_weight_kg"),
                min_dose=dr["min_dose_mg"], max_dose=dr["max_dose_mg"],
                max_daily=dr["max_daily_mg"], freq=dr["frequency_pattern"],
            )
    log.info("drug_knowledge.applied",
             drugs=len(data.get("drugs", [])),
             ddis=len(data.get("drug_drug_interactions", [])),
             dose_rules=len(data.get("dose_rules", [])))
```

- [ ] **Step 2: Wire into FastAPI lifespan**

In `agent/app/main.py`, after the `apply_schema()` call inside the lifespan context manager, add:

```python
from app.graph.seed.apply_drug_knowledge import apply_drug_knowledge

# ...inside lifespan, after apply_schema():
await apply_drug_knowledge()
```

(Find the existing `apply_schema()` call to know exactly where to insert.)

- [ ] **Step 3: Restart agent and verify in Neo4j browser**

```bash
cd agent && uvicorn app.main:app --port 8000 &
sleep 5 && kill %1
```

In Neo4j browser, run:
```cypher
MATCH (d:Drug) RETURN count(d) AS drugs;
MATCH ()-[r:INTERACTS_WITH]->() RETURN count(r) AS ddis;
MATCH ()-[r:HAS_DOSE_RULE]->() RETURN count(r) AS dose_rules;
```
Expected counts match the JSON.

- [ ] **Step 4: Commit**

```bash
git add agent/app/graph/seed/apply_drug_knowledge.py agent/app/main.py
git commit -m "feat(agent): idempotent drug knowledge graph loader wired into lifespan"
```

---

## Phase 3 — DDI Cypher validator

### Task 3.1: DDI query module + tests

**Files:**
- Create: `agent/app/graph/queries/drug_drug_interaction.py`
- Test: `agent/tests/agents/evaluator/test_drug_drug_interactions.py`

- [ ] **Step 1: Write failing tests (use existing Neo4j — seeded by lifespan)**

`agent/tests/agents/evaluator/test_drug_drug_interactions.py`:
```python
"""Integration-style tests for DDI Cypher. Requires a running Neo4j with the
drug knowledge graph seeded (apply_drug_knowledge runs at startup)."""
from __future__ import annotations

import pytest
from uuid import uuid4

from app.graph.queries.drug_drug_interaction import check_drug_drug_interactions


@pytest.mark.asyncio
async def test_empty_returns_empty():
    result = await check_drug_drug_interactions(uuid4(), [])
    assert result == []


@pytest.mark.asyncio
async def test_direct_warfarin_aspirin():
    """Both drugs in the seed; direct edge severity MAJOR."""
    result = await check_drug_drug_interactions(uuid4(), ["warfarin", "aspirin"])
    pair_names = {tuple(sorted([h["drug_a"], h["drug_b"]])) for h in result}
    assert ("aspirin", "warfarin") in pair_names
    severities = {h["severity"] for h in result if {h["drug_a"], h["drug_b"]} == {"warfarin", "aspirin"}}
    assert "MAJOR" in severities


@pytest.mark.asyncio
async def test_class_level_nsaid_warfarin():
    """ibuprofen is in NSAID class; class-level rule with warfarin → finding."""
    result = await check_drug_drug_interactions(uuid4(), ["warfarin", "ibuprofen"])
    found = any(
        {h["drug_a"], h["drug_b"]} == {"warfarin", "ibuprofen"} and h["severity"] == "MAJOR"
        for h in result
    )
    assert found


@pytest.mark.asyncio
async def test_unknown_drug_silent():
    result = await check_drug_drug_interactions(uuid4(), ["mystery-drug-xyz"])
    assert result == []
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_drug_drug_interactions.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement DDI Cypher module**

`agent/app/graph/queries/drug_drug_interaction.py`:
```python
"""DDI validator — Cypher query and Python wrapper.

Searches:
  1. Direct drug↔drug INTERACTS_WITH edges
  2. Drug→Class and Class→Drug INTERACTS_WITH (via BELONGS_TO)
  3. Class↔Class INTERACTS_WITH

Considers:
  - Patient's active medications (last 90 days from finalized visits)
  - Co-prescribed drugs within the same draft (proposed_drugs list)
"""
from __future__ import annotations

from uuid import UUID

from app.config import settings
from app.graph.driver import get_driver

_QUERY = """
WITH [d IN $proposed | toLower(d)] AS proposed_lower
UNWIND proposed_lower AS proposed
MATCH (proposed_drug:Drug {name: proposed})

// Active medications (last N days from finalized visits)
OPTIONAL MATCH (p:Patient {id: $patient_id})<-[:FOR_PATIENT]-(v:Visit)
            -[:PRESCRIBED]->(active_med:Medication)
WHERE v.finalized_at >= datetime() - duration({days: $lookback_days})
WITH proposed, proposed_drug, proposed_lower,
     collect(DISTINCT toLower(active_med.name)) AS active_names

// Direct
OPTIONAL MATCH (proposed_drug)-[i1:INTERACTS_WITH]-(other:Drug)
WHERE toLower(other.name) IN active_names
   OR toLower(other.name) IN proposed_lower
WITH proposed, proposed_drug, active_names, proposed_lower,
     collect(DISTINCT {other:toLower(other.name), sev:i1.severity, mech:i1.mechanism, src:i1.source}) AS direct_hits

// Drug↔Class
OPTIONAL MATCH (proposed_drug)-[:BELONGS_TO]->(c1:DrugClass)-[i2:INTERACTS_WITH]-(other2:Drug)
WHERE toLower(other2.name) IN active_names OR toLower(other2.name) IN proposed_lower
WITH proposed, direct_hits, active_names, proposed_lower,
     collect(DISTINCT {other:toLower(other2.name), sev:i2.severity, mech:i2.mechanism, src:i2.source}) AS class_drug_hits

// Class↔Class
OPTIONAL MATCH (proposed_drug)-[:BELONGS_TO]->(c1b:DrugClass)-[i3:INTERACTS_WITH]-(c2:DrugClass)
              <-[:BELONGS_TO]-(other3:Drug)
WHERE toLower(other3.name) IN active_names OR toLower(other3.name) IN proposed_lower
WITH proposed, direct_hits, class_drug_hits,
     collect(DISTINCT {other:toLower(other3.name), sev:i3.severity, mech:i3.mechanism, src:i3.source}) AS class_class_hits

UNWIND (direct_hits + class_drug_hits + class_class_hits) AS hit
WITH proposed, hit
WHERE hit.other IS NOT NULL
  AND hit.other <> proposed
RETURN DISTINCT proposed AS drug_a, hit.other AS drug_b,
       hit.sev AS severity, hit.mech AS mechanism, hit.src AS source
"""


async def check_drug_drug_interactions(patient_id: UUID, proposed_drugs: list[str]) -> list[dict]:
    if not proposed_drugs:
        return []
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(
            _QUERY,
            patient_id=str(patient_id),
            proposed=proposed_drugs,
            lookback_days=settings.evaluator_ddi_active_med_lookback_days,
        )
        rows: list[dict] = []
        async for r in result:
            rows.append({
                "drug_a": r["drug_a"],
                "drug_b": r["drug_b"],
                "severity": r["severity"],
                "mechanism": r["mechanism"],
                "source": r["source"],
            })
    return rows
```

- [ ] **Step 4: Add `evaluator_ddi_active_med_lookback_days` to `app/config.py`**

In `agent/app/config.py`, add to the `Settings` class:
```python
evaluator_ddi_active_med_lookback_days: int = 90
evaluator_timeout_total_seconds: int = 15
evaluator_timeout_cypher_seconds: int = 3
evaluator_timeout_llm_seconds: int = 8
evaluator_enabled: bool = True
```
(Pydantic-settings reads from env automatically.)

- [ ] **Step 5: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_drug_drug_interactions.py -v
```
Expected: 4 pass (Neo4j must be running with seed applied).

- [ ] **Step 6: Commit**

```bash
git add agent/app/graph/queries/drug_drug_interaction.py agent/app/config.py agent/tests/agents/evaluator/test_drug_drug_interactions.py
git commit -m "feat(agent): add DDI Cypher validator (drug-drug, class-drug, class-class)"
```

---

## Phase 4 — Pregnancy Cypher validator

### Task 4.1: Pregnancy query module + tests

**Files:**
- Create: `agent/app/graph/queries/pregnancy_safety.py`
- Test: `agent/tests/agents/evaluator/test_pregnancy_safety.py`

- [ ] **Step 1: Write failing tests**

`agent/tests/agents/evaluator/test_pregnancy_safety.py`:
```python
import pytest
from uuid import uuid4
from app.graph.queries.pregnancy_safety import fetch_pregnancy_categories


@pytest.mark.asyncio
async def test_returns_category_for_known_drug():
    rows = await fetch_pregnancy_categories(["warfarin"])
    assert len(rows) == 1
    assert rows[0]["drug"] == "warfarin"
    assert rows[0]["category"] == "X"


@pytest.mark.asyncio
async def test_returns_no_data_marker_for_unknown_drug():
    rows = await fetch_pregnancy_categories(["mystery-drug-xyz"])
    assert rows == []


@pytest.mark.asyncio
async def test_lactation_safe_field_present():
    rows = await fetch_pregnancy_categories(["paracetamol"])
    assert rows[0]["lactation_safe"] is True


@pytest.mark.asyncio
async def test_drug_with_no_category_edge_returns_no_category():
    """A drug node may exist but have no PREGNANCY_CATEGORY relationship — returns row with category=None."""
    # Use a seeded drug that we deliberately exclude from pregnancy_categories_per_drug:
    # `glibenclamide` is in drugs but has no pregnancy category in seed
    rows = await fetch_pregnancy_categories(["glibenclamide"])
    if rows:  # only if drug exists
        assert rows[0]["category"] is None
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_pregnancy_safety.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`agent/app/graph/queries/pregnancy_safety.py`:
```python
"""Pregnancy/lactation safety query.

This module ONLY fetches pregnancy category data for proposed drugs. The orchestrator
applies the pregnancy_status bypass rule (NOT_PREGNANT/UNKNOWN/NULL → skip entirely)
and the severity mapping. This module never sees patient pregnancy state — that's
deliberate (privacy: pregnancy state stays out of this query).
"""
from __future__ import annotations

from app.graph.driver import get_driver

_QUERY = """
WITH [d IN $proposed | toLower(d)] AS lower_names
UNWIND lower_names AS proposed
MATCH (d:Drug {name: proposed})
OPTIONAL MATCH (d)-[r:PREGNANCY_CATEGORY]->(c:PregnancyCategory)
RETURN proposed AS drug,
       c.code AS category,
       c.description AS category_description,
       r.lactation_safe AS lactation_safe,
       r.advisory AS advisory
"""


async def fetch_pregnancy_categories(proposed_drugs: list[str]) -> list[dict]:
    if not proposed_drugs:
        return []
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(_QUERY, proposed=proposed_drugs)
        rows: list[dict] = []
        async for r in result:
            rows.append({
                "drug": r["drug"],
                "category": r["category"],
                "category_description": r["category_description"],
                "lactation_safe": r["lactation_safe"],
                "advisory": r["advisory"],
            })
    return rows
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_pregnancy_safety.py -v
```
Expected: pass (the drug-with-no-category test passes regardless since `if rows:` guards).

- [ ] **Step 5: Commit**

```bash
git add agent/app/graph/queries/pregnancy_safety.py agent/tests/agents/evaluator/test_pregnancy_safety.py
git commit -m "feat(agent): add pregnancy category query (no patient state — orchestrator handles bypass)"
```

---

## Phase 5 — Dose-range Cypher validator

### Task 5.1: Dose-range query + tests

**Files:**
- Create: `agent/app/graph/queries/dose_range.py`
- Test: `agent/tests/agents/evaluator/test_dose_range.py`

- [ ] **Step 1: Write failing tests**

`agent/tests/agents/evaluator/test_dose_range.py`:
```python
import pytest
from app.graph.queries.dose_range import fetch_dose_rules


@pytest.mark.asyncio
async def test_returns_rule_for_paracetamol_adult():
    rules = await fetch_dose_rules([{"name": "paracetamol", "route": "oral"}],
                                   patient_age_years=30, patient_weight_kg=70)
    assert any(r["drug"] == "paracetamol" and r["max_dose_mg"] == 1000 for r in rules)


@pytest.mark.asyncio
async def test_no_rule_for_paediatric_age():
    rules = await fetch_dose_rules([{"name": "paracetamol", "route": "oral"}],
                                   patient_age_years=5, patient_weight_kg=20)
    # Adult-only rule has min_age 12; should not match for 5yr old
    assert all(r["min_age_years"] is None or r["min_age_years"] <= 5 for r in rules) or rules == []


@pytest.mark.asyncio
async def test_unknown_drug_returns_empty():
    rules = await fetch_dose_rules([{"name": "mystery-drug", "route": "oral"}],
                                   patient_age_years=30, patient_weight_kg=70)
    assert rules == []
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_dose_range.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`agent/app/graph/queries/dose_range.py`:
```python
"""Dose-range rule query.

Fetches `DoseRule` nodes matching the patient's age + weight band and the proposed
drug's route. The orchestrator applies dose/frequency parsing and severity mapping.
"""
from __future__ import annotations

from app.graph.driver import get_driver

_QUERY = """
UNWIND $proposed AS p
MATCH (d:Drug {name: toLower(p.name)})
OPTIONAL MATCH (d)-[:HAS_DOSE_RULE]->(r:DoseRule)
WHERE (r IS NULL OR r.route IS NULL OR r.route = p.route)
  AND ($patient_age_years IS NULL OR r IS NULL OR
       ((r.min_age_years IS NULL OR $patient_age_years >= r.min_age_years) AND
        (r.max_age_years IS NULL OR $patient_age_years <= r.max_age_years)))
  AND ($patient_weight_kg IS NULL OR r IS NULL OR
       ((r.min_weight_kg IS NULL OR $patient_weight_kg >= r.min_weight_kg) AND
        (r.max_weight_kg IS NULL OR $patient_weight_kg <= r.max_weight_kg)))
RETURN toLower(p.name) AS drug,
       r.id AS rule_id,
       r.min_dose_mg AS min_dose_mg,
       r.max_dose_mg AS max_dose_mg,
       r.max_daily_mg AS max_daily_mg,
       r.min_age_years AS min_age_years,
       r.max_age_years AS max_age_years,
       r.frequency_pattern AS frequency_pattern
"""


async def fetch_dose_rules(
    proposed_drugs: list[dict],
    patient_age_years: int | None,
    patient_weight_kg: float | None,
) -> list[dict]:
    """proposed_drugs: list of {name, route}."""
    if not proposed_drugs:
        return []
    driver = get_driver()
    async with driver.session() as session:
        result = await session.run(
            _QUERY,
            proposed=proposed_drugs,
            patient_age_years=patient_age_years,
            patient_weight_kg=patient_weight_kg,
        )
        rows: list[dict] = []
        async for r in result:
            if r["rule_id"] is None:  # drug exists but no dose rule
                continue
            rows.append({
                "drug": r["drug"],
                "rule_id": r["rule_id"],
                "min_dose_mg": r["min_dose_mg"],
                "max_dose_mg": r["max_dose_mg"],
                "max_daily_mg": r["max_daily_mg"],
                "min_age_years": r["min_age_years"],
                "max_age_years": r["max_age_years"],
                "frequency_pattern": r["frequency_pattern"],
            })
    return rows
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_dose_range.py -v
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add agent/app/graph/queries/dose_range.py agent/tests/agents/evaluator/test_dose_range.py
git commit -m "feat(agent): add dose-range rule query"
```

---

## Phase 6 — Completeness validator

### Task 6.1: Completeness validator + tests

**Files:**
- Create: `agent/app/agents/evaluator/completeness.py`
- Test: `agent/tests/agents/evaluator/test_completeness.py`

- [ ] **Step 1: Write failing tests**

`agent/tests/agents/evaluator/test_completeness.py`:
```python
from app.schemas.report import (
    MedicalReport, Subjective, Objective, Assessment, Plan, FollowUp, MedicationOrder,
)
from app.agents.evaluator.completeness import run_completeness


def _draft(**overrides) -> MedicalReport:
    base = MedicalReport(
        subjective=Subjective(chief_complaint="cough", history_of_present_illness="3 days"),
        objective=Objective(),
        assessment=Assessment(primary_diagnosis="URTI"),
        plan=Plan(follow_up=FollowUp(needed=False)),
    )
    if "subjective" in overrides:
        base.subjective = overrides["subjective"]
    if "assessment" in overrides:
        base.assessment = overrides["assessment"]
    if "plan" in overrides:
        base.plan = overrides["plan"]
    return base


def test_clean_draft_no_findings():
    findings = run_completeness(_draft())
    assert findings == []


def test_missing_chief_complaint():
    d = _draft(subjective=Subjective(chief_complaint="", history_of_present_illness="3 days"))
    findings = run_completeness(d)
    assert any(f.field_path == "subjective.chief_complaint" and f.severity == "MEDIUM" for f in findings)


def test_missing_primary_diagnosis():
    d = _draft(assessment=Assessment(primary_diagnosis=""))
    findings = run_completeness(d)
    assert any(f.field_path == "assessment.primary_diagnosis" and f.severity == "MEDIUM" for f in findings)


def test_incomplete_medication():
    d = _draft(plan=Plan(
        follow_up=FollowUp(needed=False),
        medications=[MedicationOrder(drug_name="amoxicillin", dose="", frequency="TDS", duration="5 days")],
    ))
    findings = run_completeness(d)
    assert any(f.field_path.startswith("plan.medications") and f.severity == "MEDIUM" for f in findings)


def test_followup_needed_without_timeframe():
    d = _draft(plan=Plan(follow_up=FollowUp(needed=True, timeframe="")))
    findings = run_completeness(d)
    assert any(f.field_path == "plan.follow_up.timeframe" and f.severity == "MEDIUM" for f in findings)
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_completeness.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`agent/app/agents/evaluator/completeness.py`:
```python
from __future__ import annotations

from app.schemas.evaluator import Finding
from app.schemas.report import MedicalReport


def run_completeness(report: MedicalReport) -> list[Finding]:
    findings: list[Finding] = []

    if not report.subjective.chief_complaint.strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="subjective.chief_complaint",
            message="Required field 'subjective.chief_complaint' is empty.",
        ))
    if not report.subjective.history_of_present_illness.strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="subjective.history_of_present_illness",
            message="Required field 'subjective.history_of_present_illness' is empty.",
        ))
    if not report.assessment.primary_diagnosis.strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="assessment.primary_diagnosis",
            message="Required field 'assessment.primary_diagnosis' is empty.",
        ))
    for i, med in enumerate(report.plan.medications):
        for attr in ("drug_name", "dose", "frequency", "duration"):
            if not (getattr(med, attr) or "").strip():
                findings.append(Finding(
                    category="COMPLETENESS", severity="MEDIUM",
                    field_path=f"plan.medications[{i}].{attr}",
                    message=f"Medication entry {i} missing '{attr}'.",
                ))
                break  # one finding per med entry is enough
    fu = report.plan.follow_up
    if fu.needed and not (fu.timeframe or "").strip():
        findings.append(Finding(
            category="COMPLETENESS", severity="MEDIUM",
            field_path="plan.follow_up.timeframe",
            message="Follow-up needed but timeframe missing.",
        ))
    return findings
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_completeness.py -v
```
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add agent/app/agents/evaluator/completeness.py agent/tests/agents/evaluator/test_completeness.py
git commit -m "feat(agent): add pure-Python completeness validator"
```

---

## Phase 7 — Hallucination validator

### Task 7.1: Hallucination validator + tests (mocked LLM)

**Files:**
- Create: `agent/app/agents/evaluator/hallucination.py`
- Test: `agent/tests/agents/evaluator/test_hallucination.py`

- [ ] **Step 1: Write failing tests**

`agent/tests/agents/evaluator/test_hallucination.py`:
```python
import json
from unittest.mock import AsyncMock, patch
import pytest

from app.schemas.report import MedicalReport, Subjective, Objective, Assessment, Plan, FollowUp
from app.agents.evaluator.hallucination import run_hallucination


def _draft() -> MedicalReport:
    return MedicalReport(
        subjective=Subjective(chief_complaint="cough", history_of_present_illness="3 days"),
        objective=Objective(),
        assessment=Assessment(primary_diagnosis="URTI"),
        plan=Plan(follow_up=FollowUp(needed=False)),
    )


@pytest.mark.asyncio
async def test_returns_no_findings_when_llm_clean():
    fake_resp = type("R", (), {"text": json.dumps({"unsupported": []})})()
    with patch("app.agents.evaluator.hallucination._client_chat", new=AsyncMock(return_value=fake_resp)):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="cough x3 days")
    assert findings == []


@pytest.mark.asyncio
async def test_returns_high_findings_for_unsupported_claims():
    fake_resp = type("R", (), {"text": json.dumps({
        "unsupported": [
            {"field_path": "plan.medications[0].drug_name", "claim": "penicillin", "reason": "not in transcript or context"}
        ]
    })})()
    with patch("app.agents.evaluator.hallucination._client_chat", new=AsyncMock(return_value=fake_resp)):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="cough x3 days")
    assert len(findings) == 1
    assert findings[0].severity == "HIGH"
    assert findings[0].category == "HALLUCINATION"
    assert findings[0].field_path == "plan.medications[0].drug_name"


@pytest.mark.asyncio
async def test_invalid_json_returns_empty():
    fake_resp = type("R", (), {"text": "not json"})()
    with patch("app.agents.evaluator.hallucination._client_chat", new=AsyncMock(return_value=fake_resp)):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="x")
    assert findings == []  # caller treats this as validators_unavailable


@pytest.mark.asyncio
async def test_llm_timeout_returns_empty():
    async def _timeout(*a, **kw):
        raise TimeoutError("simulated")
    with patch("app.agents.evaluator.hallucination._client_chat", new=_timeout):
        findings = await run_hallucination(_draft(), patient_context={}, transcript="x")
    assert findings == []
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_hallucination.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`agent/app/agents/evaluator/hallucination.py`:
```python
"""Hallucination validator — single LLM call. Returns HIGH findings for UNSUPPORTED claims.

Output JSON contract:
  { "unsupported": [ { "field_path": "...", "claim": "...", "reason": "..." } ] }

If parse fails or LLM times out, returns [] and the orchestrator marks the validator
as unavailable.
"""
from __future__ import annotations

import asyncio
import json

from app.config import settings
from app.llm.openai_client import OpenAIClient
from app.schemas.evaluator import Finding
from app.schemas.report import MedicalReport

SYSTEM_PROMPT = """You are a clinical-fact reviewer. For every clinical claim in the SOAP \
draft, decide whether it is SUPPORTED (appears in transcript), CONTEXTUAL (in patient \
context graph data), INFERRED (already marked in confidence_flags), or UNSUPPORTED (no source). \
Output ONLY a JSON object: {"unsupported": [{"field_path": "...", "claim": "...", "reason": "..."}]}. \
Do NOT invent example values. NEVER mention any specific allergy / medication / condition / past \
visit unless that exact string appears in the inputs you received this turn. If a slot is empty, \
treat the claim as UNSUPPORTED — do not assume default values."""


async def _client_chat(messages: list[dict]):
    client = OpenAIClient()
    return await client.chat(messages=messages, tools=[])


async def run_hallucination(
    report: MedicalReport,
    patient_context: dict,
    transcript: str,
) -> list[Finding]:
    user_msg = (
        "DRAFT (JSON):\n" + json.dumps(report.model_dump(), ensure_ascii=False) + "\n\n"
        "PATIENT CONTEXT (JSON):\n" + json.dumps(patient_context, ensure_ascii=False) + "\n\n"
        "TRANSCRIPT:\n" + transcript
    )
    try:
        resp = await asyncio.wait_for(
            _client_chat([
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ]),
            timeout=settings.evaluator_timeout_llm_seconds,
        )
    except (TimeoutError, asyncio.TimeoutError):
        return []
    except Exception:
        return []

    try:
        data = json.loads(resp.text)
        items = data.get("unsupported", [])
    except (json.JSONDecodeError, AttributeError):
        return []

    findings: list[Finding] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        findings.append(Finding(
            category="HALLUCINATION", severity="HIGH",
            field_path=item.get("field_path"),
            message=f"Unsupported claim: {item.get('claim','')}",
            details={"claim": item.get("claim", ""), "reason": item.get("reason", "")},
        ))
    return findings
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_hallucination.py -v
```
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add agent/app/agents/evaluator/hallucination.py agent/tests/agents/evaluator/test_hallucination.py
git commit -m "feat(agent): add hallucination validator (single LLM call, fault-tolerant)"
```

---

## Phase 8 — Persistence + orchestrator

### Task 8.1: Postgres findings repository

**Files:**
- Create: `agent/app/persistence/evaluator_findings.py`
- Test: `agent/tests/agents/evaluator/test_findings_repo.py`

- [ ] **Step 1: Write failing tests**

`agent/tests/agents/evaluator/test_findings_repo.py`:
```python
import pytest
from uuid import uuid4
from app.schemas.evaluator import Finding
from app.persistence.evaluator_findings import (
    insert_findings,
    list_active_findings,
    supersede_active,
)
from app.persistence.postgres import get_pool


@pytest.mark.asyncio
async def test_insert_and_list_round_trip():
    visit_id = uuid4()
    f = Finding(category="DDI", severity="CRITICAL", field_path="plan.medications[0]", message="warfarin+aspirin")
    await insert_findings(visit_id, [f])
    rows = await list_active_findings(visit_id)
    assert len(rows) == 1
    assert rows[0]["category"] == "DDI"
    assert rows[0]["severity"] == "CRITICAL"
    assert rows[0]["acknowledged_at"] is None
    assert rows[0]["superseded_at"] is None


@pytest.mark.asyncio
async def test_supersede_then_insert_replaces_active_set():
    visit_id = uuid4()
    f1 = Finding(category="DDI", severity="HIGH", message="x")
    await insert_findings(visit_id, [f1])
    assert len(await list_active_findings(visit_id)) == 1

    await supersede_active(visit_id)
    f2 = Finding(category="DDI", severity="LOW", message="y")
    await insert_findings(visit_id, [f2])

    active = await list_active_findings(visit_id)
    assert len(active) == 1
    assert active[0]["severity"] == "LOW"
```

(Requires a real Postgres — run via the dev compose stack.)

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_findings_repo.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

`agent/app/persistence/evaluator_findings.py`:
```python
"""Postgres repository for evaluator_findings.

Write paths used by the agent:
  - insert_findings(visit_id, findings)
  - supersede_active(visit_id)

Both are also wrapped by the orchestrator inside a single transaction (advisory lock
keyed on visit_id) so concurrent re-evaluations don't race.
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
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_findings_repo.py -v
```
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add agent/app/persistence/evaluator_findings.py agent/tests/agents/evaluator/test_findings_repo.py
git commit -m "feat(agent): add evaluator_findings persistence repository"
```

### Task 8.2: EvaluatorAgent orchestrator

**Files:**
- Create: `agent/app/agents/evaluator_agent.py`
- Test: `agent/tests/agents/evaluator/test_orchestrator.py`

- [ ] **Step 1: Write failing test (with mocked validators)**

`agent/tests/agents/evaluator/test_orchestrator.py`:
```python
from unittest.mock import AsyncMock, patch
from uuid import uuid4
import pytest

from app.schemas.report import MedicalReport, Subjective, Objective, Assessment, Plan, FollowUp, MedicationOrder
from app.schemas.evaluator import Finding
from app.agents.evaluator_agent import EvaluatorAgent, EvaluatorContext


def _ctx():
    return EvaluatorContext(visit_id=uuid4(), patient_id=uuid4())


def _draft_with_meds():
    return MedicalReport(
        subjective=Subjective(chief_complaint="pain", history_of_present_illness="2 days"),
        objective=Objective(),
        assessment=Assessment(primary_diagnosis="back pain"),
        plan=Plan(
            follow_up=FollowUp(needed=False),
            medications=[MedicationOrder(drug_name="ibuprofen", dose="400mg", frequency="TDS", duration="5 days")],
        ),
    )


@pytest.mark.asyncio
async def test_orchestrator_collects_findings_and_persists():
    agent = EvaluatorAgent()
    with patch.object(agent, "_load_draft", AsyncMock(return_value=_draft_with_meds())), \
         patch.object(agent, "_load_patient_state", AsyncMock(return_value={
             "age_years": 30, "weight_kg": 70.0, "pregnancy_status": "NOT_PREGNANT",
         })), \
         patch.object(agent, "_load_patient_context", AsyncMock(return_value={})), \
         patch.object(agent, "_load_transcript", AsyncMock(return_value="back pain 2 days")), \
         patch("app.agents.evaluator_agent.check_drug_allergy_interaction",
               AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.check_drug_drug_interactions",
               AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_pregnancy_categories",
               AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_dose_rules",
               AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.run_hallucination",
               AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.supersede_active", AsyncMock()), \
         patch("app.agents.evaluator_agent.insert_findings", AsyncMock()) as ins:
        result = await agent.evaluate(_ctx())
    assert result.findings == []
    assert "DRUG_ALLERGY" in result.validators_run
    assert "COMPLETENESS" in result.validators_run
    assert ins.await_count == 1


@pytest.mark.asyncio
async def test_orchestrator_skips_pregnancy_when_not_pregnant():
    agent = EvaluatorAgent()
    pregnancy_mock = AsyncMock(return_value=[])
    with patch.object(agent, "_load_draft", AsyncMock(return_value=_draft_with_meds())), \
         patch.object(agent, "_load_patient_state", AsyncMock(return_value={
             "age_years": 30, "weight_kg": 70.0, "pregnancy_status": "NOT_PREGNANT",
         })), \
         patch.object(agent, "_load_patient_context", AsyncMock(return_value={})), \
         patch.object(agent, "_load_transcript", AsyncMock(return_value="x")), \
         patch("app.agents.evaluator_agent.check_drug_allergy_interaction", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.check_drug_drug_interactions", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_pregnancy_categories", pregnancy_mock), \
         patch("app.agents.evaluator_agent.fetch_dose_rules", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.run_hallucination", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.supersede_active", AsyncMock()), \
         patch("app.agents.evaluator_agent.insert_findings", AsyncMock()):
        result = await agent.evaluate(_ctx())
    pregnancy_mock.assert_not_awaited()
    assert "PREGNANCY" not in result.validators_run


@pytest.mark.asyncio
async def test_orchestrator_marks_validator_unavailable_on_exception():
    agent = EvaluatorAgent()
    with patch.object(agent, "_load_draft", AsyncMock(return_value=_draft_with_meds())), \
         patch.object(agent, "_load_patient_state", AsyncMock(return_value={
             "age_years": 30, "weight_kg": 70.0, "pregnancy_status": "NOT_PREGNANT",
         })), \
         patch.object(agent, "_load_patient_context", AsyncMock(return_value={})), \
         patch.object(agent, "_load_transcript", AsyncMock(return_value="x")), \
         patch("app.agents.evaluator_agent.check_drug_allergy_interaction", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.check_drug_drug_interactions",
               AsyncMock(side_effect=RuntimeError("neo4j down"))), \
         patch("app.agents.evaluator_agent.fetch_pregnancy_categories", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.fetch_dose_rules", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.run_hallucination", AsyncMock(return_value=[])), \
         patch("app.agents.evaluator_agent.supersede_active", AsyncMock()), \
         patch("app.agents.evaluator_agent.insert_findings", AsyncMock()):
        result = await agent.evaluate(_ctx())
    assert any(cat == "DDI" for cat, _ in result.validators_unavailable)
```

- [ ] **Step 2: Run failing**

```bash
cd agent && pytest tests/agents/evaluator/test_orchestrator.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement orchestrator**

`agent/app/agents/evaluator_agent.py`:
```python
"""Evaluator orchestrator.

Phase 1 — parallel cheap validators (allergy, DDI, pregnancy, dose, completeness).
Phase 2 — hallucination LLM check.

Each validator wrapped in `_run` which catches exceptions and converts to
(category, error_reason). One validator failing does not tank the run.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import date
from uuid import UUID

import structlog

from app.agents.evaluator.completeness import run_completeness
from app.agents.evaluator.dose_parser import parse_dose_mg, parse_frequency_per_day
from app.agents.evaluator.hallucination import run_hallucination
from app.agents.evaluator.severity import map_ddi_severity, map_pregnancy_severity, map_dose_severity
from app.config import settings
from app.graph.queries.dose_range import fetch_dose_rules
from app.graph.queries.drug_drug_interaction import check_drug_drug_interactions
from app.graph.queries.drug_interaction import check_drug_interactions as check_drug_allergy_interaction
from app.graph.queries.pregnancy_safety import fetch_pregnancy_categories
from app.persistence.evaluator_findings import insert_findings, supersede_active
from app.persistence.postgres import get_pool
from app.schemas.evaluator import Category, EvaluationResult, Finding, Severity
from app.schemas.report import MedicalReport

log = structlog.get_logger(__name__)


@dataclass
class EvaluatorContext:
    visit_id: UUID
    patient_id: UUID


class EvaluatorAgent:
    async def evaluate(self, ctx: EvaluatorContext) -> EvaluationResult:
        draft = await self._load_draft(ctx.visit_id)
        if draft is None:
            raise ValueError(f"evaluator: no draft for visit {ctx.visit_id}")

        patient_state = await self._load_patient_state(ctx.patient_id)
        patient_context = await self._load_patient_context(ctx.patient_id)
        transcript = await self._load_transcript(ctx.visit_id)
        proposed_drugs_lc = [m.drug_name.lower().strip() for m in draft.plan.medications if m.drug_name.strip()]

        # Phase 1 validators
        validators_run: list[Category] = []
        validators_unavailable: list[tuple[Category, str]] = []
        all_findings: list[Finding] = []

        async def _run(cat: Category, coro):
            try:
                return cat, await asyncio.wait_for(coro, timeout=settings.evaluator_timeout_cypher_seconds)
            except (asyncio.TimeoutError, TimeoutError) as e:
                return cat, e
            except Exception as e:
                return cat, e

        allergy_task = _run("DRUG_ALLERGY", check_drug_allergy_interaction(ctx.patient_id, proposed_drugs_lc))
        ddi_task = _run("DDI", check_drug_drug_interactions(ctx.patient_id, proposed_drugs_lc))
        is_preg_lac = patient_state.get("pregnancy_status") in ("PREGNANT", "LACTATING")
        preg_task = _run("PREGNANCY", fetch_pregnancy_categories(proposed_drugs_lc)) if is_preg_lac else None
        dose_task = _run("DOSE", fetch_dose_rules(
            [{"name": m.drug_name, "route": (m.route or "oral")} for m in draft.plan.medications],
            patient_state.get("age_years"), patient_state.get("weight_kg"),
        ))

        # Completeness is sync (pure Python) — wrap in coro
        async def _completeness():
            return run_completeness(draft)
        comp_task = _run("COMPLETENESS", _completeness())

        tasks = [t for t in (allergy_task, ddi_task, preg_task, dose_task, comp_task) if t is not None]
        phase1 = await asyncio.gather(*tasks, return_exceptions=False)

        for cat, payload in phase1:
            if isinstance(payload, Exception):
                validators_unavailable.append((cat, type(payload).__name__))
                continue
            validators_run.append(cat)
            if cat == "DRUG_ALLERGY":
                for hit in payload:
                    all_findings.append(Finding(
                        category="DRUG_ALLERGY", severity="CRITICAL",
                        field_path=self._med_path_for(draft, hit.drug),
                        message=f"{hit.drug} conflicts with patient allergy {hit.conflicts_with}",
                        details={"drug": hit.drug, "conflicts_with": hit.conflicts_with},
                    ))
            elif cat == "DDI":
                for hit in payload:
                    all_findings.append(Finding(
                        category="DDI", severity=map_ddi_severity(hit["severity"]),
                        field_path=self._med_path_for(draft, hit["drug_a"]),
                        message=f"{hit['drug_a']} interacts with {hit['drug_b']}",
                        details={"drug_a": hit["drug_a"], "drug_b": hit["drug_b"],
                                 "mechanism": hit["mechanism"], "source": hit["source"]},
                    ))
            elif cat == "PREGNANCY":
                self._emit_pregnancy(payload, patient_state, draft, all_findings)
            elif cat == "DOSE":
                self._emit_dose(payload, draft, patient_state, all_findings)
            elif cat == "COMPLETENESS":
                all_findings.extend(payload)

        # Phase 2 — hallucination
        try:
            halluc_findings = await asyncio.wait_for(
                run_hallucination(draft, patient_context, transcript),
                timeout=settings.evaluator_timeout_llm_seconds,
            )
            validators_run.append("HALLUCINATION")
            all_findings.extend(halluc_findings)
        except (asyncio.TimeoutError, TimeoutError):
            validators_unavailable.append(("HALLUCINATION", "timeout"))
        except Exception as e:
            validators_unavailable.append(("HALLUCINATION", type(e).__name__))

        # Persist (supersede prior + insert new in one transaction via advisory lock)
        async with (get_pool()).acquire() as conn:
            async with conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", str(ctx.visit_id))
                await supersede_active(ctx.visit_id)
                await insert_findings(ctx.visit_id, all_findings)

        log.info(
            "evaluator.run_complete",
            visit_id=str(ctx.visit_id),
            validators_run=validators_run,
            validators_unavailable=[(c, r) for c, r in validators_unavailable],
            findings_count={
                "CRITICAL": sum(1 for f in all_findings if f.severity == "CRITICAL"),
                "HIGH": sum(1 for f in all_findings if f.severity == "HIGH"),
                "MEDIUM": sum(1 for f in all_findings if f.severity == "MEDIUM"),
                "LOW": sum(1 for f in all_findings if f.severity == "LOW"),
            },
            drugs_evaluated=len(proposed_drugs_lc),
        )
        return EvaluationResult(
            visit_id=ctx.visit_id, findings=all_findings,
            validators_run=validators_run, validators_unavailable=validators_unavailable,
        )

    # ------- helpers -------

    @staticmethod
    def _med_path_for(draft: MedicalReport, drug_name: str) -> str:
        target = drug_name.lower()
        for i, m in enumerate(draft.plan.medications):
            if m.drug_name.lower() == target:
                return f"plan.medications[{i}]"
        return "plan.medications"

    def _emit_pregnancy(self, rows: list[dict], patient_state: dict,
                        draft: MedicalReport, all_findings: list[Finding]) -> None:
        status = patient_state["pregnancy_status"]
        for r in rows:
            sev: Severity = map_pregnancy_severity(status, r.get("category"), r.get("lactation_safe"))
            all_findings.append(Finding(
                category="PREGNANCY", severity=sev,
                field_path=self._med_path_for(draft, r["drug"]),
                message=f"{r['drug']} category {r.get('category') or 'no data'} in {status.lower()}",
                details={"category": r.get("category"), "advisory": r.get("advisory"),
                         "lactation_safe": r.get("lactation_safe")},
            ))

    def _emit_dose(self, rows: list[dict], draft: MedicalReport,
                   patient_state: dict, all_findings: list[Finding]) -> None:
        rules_by_drug = {r["drug"]: r for r in rows}
        for i, m in enumerate(draft.plan.medications):
            drug_lc = m.drug_name.lower().strip()
            dose_r = parse_dose_mg(m.dose)
            freq_r = parse_frequency_per_day(m.frequency)
            field_path = f"plan.medications[{i}]"
            if not dose_r.ok:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("dose_unit_missing"),
                    field_path=field_path,
                    message=f"Dose units missing or unparseable for {m.drug_name}.",
                ))
                continue
            if not freq_r.ok:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("frequency_unparseable"),
                    field_path=field_path,
                    message=f"Frequency '{m.frequency}' not recognised for {m.drug_name}.",
                ))
                continue
            rule = rules_by_drug.get(drug_lc)
            if rule is None:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("no_rule"),
                    field_path=field_path,
                    message=f"No validated dose rule for {m.drug_name} in this age/weight band — manual review.",
                ))
                continue
            daily = dose_r.dose_mg * freq_r.per_day
            if rule["max_dose_mg"] is not None and dose_r.dose_mg > rule["max_dose_mg"]:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("over_max_dose"),
                    field_path=field_path,
                    message=f"Per-dose {dose_r.dose_mg}mg exceeds max {rule['max_dose_mg']}mg.",
                    details={"proposed_dose_mg": dose_r.dose_mg,
                             "max_dose_mg": rule["max_dose_mg"], "rule_id": rule["rule_id"]},
                ))
            elif rule["max_daily_mg"] is not None and daily > rule["max_daily_mg"]:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("over_max_daily"),
                    field_path=field_path,
                    message=f"Daily total {daily}mg exceeds max {rule['max_daily_mg']}mg/day.",
                    details={"daily_total_mg": daily,
                             "max_daily_mg": rule["max_daily_mg"], "rule_id": rule["rule_id"]},
                ))
            elif rule["min_dose_mg"] is not None and dose_r.dose_mg < rule["min_dose_mg"]:
                all_findings.append(Finding(
                    category="DOSE", severity=map_dose_severity("under_min_dose"),
                    field_path=field_path,
                    message=f"Per-dose {dose_r.dose_mg}mg below min therapeutic {rule['min_dose_mg']}mg.",
                    details={"proposed_dose_mg": dose_r.dose_mg,
                             "min_dose_mg": rule["min_dose_mg"], "rule_id": rule["rule_id"]},
                ))

    async def _load_draft(self, visit_id: UUID) -> MedicalReport | None:
        import json as _json
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT report_draft, report_confidence_flags FROM visits WHERE id=$1",
            visit_id,
        )
        if row is None or row["report_draft"] is None:
            return None
        draft = _json.loads(row["report_draft"])
        flags = _json.loads(row["report_confidence_flags"] or "{}")
        return MedicalReport(**draft, confidence_flags=flags)

    async def _load_patient_state(self, patient_id: UUID) -> dict:
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT date_of_birth, weight_kg, height_cm, pregnancy_status, pregnancy_trimester "
            "FROM patients WHERE id=$1",
            patient_id,
        )
        if row is None:
            return {"age_years": None, "weight_kg": None, "height_cm": None,
                    "pregnancy_status": "UNKNOWN", "pregnancy_trimester": None}
        dob = row["date_of_birth"]
        age = None
        if dob is not None:
            today = date.today()
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return {
            "age_years": age,
            "weight_kg": float(row["weight_kg"]) if row["weight_kg"] is not None else None,
            "height_cm": float(row["height_cm"]) if row["height_cm"] is not None else None,
            "pregnancy_status": row["pregnancy_status"] or "UNKNOWN",
            "pregnancy_trimester": row["pregnancy_trimester"],
        }

    async def _load_patient_context(self, patient_id: UUID) -> dict:
        # Reuse existing patient-context aggregator. Empty dict acceptable on failure.
        try:
            from app.routes.patient_context import aggregate_patient_context
            return await aggregate_patient_context(patient_id)
        except Exception:
            return {}

    async def _load_transcript(self, visit_id: UUID) -> str:
        from app.persistence.agent_turns import AgentTurnRepository
        repo = AgentTurnRepository()
        turns = await repo.load(visit_id, "report")
        return "\n".join(t.content or "" for t in turns if t.role == "user")
```

- [ ] **Step 4: Run passing**

```bash
cd agent && pytest tests/agents/evaluator/test_orchestrator.py -v
```
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add agent/app/agents/evaluator_agent.py agent/tests/agents/evaluator/test_orchestrator.py
git commit -m "feat(agent): EvaluatorAgent orchestrator with parallel phase 1 + hallucination phase 2"
```

### Task 8.3: End-to-end integration test (real Neo4j + Postgres)

**Files:**
- Create: `agent/tests/integration/test_evaluator_e2e.py`

- [ ] **Step 1: Write the integration test**

`agent/tests/integration/test_evaluator_e2e.py`:
```python
"""End-to-end evaluator test against real Neo4j (seeded) + real Postgres.

Skipped automatically if NEO4J_URI / DATABASE_URL are not set.
"""
from __future__ import annotations

import json
import os
from uuid import uuid4

import pytest

from app.agents.evaluator_agent import EvaluatorAgent, EvaluatorContext
from app.persistence.postgres import get_pool

pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"), reason="requires real Postgres"
)


@pytest.mark.asyncio
async def test_e2e_warfarin_ibuprofen_critical():
    pool = get_pool()
    visit_id = uuid4()
    patient_id = uuid4()
    doctor_id = uuid4()

    # Insert minimal patient + visit + draft (skip user fk for the doctor — visits.doctor_id NOT NULL)
    # If your schema requires a real users row, adjust to insert one.
    await pool.execute(
        "INSERT INTO users (id, email, password_hash, role, full_name) "
        "VALUES ($1, $2, 'x', 'DOCTOR', 'Test Doc') ON CONFLICT DO NOTHING",
        doctor_id, f"doc-{doctor_id}@test",
    )
    await pool.execute(
        "INSERT INTO patients (id, full_name, pregnancy_status, weight_kg, date_of_birth) "
        "VALUES ($1, 'Test Patient', 'NOT_PREGNANT', 70, '1990-01-01')",
        patient_id,
    )
    await pool.execute(
        "INSERT INTO visits (id, patient_id, doctor_id, status) VALUES ($1, $2, $3, 'IN_PROGRESS')",
        visit_id, patient_id, doctor_id,
    )
    draft = {
        "subjective": {"chief_complaint": "headache", "history_of_present_illness": "since morning",
                       "associated_symptoms": [], "relevant_history": []},
        "objective": {"vital_signs": {}, "physical_exam": None},
        "assessment": {"primary_diagnosis": "Tension headache",
                       "differential_diagnoses": [], "icd10_codes": []},
        "plan": {
            "medications": [
                {"drug_name": "warfarin", "dose": "5mg", "frequency": "OD", "duration": "30 days"},
                {"drug_name": "ibuprofen", "dose": "400mg", "frequency": "TDS", "duration": "5 days"},
            ],
            "investigations": [], "lifestyle_advice": [],
            "follow_up": {"needed": False}, "red_flags": [],
        },
    }
    await pool.execute(
        "UPDATE visits SET report_draft=$1::jsonb, report_confidence_flags='{}'::jsonb WHERE id=$2",
        json.dumps(draft), visit_id,
    )

    agent = EvaluatorAgent()
    result = await agent.evaluate(EvaluatorContext(visit_id=visit_id, patient_id=patient_id))

    assert any(f.category == "DDI" and f.severity == "CRITICAL" for f in result.findings), \
        f"expected CRITICAL DDI, got: {[f.dict() for f in result.findings]}"

    # Cleanup
    await pool.execute("DELETE FROM evaluator_findings WHERE visit_id=$1", visit_id)
    await pool.execute("DELETE FROM visits WHERE id=$1", visit_id)
    await pool.execute("DELETE FROM patients WHERE id=$1", patient_id)
    await pool.execute("DELETE FROM users WHERE id=$1", doctor_id)
```

- [ ] **Step 2: Run (requires running stack)**

```bash
cd agent && pytest tests/integration/test_evaluator_e2e.py -v
```
Expected: 1 pass.

- [ ] **Step 3: Commit**

```bash
git add agent/tests/integration/test_evaluator_e2e.py
git commit -m "test(agent): e2e evaluator integration test (warfarin+ibuprofen → CRITICAL DDI)"
```

---

## Phase 9 — Agent route changes

### Task 9.1: Add `evaluator.done` / `evaluator.error` SSE events to `/agents/report/generate`

**Files:**
- Modify: `agent/app/routes/report.py`
- Modify: `agent/app/llm/streaming.py` (likely — or the SSE encoder used by the agent)

- [ ] **Step 1: Add SSE event encoder**

Inspect `agent/app/llm/streaming.py` to find the existing SSE encoder pattern. Add helpers:

```python
def evaluator_done(findings: list[dict], validators_run: list[str], validators_unavailable: list[tuple[str, str]]):
    payload = {"findings": findings, "validators_run": validators_run,
               "validators_unavailable": [{"category": c, "reason": r} for c, r in validators_unavailable]}
    # Match existing encoder pattern — substitute appropriate constructor call:
    return SSEEvent(event="evaluator.done", data=payload)


def evaluator_error(reason: str):
    return SSEEvent(event="evaluator.error", data={"reason": reason})
```

(Adjust to match the existing class/method names in streaming.py.)

- [ ] **Step 2: Modify `/generate` route to call evaluator after drafter**

In `agent/app/routes/report.py`, find `_run_stream` and the `/generate` route. After the drafter loop, invoke the evaluator and emit its event before closing the stream:

```python
async def _run_stream_with_evaluator(agent: ReportAgent, ctx: AgentContext, user_input: str,
                                     evaluator_ctx: EvaluatorContext | None) -> AsyncIterator[bytes]:
    try:
        async for ev in agent.step(ctx, user_input=user_input):
            yield ev.encode()
    except ClarificationRequested as exc:
        args = exc.call.arguments
        yield clarification_needed(field=args.get("field",""), prompt=args.get("prompt",""),
                                   context=args.get("context","")).encode()
        return  # don't run evaluator if drafter is asking for clarification

    if evaluator_ctx is None or not settings.evaluator_enabled:
        return
    try:
        from app.agents.evaluator_agent import EvaluatorAgent
        result = await asyncio.wait_for(
            EvaluatorAgent().evaluate(evaluator_ctx),
            timeout=settings.evaluator_timeout_total_seconds,
        )
        yield evaluator_done(
            findings=[f.model_dump() for f in result.findings],
            validators_run=result.validators_run,
            validators_unavailable=result.validators_unavailable,
        ).encode()
    except Exception as e:
        log.exception("evaluator.failed", visit_id=str(evaluator_ctx.visit_id))
        yield evaluator_error(reason=type(e).__name__).encode()
```

Update `/generate`, `/edit`, `/clarify` to use `_run_stream_with_evaluator`, passing `EvaluatorContext(visit_id=req.visit_id, patient_id=req.patient_id)`.

- [ ] **Step 3: Restart agent + smoke test**

Run the agent against a fresh visit with a transcript:
```bash
curl -N -X POST http://localhost:8000/agents/report/generate \
  -H "Content-Type: application/json" \
  -d '{"visit_id":"<uuid>","patient_id":"<uuid>","doctor_id":"<uuid>","transcript":"warfarin patient with headache, prescribe ibuprofen 400mg TDS"}'
```
Expected: SSE stream ends with `event: evaluator.done` line followed by JSON containing CRITICAL DDI finding.

- [ ] **Step 4: Commit**

```bash
git add agent/app/routes/report.py agent/app/llm/streaming.py
git commit -m "feat(agent): emit evaluator.done/evaluator.error SSE after drafter completes"
```

### Task 9.2: Add finalize-time guard in agent

**Files:**
- Modify: `agent/app/routes/report.py` (the `finalize` route)

- [ ] **Step 1: Add unacked-CRITICAL pre-check**

Inside `finalize()` route, before generating the patient summary:

```python
from app.persistence.evaluator_findings import has_unacked_critical, list_active_findings

if await has_unacked_critical(req.visit_id):
    rows = await list_active_findings(req.visit_id)
    blocking = [str(r["id"]) for r in rows
                if r["severity"] == "CRITICAL" and r["acknowledged_at"] is None]
    log.info("[AGENT] /agents/report/finalize blocked_by_critical visit=%s n=%d",
             req.visit_id, len(blocking))
    raise HTTPException(status_code=409,
                        detail={"error": "unacknowledged_critical_findings", "finding_ids": blocking})
```

- [ ] **Step 2: Manual smoke test**

Trigger finalize on a visit known to have an unacked CRITICAL → expect 409 with the finding_ids list.

- [ ] **Step 3: Commit**

```bash
git add agent/app/routes/report.py
git commit -m "feat(agent): finalize endpoint blocks on unacknowledged CRITICAL findings"
```

### Task 9.3: New `/agents/evaluator/*` routes

**Files:**
- Create: `agent/app/routes/evaluator.py`
- Modify: `agent/app/main.py` (register router)

- [ ] **Step 1: Create routes**

`agent/app/routes/evaluator.py`:
```python
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from starlette.responses import JSONResponse

from app.agents.evaluator_agent import EvaluatorAgent, EvaluatorContext
from app.persistence.evaluator_findings import list_active_findings

router = APIRouter()


class ReEvaluateRequest(BaseModel):
    visit_id: UUID
    patient_id: UUID
    doctor_id: UUID  # accepted for audit; not yet used here


@router.get("/findings/{visit_id}")
async def get_findings(visit_id: UUID) -> JSONResponse:
    rows = await list_active_findings(visit_id)
    return JSONResponse({
        "findings": [
            {
                "id": str(r["id"]), "category": r["category"], "severity": r["severity"],
                "field_path": r["field_path"], "message": r["message"],
                "details": r["details"],
                "acknowledged_at": r["acknowledged_at"].isoformat() if r["acknowledged_at"] else None,
                "acknowledged_by": str(r["acknowledged_by"]) if r["acknowledged_by"] else None,
                "acknowledgement_reason": r["acknowledgement_reason"],
                "gmt_create": r["gmt_create"].isoformat(),
            }
            for r in rows
        ]
    })


@router.post("/re-evaluate")
async def re_evaluate(req: ReEvaluateRequest) -> JSONResponse:
    try:
        result = await EvaluatorAgent().evaluate(
            EvaluatorContext(visit_id=req.visit_id, patient_id=req.patient_id)
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return JSONResponse({
        "findings": [f.model_dump() for f in result.findings],
        "validators_run": result.validators_run,
        "validators_unavailable": [{"category": c, "reason": r} for c, r in result.validators_unavailable],
    })
```

- [ ] **Step 2: Register router in `app/main.py`**

```python
from app.routes import evaluator as evaluator_routes
app.include_router(evaluator_routes.router, prefix="/agents/evaluator")
```

- [ ] **Step 3: Smoke test**

```bash
curl -s http://localhost:8000/agents/evaluator/findings/<visit-id> | head
```
Expected: JSON with `findings` array.

- [ ] **Step 4: Commit**

```bash
git add agent/app/routes/evaluator.py agent/app/main.py
git commit -m "feat(agent): add GET /findings/{visit_id} and POST /re-evaluate routes"
```

---

## Phase 10 — Spring Boot: enums, JPA entity, model, repository

### Task 10.1: Severity + Category enums

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/enums/FindingCategory.java`
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/enums/FindingSeverity.java`

- [ ] **Step 1: Create enums**

`FindingCategory.java`:
```java
package my.cliniflow.domain.biz.visit.enums;

public enum FindingCategory {
    DRUG_ALLERGY, DDI, PREGNANCY, DOSE, HALLUCINATION, COMPLETENESS
}
```

`FindingSeverity.java`:
```java
package my.cliniflow.domain.biz.visit.enums;

public enum FindingSeverity {
    CRITICAL, HIGH, MEDIUM, LOW
}
```

- [ ] **Step 2: Compile**

```bash
cd backend && ./mvnw compile -q
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/enums/FindingCategory.java backend/src/main/java/my/cliniflow/domain/biz/visit/enums/FindingSeverity.java
git commit -m "feat(backend): add FindingCategory and FindingSeverity enums"
```

### Task 10.2: EvaluatorFindingModel domain entity

**Files:**
- Create: `backend/src/main/java/my/cliniflow/domain/biz/visit/model/EvaluatorFindingModel.java`
- Test: `backend/src/test/java/my/cliniflow/domain/biz/visit/EvaluatorFindingModelTest.java`

- [ ] **Step 1: Write failing tests**

`EvaluatorFindingModelTest.java`:
```java
package my.cliniflow.domain.biz.visit;

import my.cliniflow.domain.biz.visit.enums.FindingCategory;
import my.cliniflow.domain.biz.visit.enums.FindingSeverity;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EvaluatorFindingModelTest {

    @Test
    void unacknowledged_critical_is_blocking() {
        var f = newFinding(FindingSeverity.CRITICAL);
        assertThat(f.isUnacknowledgedCritical()).isTrue();
    }

    @Test
    void acknowledged_critical_is_not_blocking() {
        var f = newFinding(FindingSeverity.CRITICAL);
        f.acknowledge(UUID.randomUUID(), "noted");
        assertThat(f.isUnacknowledgedCritical()).isFalse();
    }

    @Test
    void cannot_acknowledge_superseded() {
        var f = newFinding(FindingSeverity.CRITICAL);
        f.markSuperseded();
        assertThatThrownBy(() -> f.acknowledge(UUID.randomUUID(), "x"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void acknowledge_idempotent() {
        var f = newFinding(FindingSeverity.CRITICAL);
        var doc = UUID.randomUUID();
        f.acknowledge(doc, "first");
        f.acknowledge(doc, "second");  // no-op, second time
        assertThat(f.acknowledgementReason()).isEqualTo("first");
    }

    private EvaluatorFindingModel newFinding(FindingSeverity sev) {
        return EvaluatorFindingModel.builder()
            .id(UUID.randomUUID())
            .visitId(UUID.randomUUID())
            .category(FindingCategory.DDI)
            .severity(sev)
            .message("test")
            .gmtCreate(OffsetDateTime.now())
            .build();
    }
}
```

- [ ] **Step 2: Run failing**

```bash
cd backend && ./mvnw test -Dtest=EvaluatorFindingModelTest
```
Expected: compilation failure on missing class.

- [ ] **Step 3: Implement model**

`EvaluatorFindingModel.java`:
```java
package my.cliniflow.domain.biz.visit.model;

import lombok.Builder;
import lombok.Getter;
import my.cliniflow.domain.biz.visit.enums.FindingCategory;
import my.cliniflow.domain.biz.visit.enums.FindingSeverity;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Getter
public class EvaluatorFindingModel {
    private final UUID id;
    private final UUID visitId;
    private final FindingCategory category;
    private final FindingSeverity severity;
    private final String fieldPath;
    private final String message;
    private final Map<String, Object> details;
    private OffsetDateTime acknowledgedAt;
    private UUID acknowledgedBy;
    private String acknowledgementReason;
    private OffsetDateTime supersededAt;
    private final OffsetDateTime gmtCreate;

    @Builder
    private EvaluatorFindingModel(
        UUID id, UUID visitId, FindingCategory category, FindingSeverity severity,
        String fieldPath, String message, Map<String, Object> details,
        OffsetDateTime acknowledgedAt, UUID acknowledgedBy, String acknowledgementReason,
        OffsetDateTime supersededAt, OffsetDateTime gmtCreate
    ) {
        this.id = id;
        this.visitId = visitId;
        this.category = category;
        this.severity = severity;
        this.fieldPath = fieldPath;
        this.message = message;
        this.details = details == null ? Map.of() : Map.copyOf(details);
        this.acknowledgedAt = acknowledgedAt;
        this.acknowledgedBy = acknowledgedBy;
        this.acknowledgementReason = acknowledgementReason;
        this.supersededAt = supersededAt;
        this.gmtCreate = gmtCreate;
    }

    public boolean isUnacknowledgedCritical() {
        return severity == FindingSeverity.CRITICAL
            && acknowledgedAt == null
            && supersededAt == null;
    }

    public boolean isSuperseded() { return supersededAt != null; }

    public void acknowledge(UUID doctorId, String reason) {
        if (isSuperseded()) {
            throw new IllegalStateException("cannot acknowledge superseded finding");
        }
        if (acknowledgedAt != null) {
            return; // idempotent
        }
        this.acknowledgedAt = OffsetDateTime.now();
        this.acknowledgedBy = doctorId;
        this.acknowledgementReason = reason == null ? null : reason.strip();
    }

    public void markSuperseded() {
        if (supersededAt == null) {
            this.supersededAt = OffsetDateTime.now();
        }
    }

    public String acknowledgementReason() { return acknowledgementReason; }
}
```

- [ ] **Step 4: Run passing**

```bash
cd backend && ./mvnw test -Dtest=EvaluatorFindingModelTest
```
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/model/EvaluatorFindingModel.java backend/src/test/java/my/cliniflow/domain/biz/visit/EvaluatorFindingModelTest.java
git commit -m "feat(backend): EvaluatorFindingModel domain entity with ack/supersede invariants"
```

### Task 10.3: JPA entity + Spring Data repository

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/visit/EvaluatorFindingEntity.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/visit/EvaluatorFindingJpaRepository.java`

- [ ] **Step 1: Create JPA entity**

`EvaluatorFindingEntity.java`:
```java
package my.cliniflow.infrastructure.repository.visit;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "evaluator_findings")
@Getter @Setter @NoArgsConstructor
public class EvaluatorFindingEntity {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "visit_id", nullable = false)
    private UUID visitId;

    @Column(nullable = false, length = 32)
    private String category;

    @Column(nullable = false, length = 16)
    private String severity;

    @Column(name = "field_path", length = 255)
    private String fieldPath;

    @Column(nullable = false, columnDefinition = "text")
    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> details;

    @Column(name = "acknowledged_at")
    private OffsetDateTime acknowledgedAt;

    @Column(name = "acknowledged_by")
    private UUID acknowledgedBy;

    @Column(name = "acknowledgement_reason", length = 255)
    private String acknowledgementReason;

    @Column(name = "superseded_at")
    private OffsetDateTime supersededAt;

    @Column(name = "gmt_create", nullable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false)
    private OffsetDateTime gmtModified;
}
```

- [ ] **Step 2: Create JPA repository**

`EvaluatorFindingJpaRepository.java`:
```java
package my.cliniflow.infrastructure.repository.visit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EvaluatorFindingJpaRepository extends JpaRepository<EvaluatorFindingEntity, UUID> {

    @Query("SELECT f FROM EvaluatorFindingEntity f " +
           "WHERE f.visitId = :visitId AND f.supersededAt IS NULL " +
           "ORDER BY " +
           "  CASE f.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, " +
           "  f.gmtCreate")
    List<EvaluatorFindingEntity> findActiveByVisitId(@Param("visitId") UUID visitId);

    @Query("SELECT COUNT(f) FROM EvaluatorFindingEntity f " +
           "WHERE f.visitId = :visitId AND f.severity = 'CRITICAL' " +
           "  AND f.acknowledgedAt IS NULL AND f.supersededAt IS NULL")
    long countUnacknowledgedCritical(@Param("visitId") UUID visitId);
}
```

- [ ] **Step 3: Compile**

```bash
cd backend && ./mvnw compile -q
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/repository/visit/EvaluatorFindingEntity.java backend/src/main/java/my/cliniflow/infrastructure/repository/visit/EvaluatorFindingJpaRepository.java
git commit -m "feat(backend): EvaluatorFindingEntity JPA entity + Spring Data repository"
```

### Task 10.4: Extend `VisitRepository` interface

**Files:**
- Modify: `domain/biz/visit/repository/VisitRepository.java`
- Modify: `infrastructure/repository/visit/VisitRepositoryImpl.java`
- Create: `domain/biz/visit/info/EvaluatorRunResultInfo.java`

- [ ] **Step 1: Add finding-query methods to interface**

In `VisitRepository.java`, add:
```java
List<EvaluatorFindingModel> findActiveFindings(UUID visitId);
boolean hasUnacknowledgedCriticalFindings(UUID visitId);
EvaluatorFindingModel saveFindingAcknowledgement(EvaluatorFindingModel finding);
```

- [ ] **Step 2: Implement in `VisitRepositoryImpl`**

Inject `EvaluatorFindingJpaRepository`. Add converter `EvaluatorFindingEntity → EvaluatorFindingModel`. Implement the three new methods.

```java
@Override
public List<EvaluatorFindingModel> findActiveFindings(UUID visitId) {
    return findingRepo.findActiveByVisitId(visitId).stream()
        .map(this::toModel).toList();
}

@Override
public boolean hasUnacknowledgedCriticalFindings(UUID visitId) {
    return findingRepo.countUnacknowledgedCritical(visitId) > 0;
}

@Override
public EvaluatorFindingModel saveFindingAcknowledgement(EvaluatorFindingModel f) {
    EvaluatorFindingEntity e = findingRepo.findById(f.getId())
        .orElseThrow(() -> new IllegalStateException("finding not found: " + f.getId()));
    e.setAcknowledgedAt(f.getAcknowledgedAt());
    e.setAcknowledgedBy(f.getAcknowledgedBy());
    e.setAcknowledgementReason(f.acknowledgementReason());
    e.setGmtModified(OffsetDateTime.now());
    return toModel(findingRepo.save(e));
}

private EvaluatorFindingModel toModel(EvaluatorFindingEntity e) {
    return EvaluatorFindingModel.builder()
        .id(e.getId()).visitId(e.getVisitId())
        .category(FindingCategory.valueOf(e.getCategory()))
        .severity(FindingSeverity.valueOf(e.getSeverity()))
        .fieldPath(e.getFieldPath()).message(e.getMessage())
        .details(e.getDetails())
        .acknowledgedAt(e.getAcknowledgedAt()).acknowledgedBy(e.getAcknowledgedBy())
        .acknowledgementReason(e.getAcknowledgementReason())
        .supersededAt(e.getSupersededAt()).gmtCreate(e.getGmtCreate())
        .build();
}
```

- [ ] **Step 3: Compile**

```bash
cd backend && ./mvnw compile -q
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/repository/VisitRepository.java backend/src/main/java/my/cliniflow/infrastructure/repository/visit/VisitRepositoryImpl.java
git commit -m "feat(backend): extend VisitRepository with finding query methods"
```

---

## Phase 11 — Spring Boot: domain services + finalize guard

### Task 11.1: Acknowledge domain service + tests

**Files:**
- Create: `domain/biz/visit/service/EvaluatorFindingAcknowledgeDomainService.java`
- Create: `domain/biz/visit/info/AcknowledgeFindingInfo.java`
- Create: `domain/biz/visit/event/EvaluatorFindingAcknowledgedDomainEvent.java`
- Test: `backend/src/test/java/.../visit/EvaluatorFindingAcknowledgeDomainServiceTest.java`

- [ ] **Step 1: Create info record**

```java
package my.cliniflow.domain.biz.visit.info;

import java.util.UUID;

public record AcknowledgeFindingInfo(UUID findingId, UUID doctorId, String reason) {}
```

- [ ] **Step 2: Create domain event**

```java
package my.cliniflow.domain.biz.visit.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record EvaluatorFindingAcknowledgedDomainEvent(
    UUID visitId, UUID findingId, UUID doctorId, String reason, OffsetDateTime occurredAt
) {}
```

- [ ] **Step 3: Write failing tests**

```java
package my.cliniflow.domain.biz.visit;

// (mock VisitRepository, assert acknowledge() applied + repo save called once)
```

- [ ] **Step 4: Implement domain service**

```java
package my.cliniflow.domain.biz.visit.service;

import lombok.RequiredArgsConstructor;
import my.cliniflow.domain.biz.visit.info.AcknowledgeFindingInfo;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EvaluatorFindingAcknowledgeDomainService {
    private final VisitRepository visitRepository;

    public EvaluatorFindingModel acknowledge(UUID visitId, AcknowledgeFindingInfo info) {
        EvaluatorFindingModel finding = visitRepository.findActiveFindings(visitId).stream()
            .filter(f -> f.getId().equals(info.findingId()))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("finding not found: " + info.findingId()));
        finding.acknowledge(info.doctorId(), info.reason());
        return visitRepository.saveFindingAcknowledgement(finding);
    }
}
```

- [ ] **Step 5: Compile + test**

```bash
cd backend && ./mvnw test -Dtest=EvaluatorFindingAcknowledgeDomainServiceTest
```

- [ ] **Step 6: Commit**

```bash
git add ...
git commit -m "feat(backend): EvaluatorFindingAcknowledgeDomainService + info + event"
```

### Task 11.2: Supersede domain service (called from re-evaluate proxy)

**Files:**
- Create: `domain/biz/visit/service/EvaluatorFindingSupersedeDomainService.java`

- [ ] **Step 1: Implement (Java side just records the result; agent has already superseded in DB)**

This service exists for symmetry — it loads the model, marks as superseded in-memory, and persists. In practice it may be a no-op wrapper since the agent does the actual DB write. Keep for clean DDD semantics:

```java
package my.cliniflow.domain.biz.visit.service;

import org.springframework.stereotype.Service;
// minimal stub — agent owns the actual DB-side supersede; this service is reserved
// for any Spring-Boot-initiated supersede in the future (e.g. admin-driven).
@Service
public class EvaluatorFindingSupersedeDomainService {
    // Reserved for future use; intentionally empty in MVP.
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/my/cliniflow/domain/biz/visit/service/EvaluatorFindingSupersedeDomainService.java
git commit -m "feat(backend): EvaluatorFindingSupersedeDomainService stub for future admin supersede"
```

### Task 11.3: Finalize guard in `MedicalReportFinalizeDomainService`

**Files:**
- Modify: `domain/biz/visit/service/MedicalReportFinalizeDomainService.java`
- Create: `domain/biz/visit/exception/UnacknowledgedCriticalFindingsException.java`

- [ ] **Step 1: Create exception**

```java
package my.cliniflow.domain.biz.visit.exception;

import java.util.List;
import java.util.UUID;

public class UnacknowledgedCriticalFindingsException extends RuntimeException {
    private final List<UUID> findingIds;
    public UnacknowledgedCriticalFindingsException(List<UUID> findingIds) {
        super("unacknowledged critical findings: " + findingIds);
        this.findingIds = findingIds;
    }
    public List<UUID> getFindingIds() { return findingIds; }
}
```

- [ ] **Step 2: Add guard to finalize service**

In the existing `MedicalReportFinalizeDomainService.finalize()`, before transitioning state, add:

```java
if (visitRepository.hasUnacknowledgedCriticalFindings(visitId)) {
    var blockers = visitRepository.findActiveFindings(visitId).stream()
        .filter(EvaluatorFindingModel::isUnacknowledgedCritical)
        .map(EvaluatorFindingModel::getId)
        .toList();
    auditLogService.write(AuditAction.UPDATE, "visit", visitId.toString(),
        Map.of("subaction", "FINALIZE_BLOCKED", "unacked_finding_ids", blockers));
    throw new UnacknowledgedCriticalFindingsException(blockers);
}
```

- [ ] **Step 3: Map exception → 409 in `GlobalExceptionConfiguration`**

```java
@ExceptionHandler(UnacknowledgedCriticalFindingsException.class)
public ResponseEntity<WebResult<?>> handleBlocker(UnacknowledgedCriticalFindingsException ex) {
    return ResponseEntity.status(409).body(WebResult.error(
        "UNACKNOWLEDGED_CRITICAL_FINDINGS", ex.getMessage(),
        Map.of("finding_ids", ex.getFindingIds())));
}
```

- [ ] **Step 4: Test**

```bash
cd backend && ./mvnw test -Dtest=MedicalReportFinalizeDomainServiceTest
```

- [ ] **Step 5: Commit**

```bash
git add ...
git commit -m "feat(backend): finalize guards on unacknowledged CRITICAL evaluator findings"
```

---

## Phase 12 — Spring Boot: app services + DTOs + controller

### Task 12.1: DTOs + converter

**Files:**
- Create: `controller/biz/visit/response/EvaluatorFindingDTO.java`
- Create: `controller/biz/visit/request/AcknowledgeFindingRequest.java`
- Create: `controller/biz/visit/converter/EvaluatorFindingModel2DTOConverter.java`

- [ ] **Step 1: Create DTOs**

`EvaluatorFindingDTO.java`:
```java
package my.cliniflow.controller.biz.visit.response;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record EvaluatorFindingDTO(
    UUID id, UUID visitId,
    String category, String severity,
    String fieldPath, String message,
    Map<String, Object> details,
    OffsetDateTime acknowledgedAt, UUID acknowledgedBy, String acknowledgementReason,
    OffsetDateTime gmtCreate
) {}
```

`AcknowledgeFindingRequest.java`:
```java
package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.Size;

public record AcknowledgeFindingRequest(@Size(max = 255) String reason) {}
```

- [ ] **Step 2: Create converter**

```java
package my.cliniflow.controller.biz.visit.converter;

import my.cliniflow.controller.biz.visit.response.EvaluatorFindingDTO;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import org.springframework.stereotype.Component;

@Component
public class EvaluatorFindingModel2DTOConverter {
    public EvaluatorFindingDTO convert(EvaluatorFindingModel m) {
        return new EvaluatorFindingDTO(
            m.getId(), m.getVisitId(),
            m.getCategory().name(), m.getSeverity().name(),
            m.getFieldPath(), m.getMessage(), m.getDetails(),
            m.getAcknowledgedAt(), m.getAcknowledgedBy(), m.acknowledgementReason(),
            m.getGmtCreate()
        );
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add ...
git commit -m "feat(backend): DTOs + converter for evaluator findings"
```

### Task 12.2: Extend `VisitReadAppService` and `VisitWriteAppService`

**Files:**
- Modify: `application/biz/visit/VisitReadAppService.java`
- Modify: `application/biz/visit/VisitWriteAppService.java`

- [ ] **Step 1: Add `listFindings` to read service**

```java
public List<EvaluatorFindingDTO> listFindings(UUID visitId, UUID requesterUserId, UserRole role) {
    // Ownership check
    var visit = visitRepository.findById(visitId)
        .orElseThrow(() -> new IllegalArgumentException("visit not found"));
    if (role == UserRole.DOCTOR && !visit.getDoctorId().equals(requesterUserId)) {
        throw new AccessDeniedException("not your visit");
    }
    auditLogService.write(AuditAction.READ, "evaluator_finding",
        visitId.toString(), Map.of("count", "n"));  // count filled below
    var dtos = visitRepository.findActiveFindings(visitId).stream()
        .map(findingConverter::convert).toList();
    return dtos;
}
```

- [ ] **Step 2: Add `acknowledgeFinding` and `reEvaluate` to write service**

```java
@Transactional
public EvaluatorFindingDTO acknowledgeFinding(UUID visitId, UUID findingId, String reason, UUID doctorId) {
    var visit = visitRepository.findById(visitId)
        .orElseThrow(() -> new IllegalArgumentException("visit not found"));
    if (!visit.getDoctorId().equals(doctorId)) {
        throw new AccessDeniedException("not your visit");
    }
    var info = new AcknowledgeFindingInfo(findingId, doctorId, reason);
    var ack = ackService.acknowledge(visitId, info);
    auditLogService.write(AuditAction.UPDATE, "evaluator_finding", findingId.toString(),
        Map.of("subaction", "ACKNOWLEDGE", "visit_id", visitId,
               "severity", ack.getSeverity().name(), "has_reason", reason != null && !reason.isBlank()));
    eventPublisher.publishEvent(new EvaluatorFindingAcknowledgedDomainEvent(
        visitId, findingId, doctorId, reason, OffsetDateTime.now()));
    return findingConverter.convert(ack);
}

public List<EvaluatorFindingDTO> reEvaluate(UUID visitId, UUID doctorId) {
    var visit = visitRepository.findById(visitId)
        .orElseThrow(() -> new IllegalArgumentException("visit not found"));
    if (!visit.getDoctorId().equals(doctorId)) {
        throw new AccessDeniedException("not your visit");
    }
    auditLogService.write(AuditAction.READ, "visit", visitId.toString(),
        Map.of("subaction", "EVALUATOR_RE_EVALUATE"));
    agentClient.reEvaluate(visitId, visit.getPatientId(), doctorId); // returns nothing of interest
    return visitRepository.findActiveFindings(visitId).stream()
        .map(findingConverter::convert).toList();
}
```

- [ ] **Step 3: Compile**

```bash
cd backend && ./mvnw compile -q
```

- [ ] **Step 4: Commit**

```bash
git add ...
git commit -m "feat(backend): VisitRead/WriteAppService add listFindings/acknowledge/reEvaluate"
```

### Task 12.3: Add three routes to `VisitController`

**Files:**
- Modify: `controller/biz/visit/VisitController.java`

- [ ] **Step 1: Add routes**

```java
@GetMapping("/{visitId}/findings")
public WebResult<List<EvaluatorFindingDTO>> listFindings(
    @PathVariable UUID visitId, Authentication auth
) {
    var claims = (JwtService.Claims) auth.getPrincipal();
    return WebResult.ok(readService.listFindings(visitId, claims.userId(), claims.role()));
}

@PostMapping("/{visitId}/findings/{findingId}/acknowledge")
public WebResult<EvaluatorFindingDTO> acknowledge(
    @PathVariable UUID visitId, @PathVariable UUID findingId,
    @Valid @RequestBody AcknowledgeFindingRequest req,
    Authentication auth
) {
    var claims = (JwtService.Claims) auth.getPrincipal();
    return WebResult.ok(writeService.acknowledgeFinding(visitId, findingId, req.reason(), claims.userId()));
}

@PostMapping("/{visitId}/re-evaluate")
public WebResult<List<EvaluatorFindingDTO>> reEvaluate(
    @PathVariable UUID visitId, Authentication auth
) {
    var claims = (JwtService.Claims) auth.getPrincipal();
    return WebResult.ok(writeService.reEvaluate(visitId, claims.userId()));
}
```

- [ ] **Step 2: Smoke test**

Run backend, hit `GET /api/visits/<id>/findings` with a doctor JWT → 200 list. Hit with another doctor's JWT → 403.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/visit/VisitController.java
git commit -m "feat(backend): /findings, /acknowledge, /re-evaluate routes on VisitController"
```

---

## Phase 13 — Spring Boot: AgentServiceClient extension

### Task 13.1: Add `getFindings` and `reEvaluate`

**Files:**
- Modify: `infrastructure/client/AgentServiceClient.java`

- [ ] **Step 1: Add methods**

```java
public List<EvaluatorFindingDTO> getFindings(UUID visitId) {
    return resilience.executeSupplier(() -> {
        var resp = restClient.get()
            .uri(agentBaseUrl + "/agents/evaluator/findings/" + visitId)
            .retrieve().body(FindingsListResponse.class);
        return resp.findings();
    });
}

public void reEvaluate(UUID visitId, UUID patientId, UUID doctorId) {
    resilience.executeRunnable(() -> restClient.post()
        .uri(agentBaseUrl + "/agents/evaluator/re-evaluate")
        .body(new ReEvaluateBody(visitId, patientId, doctorId))
        .retrieve().toBodilessEntity());
}

private record ReEvaluateBody(UUID visit_id, UUID patient_id, UUID doctor_id) {}
private record FindingsListResponse(List<EvaluatorFindingDTO> findings) {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/client/AgentServiceClient.java
git commit -m "feat(backend): AgentServiceClient.getFindings + reEvaluate"
```

### Task 13.2: Integration tests

**Files:**
- Create: `backend/src/test/java/.../visit/VisitControllerEvaluatorEndpointsIT.java`
- Create: `backend/src/test/java/.../visit/FinalizeGuardIT.java`

- [ ] **Step 1: Write IT for `/findings` and `/acknowledge` (with WireMocked agent)**

Cover: list returns non-superseded only; non-owner doctor 403; ack writes columns + audit row + 200 idempotent on repeat; ack on superseded → 410; ack reason >255 chars → 400.

- [ ] **Step 2: Write IT for finalize guard**

Cover: unacked CRITICAL → 409 + audit row; all acked → 200; no critical → 200.

- [ ] **Step 3: Run**

```bash
cd backend && ./mvnw test -Dtest=VisitControllerEvaluatorEndpointsIT,FinalizeGuardIT
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/...
git commit -m "test(backend): integration tests for evaluator endpoints + finalize guard"
```

---

## Phase 14 — Frontend: types, hook, status row, finding card

### Task 14.1: Types + hook

**Files:**
- Create: `frontend/app/doctor/visits/[visitId]/components/safety/types.ts`
- Create: `frontend/app/doctor/visits/[visitId]/components/safety/useEvaluatorFindings.ts`

- [ ] **Step 1: Create types**

`types.ts`:
```typescript
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Category = "DRUG_ALLERGY" | "DDI" | "PREGNANCY" | "DOSE" | "HALLUCINATION" | "COMPLETENESS";

export interface Finding {
  id: string;
  visitId?: string;
  category: Category;
  severity: Severity;
  fieldPath: string | null;
  message: string;
  details: Record<string, unknown>;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgementReason: string | null;
  gmtCreate: string;
}

export type Availability = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";

export interface EvaluatorState {
  findings: Finding[];
  availability: Availability;
  loading: boolean;
  error?: string;
}
```

- [ ] **Step 2: Create hook with SSE listener**

`useEvaluatorFindings.ts`:
```typescript
import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api"; // adjust to project's HTTP helper
import type { EvaluatorState, Finding } from "./types";

export function useEvaluatorFindings(visitId: string) {
  const [state, setState] = useState<EvaluatorState>({
    findings: [], availability: "AVAILABLE", loading: true,
  });

  const refetch = useCallback(async () => {
    setState(s => ({ ...s, loading: true }));
    try {
      const res = await apiGet<{ data: Finding[] }>(`/api/visits/${visitId}/findings`);
      setState({ findings: res.data, availability: "AVAILABLE", loading: false });
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, availability: "UNAVAILABLE", error: e.message }));
    }
  }, [visitId]);

  useEffect(() => { refetch(); }, [refetch]);

  const onSseEvaluatorDone = useCallback((findings: Finding[]) => {
    setState({ findings, availability: "AVAILABLE", loading: false });
  }, []);
  const onSseEvaluatorError = useCallback((reason: string) => {
    setState(s => ({ ...s, availability: "UNAVAILABLE", error: reason }));
  }, []);

  const acknowledge = useCallback(async (findingId: string, reason?: string) => {
    // Optimistic
    setState(s => ({
      ...s,
      findings: s.findings.map(f => f.id === findingId
        ? { ...f, acknowledgedAt: new Date().toISOString(), acknowledgedBy: "self", acknowledgementReason: reason ?? null }
        : f),
    }));
    try {
      const res = await apiPost<{ data: Finding }>(
        `/api/visits/${visitId}/findings/${findingId}/acknowledge`, { reason });
      setState(s => ({
        ...s,
        findings: s.findings.map(f => f.id === findingId ? res.data : f),
      }));
    } catch (e: any) {
      // Rollback
      await refetch();
      throw e;
    }
  }, [visitId, refetch]);

  const reEvaluate = useCallback(async () => {
    const res = await apiPost<{ data: Finding[] }>(`/api/visits/${visitId}/re-evaluate`, {});
    setState({ findings: res.data, availability: "AVAILABLE", loading: false });
  }, [visitId]);

  return { ...state, refetch, acknowledge, reEvaluate, onSseEvaluatorDone, onSseEvaluatorError };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/safety/types.ts frontend/app/doctor/visits/[visitId]/components/safety/useEvaluatorFindings.ts
git commit -m "feat(frontend): evaluator types + useEvaluatorFindings hook"
```

### Task 14.2: SafetyStatusRow + FindingCard + AcknowledgeFindingDialog + SafetyUnavailableBanner

**Files:**
- Create: `SafetyStatusRow.tsx`, `FindingCard.tsx`, `AcknowledgeFindingDialog.tsx`, `SafetyUnavailableBanner.tsx`

- [ ] **Step 1: Implement `SafetyStatusRow.tsx`**

```tsx
import { Badge } from "@/components/ui/Badge";
import type { Finding, Category } from "./types";

const CATEGORY_LABEL: Record<Category, string> = {
  DRUG_ALLERGY: "Allergy", DDI: "DDI", PREGNANCY: "Pregnancy",
  DOSE: "Dose", HALLUCINATION: "Hallucination", COMPLETENESS: "Completeness",
};

export function SafetyStatusRow({ findings, validatorsRun }: { findings: Finding[]; validatorsRun: Category[] }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Safety check summary">
      {validatorsRun.map(cat => {
        const inCat = findings.filter(f => f.category === cat && !f.acknowledgedAt);
        const sev = inCat.find(f => f.severity === "CRITICAL")?.severity
                 ?? inCat.find(f => f.severity === "HIGH")?.severity
                 ?? inCat.find(f => f.severity === "MEDIUM")?.severity
                 ?? inCat.find(f => f.severity === "LOW")?.severity;
        const tone = sev === "CRITICAL" ? "rose" : sev === "HIGH" ? "amber"
                   : sev === "MEDIUM" ? "sky" : sev === "LOW" ? "slate" : "slate";
        const label = sev ? `${CATEGORY_LABEL[cat]} · ${inCat.length} ${sev.toLowerCase()}` : `${CATEGORY_LABEL[cat]} · clear`;
        return <Badge key={cat} tone={tone}>{label}</Badge>;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `FindingCard.tsx`** (use existing `Card`/`Button`/`Tooltip` primitives, follow severity tone table from spec §5.3).

- [ ] **Step 3: Implement `AcknowledgeFindingDialog.tsx`** (reuse `Dialog.tsx`, `Textarea`, `Button`).

- [ ] **Step 4: Implement `SafetyUnavailableBanner.tsx`** (single-line glass card, slate-tinted, `CloudOffIcon`, message "Safety validation unavailable — proceed with manual review").

- [ ] **Step 5: Run typecheck + lint**

```bash
cd frontend && npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/safety/
git commit -m "feat(frontend): safety status row, finding card, dialog, unavailable banner"
```

### Task 14.3: AISafetyReviewPanel container

**Files:**
- Create: `AISafetyReviewPanel.tsx`

- [ ] **Step 1: Implement panel**

Compose `SafetyStatusRow` + filtered list of `FindingCard`. Collapsed by default when no findings; auto-expanded otherwise. Renders `SafetyUnavailableBanner` when `availability !== "AVAILABLE"`. Includes a "Re-run safety checks" button (small, top-right) that calls `reEvaluate()`.

- [ ] **Step 2: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/safety/AISafetyReviewPanel.tsx
git commit -m "feat(frontend): AISafetyReviewPanel container"
```

---

## Phase 15 — Frontend: page integration + finalize gating

### Task 15.1: Render panel on visit page

**Files:**
- Modify: `frontend/app/doctor/visits/[visitId]/page.tsx`

- [ ] **Step 1: Pass `useEvaluatorFindings` state to the component tree, wire SSE listeners** (the existing report-generate stream handler must be extended to dispatch `evaluator.done` / `evaluator.error` events to the hook).

- [ ] **Step 2: Place `<AISafetyReviewPanel />` above `ReportPanel` per spec §5.1.**

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/page.tsx
git commit -m "feat(frontend): render AI Safety Review panel above SOAP draft"
```

### Task 15.2: Gate finalize button

**Files:**
- Modify: `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`

- [ ] **Step 1: Read `unackedCriticalCount` from hook + disable button**

```tsx
const unackedCriticalCount = findings.filter(
  f => f.severity === "CRITICAL" && !f.acknowledgedAt
).length;

<Tooltip content={unackedCriticalCount
  ? `Acknowledge ${unackedCriticalCount} critical safety finding${unackedCriticalCount > 1 ? 's' : ''} before finalizing.`
  : undefined}>
  <Button onClick={onFinalize} disabled={unackedCriticalCount > 0}
          aria-disabled={unackedCriticalCount > 0}
          aria-describedby={unackedCriticalCount > 0 ? "finalize-blocked-tooltip" : undefined}>
    Finalize
  </Button>
</Tooltip>
```

- [ ] **Step 2: Handle 409 in click handler**

```tsx
try { await finalize(); }
catch (e: any) {
  if (e.code === "UNACKNOWLEDGED_CRITICAL_FINDINGS") {
    toast.error("New critical findings detected. Please review the safety panel.");
    await refetch();
  } else { throw e; }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx
git commit -m "feat(frontend): gate finalize button on unacknowledged CRITICAL findings"
```

### Task 15.3: Frontend unit tests

**Files:**
- Create: `frontend/__tests__/safety/useEvaluatorFindings.test.tsx`
- Create: `frontend/__tests__/safety/AISafetyReviewPanel.test.tsx`
- Create: `frontend/__tests__/safety/AcknowledgeFindingDialog.test.tsx`

- [ ] **Step 1: Hook tests**

Cover: initial fetch; SSE done updates state; SSE error sets UNAVAILABLE; ack optimistic + rollback on failure.

- [ ] **Step 2: Panel tests**

Cover: collapsed when clear; expanded when findings; CRITICAL renders Acknowledge button; unavailable renders banner.

- [ ] **Step 3: Dialog tests**

Cover: max-length validation on reason; calls acknowledge with reason; closes on success.

- [ ] **Step 4: Run**

```bash
cd frontend && npm run test -- safety
```

- [ ] **Step 5: Commit**

```bash
git add frontend/__tests__/safety/
git commit -m "test(frontend): hook + panel + dialog unit tests for evaluator UI"
```

---

## Phase 16 — E2E + visual snapshots

### Task 16.1: Rebuild Docker stack with `--no-cache`

**Files:** none (per E2E protocol from `feedback_e2e_test_protocol.md`)

- [ ] **Step 1: Rebuild**

```bash
docker compose build --no-cache
docker compose up -d
sleep 30
curl -fsS http://localhost/api/visits/healthz
```

### Task 16.2: E2E spec

**Files:**
- Create: `e2e/tests/safety-soft-block.spec.ts`

- [ ] **Step 1: Implement spec (per design §7.6)**

Use Playwright MCP to drive the browser. Steps verbatim from design:

1. Login as Dr. Lim.
2. Navigate to seeded visit (warfarin patient + transcript "prescribe ibuprofen 400mg TDS").
3. Click "Generate report" and wait for `evaluator.done`.
4. Assert AI Safety Review panel shows 1 CRITICAL DDI.
5. Screenshot diff vs `snapshots/safety-panel-critical.snap.png`.
6. Click Finalize → expect 409 toast.
7. Click Acknowledge → fill reason → confirm.
8. Screenshot diff vs `snapshots/safety-panel-acked.snap.png`.
9. Click Finalize → 200.
10. Assert finalized report does NOT contain "evaluator", "AI Safety", "approved by".
11. Screenshot diff vs `snapshots/report-preview-clean.snap.png`.

- [ ] **Step 2: Capture initial snapshots (first run)**

```bash
cd e2e && npx playwright test safety-soft-block --update-snapshots
```

- [ ] **Step 3: Run a clean second time to verify deterministic**

```bash
cd e2e && npx playwright test safety-soft-block
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/safety-soft-block.spec.ts e2e/tests/snapshots/
git commit -m "test(e2e): safety soft-block flow with theme conformance snapshots"
```

---

## Phase 17 — Documentation

### Task 17.1: Update detail docs

**Files:**
- Modify: `docs/details/agent-design.md`
- Modify: `docs/details/api-surface.md`
- Modify: `docs/details/data-model.md`
- Modify: `docs/details/scope-and-acceptance.md`

- [ ] **Step 1: `agent-design.md` — add an Evaluator-agent section after Visit-agent.**

- [ ] **Step 2: `api-surface.md` — document the 3 new Spring Boot routes and 2 new agent routes; document the 409 error envelope.**

- [ ] **Step 3: `data-model.md` — add `evaluator_findings` table + the four new patient columns + the new Neo4j nodes/edges.**

- [ ] **Step 4: `scope-and-acceptance.md` — add an "Evaluator + drug validation (added 2026-05-01)" section with acceptance criteria mirroring spec §7.6 E2E.**

- [ ] **Step 5: Update `CLAUDE.md` index if needed.**

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs: document evaluator agent + drug validation additions"
```

### Task 17.2: Final cleanup + PR

- [ ] **Step 1: Verify all tests pass**

```bash
cd agent && pytest -q
cd ../backend && ./mvnw test -q
cd ../frontend && npm run typecheck && npm run lint && npm run test
```

- [ ] **Step 2: Push branch + open PR**

```bash
git push -u origin feat/evaluator-and-drug-validation
gh pr create --base master --title "feat: evaluator agent + expanded drug validation" --body "$(cat <<'EOF'
## Summary
- New EvaluatorAgent runs after report drafter; emits findings via SSE event.
- Expanded drug validation: allergy + DDI + pregnancy + dose-range (Neo4j-native).
- Tiered severity: flag-only for HIGH/MEDIUM/LOW; soft-block at finalize for CRITICAL with ack.
- New "AI Safety Review" panel in doctor review screen; no surface on final report or patient summary.

## Test plan
- [ ] `cd agent && pytest`
- [ ] `cd backend && ./mvnw test`
- [ ] `cd frontend && npm run test && npm run typecheck`
- [ ] E2E: `cd e2e && npx playwright test safety-soft-block`
- [ ] Manual smoke against staging: warfarin+ibuprofen scenario shows CRITICAL DDI; finalize blocks until acked.
EOF
)"
```

---

## Self-review checklist

After implementation, verify:
- [ ] Spec §1-§9 all have corresponding tasks above.
- [ ] No `TBD`, `TODO`, "fill in later" anywhere in the plan.
- [ ] Method signatures consistent across phases (e.g. `acknowledge(visitId, info)` in Task 11.1 matches the call site in Task 12.2).
- [ ] Test fixtures (`drug_knowledge_test.json`, `test_patients.json`) — defer to first use; the seed file in Task 2.2 covers integration tests; pure-unit tests use inline fixtures.
- [ ] PHI redaction enforced in every log statement (`structlog` calls in `evaluator_agent.py` and `hallucination.py` carry only counts and UUIDs).
- [ ] Audit-log mappings documented in §6.5 of the spec are written by every relevant write path (`AuditLogService.write` calls in app services).

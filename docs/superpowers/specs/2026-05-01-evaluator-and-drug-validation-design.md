# Evaluator Agent + Expanded Drug Validation — Design

**Date:** 2026-05-01
**Status:** Approved by user; ready for implementation planning
**Scope owner:** Agent + Backend + Frontend (full stack)
**Out of scope (deferred):** Hermes feedback loop (separate subproject), e-prescription generation (out of PRD §7 scope)

---

## §1 — Overview & Architecture

### Goal

Add a critic agent that runs after the report drafter and produces structured safety + quality findings the doctor reviews before finalizing. Expand drug validation from allergy-only (existing) to allergy + drug-drug interactions + pregnancy/lactation safety + dose-range checks, plus add hallucination and completeness checks on the SOAP draft itself.

### Locked design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Scope: Evaluator + drug validation. Hermes feedback loop deferred; e-prescription deferred. | Single-spec discipline; e-prescription is out of PRD §7 scope. |
| 2 | Validators: allergy + DDI + pregnancy/lactation + dose-range. | All four chosen by user as MVP set. |
| 3 | Knowledge source: Neo4j-native (Drug / DrugClass / PregnancyCategory / DoseRule), seeded from JSON. | Fits the existing Graphify pattern; multi-hop queries via Cypher; class-level interaction rules cleanly. |
| 4 | Runtime placement: synchronous after drafter, before response returns. | Lowest latency for "doctor sees flags before reviewing"; bounded latency budget (1-3s parallel Cypher + 1 LLM). |
| 5 | Severity policy: tiered. Flag-only for HIGH/MEDIUM/LOW; soft-block at finalize for CRITICAL with explicit per-finding acknowledgement. | Honours the doctor-in-the-loop invariant; provides forcing function on the highest-risk findings without paternalism. |
| 6 | Report-quality scope: hallucination check + completeness check. | Hallucination = existential safety (per 2026-04-30 PHI leak post-mortem); completeness = mechanical/cheap. Internal consistency + documentation quality deferred to v2. |
| 7 | Testing: TDD validators + 1 E2E (CRITICAL → soft-block → ack → finalize) + visual theme conformance via Playwright MCP. | Matches project's 80% coverage standard for safety-critical code; reuses existing E2E protocol. |
| 8 | UI surface: "AI Safety Review" panel during doctor review only. No surface on final report or patient summary. | Avoids "approval stamp" framing that conflicts with doctor-in-the-loop invariant. Findings persist for audit. |

### High-level flow

```
Doctor clicks "Generate report"
  ↓
POST /agents/report/generate    (existing route, modified)
  ↓
ReportAgent.step(...)           (existing — unchanged behaviour, draft persisted to visits.report_draft)
  ↓
EvaluatorAgent.evaluate(...)    (NEW — runs after drafter, before response closes)
  ↓
  ├─ Phase 1 parallel: 4 Cypher validators + 1 Python validator
  │     - check_drug_allergy_interaction   (existing, moved into evaluator)
  │     - check_drug_drug_interactions     (NEW)
  │     - check_pregnancy_safety           (NEW)
  │     - check_dose_range                 (NEW)
  │     - completeness_check               (NEW, no LLM, no Cypher)
  └─ Phase 2 sequential: hallucination_check  (NEW, single LLM call)
  ↓
Persist findings to evaluator_findings (Postgres) — supersedes prior non-superseded findings in same txn
  ↓
Emit SSE event `evaluator.done` with findings array
  ↓
Frontend: ReportReview page renders SOAP draft + AI Safety Review panel
  ↓
Doctor reviews → acknowledges any CRITICAL findings → clicks "Finalize"
  ↓
POST /api/visits/{id}/finalize
  ↓
Spring Boot pre-flight: reject 409 if any unacknowledged CRITICAL findings exist
  ↓
On success → finalize visit, audit, fire post-visit summary + WhatsApp reminders
```

### DDD integration — child of Visit aggregate

Per `docs/details/ddd-conventions.md`, EvaluatorFinding is a **child entity of the Visit aggregate**, not a new aggregate. Reasoning: lifecycle bound to a visit (CASCADE on delete), no standalone existence, finalize-guard is naturally a Visit invariant. A new aggregate would force constant cross-aggregate calls, which the conventions doc explicitly warns against.

**Two write paths (mirrors existing `visits.report_draft` precedent):**

- **Path A — Agent → Postgres direct (CREATE / SUPERSEDE):** Python evaluator inserts new findings + supersedes prior ones directly via `agent/app/persistence/evaluator_findings.py`. Bypasses Spring Boot. Same pattern as `_h_update_soap_draft` writing `visits.report_draft`. Audit rows written by the agent's existing audit-log helper.
- **Path B — Spring Boot through Visit aggregate (ACKNOWLEDGE):** Doctor acknowledgement is a clinical decision — must go through the proper aggregate boundary. Flow: `VisitController` → `VisitWriteAppService.acknowledgeFinding(...)` → loads `VisitModel` via `VisitRepository` → calls `EvaluatorFindingAcknowledgeDomainService.acknowledge(visit, findingId, reason, doctorId)` → mutates child on loaded aggregate → saves via `VisitRepository`.

**Single read path:** `VisitReadAppService.listFindings(visitId)` loads the aggregate → returns `visit.findings()` filtered by `superseded_at IS NULL`.

**Finalize guard:** `MedicalReportFinalizeDomainService` (existing) modified to call `visit.requireFinalizable()`. The JPA query uses the partial index `evaluator_findings_unack_critical_idx` for index-only scan; no full child-collection load required.

### Module boundaries

**Agent (Python):**
```
agent/app/agents/evaluator_agent.py            — orchestrator class
agent/app/agents/evaluator/
  completeness.py                              — pure-Python validator
  hallucination.py                             — LLM-based validator
agent/app/graph/queries/
  drug_drug_interaction.py                     — DDI Cypher
  pregnancy_safety.py                          — pregnancy Cypher
  dose_range.py                                — dose Cypher
  drug_interaction.py                          — existing allergy Cypher (kept)
agent/app/graph/seed/
  drug_knowledge.json                          — seed data
  apply_drug_knowledge.py                      — idempotent loader
agent/app/tools/evaluator_tools.py             — LangGraph tool wrappers
agent/app/schemas/evaluator.py                 — Pydantic schemas
agent/app/persistence/evaluator_findings.py    — Postgres repository
agent/app/routes/evaluator.py                  — re-evaluate + findings GET routes
```

**Backend (Spring Boot — extends existing `visit/` aggregate):**
```
domain/biz/visit/
  model/EvaluatorFindingModel.java             — NEW child entity
  enums/FindingCategory.java                   — NEW
  enums/FindingSeverity.java                   — NEW
  service/EvaluatorFindingAcknowledgeDomainService.java   — NEW
  service/EvaluatorFindingSupersedeDomainService.java     — NEW
  service/MedicalReportFinalizeDomainService.java         — MODIFIED (finalize guard)
  event/EvaluatorFindingAcknowledgedDomainEvent.java      — NEW (optional, future analytics)
  info/EvaluatorRunResultInfo.java             — NEW
application/biz/visit/
  VisitReadAppService.java                     — MODIFIED (listFindings)
  VisitWriteAppService.java                    — MODIFIED (acknowledgeFinding, reEvaluate)
controller/biz/visit/
  VisitController.java                         — MODIFIED (3 new routes)
  request/AcknowledgeFindingRequest.java       — NEW
  response/EvaluatorFindingDTO.java            — NEW
  converter/EvaluatorFindingModel2DTOConverter.java — NEW
infrastructure/repository/visit/
  VisitRepositoryImpl.java                     — extended for findings
  EvaluatorFindingEntity.java                  — NEW JPA entity
infrastructure/client/
  AgentServiceClient.java                      — MODIFIED (reEvaluate, getFindings)
```

**Frontend:**
```
frontend/app/doctor/visits/[visitId]/components/safety/
  AISafetyReviewPanel.tsx                      — top-level container
  SafetyStatusRow.tsx                          — per-category pills
  FindingCard.tsx                              — expandable per-finding card
  AcknowledgeFindingDialog.tsx                 — modal
  SafetyUnavailableBanner.tsx                  — degraded state
  useEvaluatorFindings.ts                      — SWR + SSE hook
  types.ts                                     — mirrors agent schema
```

---

## §2 — Data Model

### §2.1 Postgres additions

**New columns on `patients`:**

```sql
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
```

Defaults NULL. Pregnancy validator returns no findings if status ∈ {`NOT_PREGNANT`, `UNKNOWN`}, NULL — never leaks pregnancy assumptions. Weight required by some dose rules; missing → emit MEDIUM finding "patient weight unknown — dose unverified" (rather than silently skip).

**New table `evaluator_findings`:**

```sql
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

`superseded_at` non-null = invalidated by re-evaluation. Old findings remain for audit; queries filter `superseded_at IS NULL`. Partial index makes the finalize-guard a fast index-only scan.

App-code rule: only INSERT new rows + UPDATE `acknowledged_*` / `superseded_at`. Audit log invariant unchanged.

**Audit log entries (no schema change — uses existing `audit_log` table, mapped to existing action enum):**

| Logical action | DB action | Subaction (metadata) | Resource type |
|---|---|---|---|
| Finding created (agent) | `CREATE` | `evaluator_finding` | `evaluator_finding` |
| Finding superseded (agent) | `UPDATE` | `SUPERSEDE` | `evaluator_finding` |
| Finding read (doctor/staff) | `READ` | `evaluator_finding` | `evaluator_finding` |
| Finding acknowledged (doctor) | `UPDATE` | `ACKNOWLEDGE` | `evaluator_finding` |
| Finalize blocked by finding (doctor attempt) | `UPDATE` | `FINALIZE_BLOCKED` | `visit` |
| Manual re-evaluation (doctor) | `READ` | `EVALUATOR_RE_EVALUATE` | `visit` |

Mapping to existing enum avoids a high-blast-radius migration on `audit_log`. Subaction is queryable via `metadata->>'subaction'`.

### §2.2 Neo4j additions

**New nodes:**
- `Drug` — `name` (unique), `rxnorm_code` (optional), `atc_code` (optional)
- `DrugClass` — `name` (unique)
- `PregnancyCategory` — `code` (A/B/C/D/X, unique), `description`
- `DoseRule` — `id` (unique), `min_age_years`, `max_age_years`, `min_weight_kg`, `max_weight_kg`, `route`, `min_dose_mg`, `max_dose_mg`, `max_daily_mg`, `frequency_pattern`

**New relationships:**
- `(Drug)-[:BELONGS_TO]->(DrugClass)`
- `(Drug)-[:INTERACTS_WITH {severity, mechanism, source}]->(Drug)` — symmetric pairs seeded both directions
- `(DrugClass)-[:INTERACTS_WITH {severity, mechanism, source}]->(Drug)` — class-level
- `(DrugClass)-[:INTERACTS_WITH {severity, mechanism, source}]->(DrugClass)` — class↔class
- `(Drug)-[:PREGNANCY_CATEGORY {lactation_safe, advisory}]->(PregnancyCategory)`
- `(Drug)-[:HAS_DOSE_RULE]->(DoseRule)`

**Existing kept unchanged:**
- `(Patient)-[:ALLERGIC_TO]->(Allergy)`
- `(Visit)-[:PRESCRIBED]->(Medication)`

**Schema constraints (added to `agent/app/graph/schema.py`):**

```python
"CREATE CONSTRAINT drug_name_unique IF NOT EXISTS FOR (d:Drug) REQUIRE d.name IS UNIQUE",
"CREATE CONSTRAINT drugclass_name_unique IF NOT EXISTS FOR (c:DrugClass) REQUIRE c.name IS UNIQUE",
"CREATE CONSTRAINT pregcat_code_unique IF NOT EXISTS FOR (p:PregnancyCategory) REQUIRE p.code IS UNIQUE",
"CREATE CONSTRAINT doserule_id_unique IF NOT EXISTS FOR (r:DoseRule) REQUIRE r.id IS UNIQUE",
```

**Seed file:** `agent/app/graph/seed/drug_knowledge.json` (~150 Malaysian primary-care drugs), loaded by idempotent `apply_drug_knowledge()` invoked from FastAPI lifespan after `apply_schema()`. Uses `MERGE`.

### §2.3 Pydantic schemas (agent)

`agent/app/schemas/evaluator.py`:

```python
Severity = Literal["CRITICAL","HIGH","MEDIUM","LOW"]
Category = Literal["DRUG_ALLERGY","DDI","PREGNANCY","DOSE","HALLUCINATION","COMPLETENESS"]

class Finding(BaseModel):
    category: Category
    severity: Severity
    field_path: str | None = None
    message: str
    details: dict = Field(default_factory=dict)

class EvaluationResult(BaseModel):
    visit_id: UUID
    findings: list[Finding]
    validators_run: list[Category]
    validators_unavailable: list[tuple[Category, str]] = Field(default_factory=list)
```

---

## §3 — Validators

Each validator is self-contained. Phase 1 (5 validators) runs in parallel; Phase 2 (hallucination, 1 validator) runs after, taking draft as-is.

### §3.1 `check_drug_allergy_interaction` (existing, kept)

`agent/app/graph/queries/drug_interaction.py` — already implemented. Migrated from report agent's tool registry to evaluator's. No code change; only the caller moves.

- **Severity:** any match → `CRITICAL`.
- **Field path:** `plan.medications[i]`.

### §3.2 `check_drug_drug_interactions` (new)

Cypher (full query in design discussion; key behaviour):
- Searches active meds (last 90 days from finalized visits) AND co-prescribed drugs within same draft.
- Supports drug↔drug, drug↔class, class↔class via `BELONGS_TO`.
- Symmetric edges seeded both directions to avoid two-way matching cost.
- Severity from `INTERACTS_WITH.severity`: `MAJOR`→CRITICAL, `MODERATE`→HIGH, `MINOR`→LOW. Mapping in validator wrapper, not seed data.
- **Field path:** `plan.medications[i]` for `drug_a`. `details.{drug_b, mechanism, source}`.

### §3.3 `check_pregnancy_safety` (new)

- **Bypass rule:** if `pregnancy_status` ∈ {`NOT_PREGNANT`, NULL, `UNKNOWN`}, validator returns no findings AND does not log pregnancy was checked (privacy: never imply pregnancy state in audit metadata).
- Cypher fetches `PREGNANCY_CATEGORY` edge for proposed drugs.
- **Severity matrix:**

| Pregnancy status | D | X | C | B | A | No data |
|---|---|---|---|---|---|---|
| `PREGNANT` | CRITICAL | CRITICAL | HIGH | LOW | LOW | MEDIUM |
| `LACTATING` | HIGH (if `lactation_safe=false`) else MEDIUM | CRITICAL | MEDIUM | LOW | LOW | MEDIUM |

- **Field path:** `plan.medications[i]`. `details.{category, advisory, pregnancy_status, trimester}`.

### §3.4 `check_dose_range` (new)

Cypher selects `DoseRule` edges matching `route`, `age` band, `weight` band.

**Python pre-processing:**
- Parse `MedicationOrder.dose` ("500mg", "5 mg/kg") to numeric mg. Missing/ambiguous → MEDIUM "dose units missing".
- Parse `frequency` to per-day count via regex table (BD=2, TDS=3, QID=4, Q4H=6, Q6H=4, Q8H=3, Q12H=2, OD=1, "twice daily"=2, etc.). Unparseable → LOW "frequency format not recognised".
- Compute `daily_total_mg = dose_mg × frequency_per_day`.
- Compute `patient_age_years` from `date_of_birth`; null if missing.

**Severity mapping:**

| Condition | Severity |
|---|---|
| `daily_total_mg > max_daily_mg` | CRITICAL |
| `dose_mg > max_dose_mg` | CRITICAL |
| `dose_mg < min_dose_mg` | HIGH |
| No matching `DoseRule` (drug exists, no rule for age/weight band) | MEDIUM |
| Weight required but `weight_kg` NULL | MEDIUM |
| Drug not in graph | LOW (skip; coverage logged via metric) |

- **Field path:** `plan.medications[i]`. `details.{proposed_dose_mg, daily_total_mg, allowed_range, rule_id}`.

### §3.5 `completeness_check` (new, pure Python — no LLM, no Cypher)

Extends existing `required_field_is_missing()` from `agent/app/schemas/report.py:59`.

| Check | Severity |
|---|---|
| `subjective.chief_complaint` empty | MEDIUM |
| `subjective.history_of_present_illness` empty | MEDIUM |
| `assessment.primary_diagnosis` empty | MEDIUM |
| Any `MedicationOrder` missing required fields | MEDIUM |
| `plan.follow_up.needed=true` and `timeframe` empty | MEDIUM |
| ICD-10 code present, doesn't match diagnosis text (heuristic lookup) | LOW |
| `plan.medications` empty AND assessment names a treatable condition | LOW |

### §3.6 `hallucination_check` (new, single LLM call)

Runs after Phase 1 completes.

**Inputs:** SOAP draft JSON + patient context (graph) + original transcript (from `agent_turns`).

**System prompt** (paraphrase): every clinical claim is `SUPPORTED` (transcript), `CONTEXTUAL` (graph), `INFERRED` (already in `confidence_flags`), or `UNSUPPORTED` (no source). Output JSON `{"unsupported": [{"field_path","claim","reason"}]}`. Never invent example values. Reuses guardrail invariants from `docs/details/agent-design.md:46-51`.

- Each `unsupported` → `Finding(category=HALLUCINATION, severity=HIGH)`.
- HIGH (not CRITICAL) — doctor sees the same content beside the flag, so they can verify directly.
- Timeout 8s. On error → no findings + `validators_unavailable=[("HALLUCINATION", reason)]`.

### §3.7 Orchestration

`agent/app/agents/evaluator_agent.py`:

```python
class EvaluatorAgent:
    async def evaluate(self, ctx: AgentContext) -> EvaluationResult:
        draft = await self._load_draft(ctx.visit_id)
        if draft is None:
            raise ValueError("evaluator: no draft to evaluate")

        patient_state = await self._load_patient_state(ctx.patient_id)
        proposed_drugs = self._extract_proposed_drugs(draft)

        # Phase 1 — parallel
        cheap = await asyncio.gather(
            self._run_validator("DRUG_ALLERGY",  check_drug_allergy_interaction(...)),
            self._run_validator("DDI",           check_drug_drug_interactions(...)),
            self._run_validator("PREGNANCY",     check_pregnancy_safety(...))
                if patient_state.is_pregnant_or_lactating else _empty(),
            self._run_validator("DOSE",          check_dose_range(...)),
            self._run_validator("COMPLETENESS",  completeness_check(draft)),
            return_exceptions=True,
        )

        # Phase 2 — hallucination
        halluc = await self._run_validator("HALLUCINATION", hallucination_check(...))

        findings, unavailable = self._collect(cheap + [halluc])
        await self._persist(ctx.visit_id, findings)
        return EvaluationResult(visit_id=ctx.visit_id, findings=findings,
                                validators_run=..., validators_unavailable=unavailable)
```

Each validator wrapped by `_run_validator` which catches exceptions and converts to `(category, error_reason)` — one validator failing does not tank the run.

---

## §4 — API Surface

### §4.1 Python agent (FastAPI)

**Modified — `POST /agents/report/generate`:**
- Drafter SSE stream unchanged.
- After drafter completes, route invokes `EvaluatorAgent.evaluate(ctx)` synchronously.
- Emits `event: evaluator.done` with findings, then closes stream.
- On evaluator failure: emits `event: evaluator.error` with reason. Stream still closes 200.

**Modified — `POST /agents/report/edit` and `POST /agents/report/clarify`:**
- Same change: re-run evaluator after the drafter step completes. Findings supersede prior non-superseded findings.

**Modified — `POST /agents/report/finalize`:**
- Add pre-check: query `evaluator_findings` for unacknowledged-CRITICAL rows; if any exist → 409 `{ error: "unacknowledged_critical_findings", finding_ids: [...] }`. Defence-in-depth; Spring Boot also checks.

**New — `GET /agents/evaluator/findings/{visit_id}`:**
- Returns current (non-superseded) findings. Read-only.
- Response: `{"findings": [...], "evaluator_run_at": "..."}`.

**New — `POST /agents/evaluator/re-evaluate`:**
- Body: `{visit_id, patient_id, doctor_id}`.
- Manual re-run trigger. Spring Boot is the only intended caller.
- Returns same shape as `evaluator.done` event.

**Superseding rule:** before persisting new findings, mark all pre-existing non-superseded findings for `visit_id` as `superseded_at=now()`. Single transaction. Acknowledged findings are also superseded — ack is per-finding-instance, not per-visit. If issue recurs after edit, doctor must ack again.

### §4.2 Spring Boot (REST)

**Routes added under existing `VisitController` (route group `controller/biz/visit/`):**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/visits/{visitId}/findings` | DOCTOR (visit owner) or STAFF/ADMIN | List non-superseded findings |
| `POST` | `/api/visits/{visitId}/findings/{findingId}/acknowledge` | DOCTOR (visit owner) | Set ack columns + write audit row |
| `POST` | `/api/visits/{visitId}/re-evaluate` | DOCTOR (visit owner) | Proxies to agent's `/agents/evaluator/re-evaluate` |

**Modified — `POST /api/visits/{visitId}/finalize`:**
- New pre-flight in `MedicalReportFinalizeDomainService.finalize()`:
  ```java
  visit.requireFinalizable();  // raises UnacknowledgedCriticalFindingsException
  ```
- `VisitModel.requireFinalizable()` queries unacked-CRITICAL via partial index.
- Maps to HTTP 409 `{error:"UNACKNOWLEDGED_CRITICAL_FINDINGS", details:{finding_ids:[...]}}`.
- Audit row written **before** the exception.

**Authorization (per `docs/details/identity-and-authz.md`):**
- Doctor identity from JWT `claims.userId()`.
- Visit ownership: `visit.doctor_id == claims.userId()`. Hardcoded IDs forbidden (post-mortem 2026-04-30).
- ADMIN bypass: read only, NOT acknowledge (acks are clinical decisions; only the assigned doctor can ack).

### §4.3 Spring Boot ↔ Agent calls

`AgentServiceClient` extended:

```java
EvaluatorFindings reEvaluate(UUID visitId, UUID patientId, UUID doctorId);
EvaluatorFindings getFindings(UUID visitId);
```

Both wrapped by Resilience4j (existing `agent-service` instance). On CB-open: empty findings + `availability=DEGRADED` flag in DTO.

### §4.4 Error envelope

Existing format:

```json
{ "data": null, "error": {
    "code":"UNACKNOWLEDGED_CRITICAL_FINDINGS",
    "message":"...",
    "details":{"finding_ids":["uuid1","uuid2"]}
}}
```

---

## §5 — Frontend

### §5.1 Placement

In `frontend/app/doctor/visits/[visitId]/page.tsx` (uses `SplitReview`), insert AISafetyReviewPanel **above SOAP draft, below GenerateBar** in the right column:

```
[Patient + visit header]
[GenerateBar / Phased spinner during generation]
─────────────────────────────────────────────
[AISafetyReviewPanel]   ← NEW
─────────────────────────────────────────────
[ReportPanel — SOAP draft, editable]
[ReportChatPanel — clarification / edit chat]
```

**No surface on:** `ReportPreview.tsx`, `frontend/app/portal/visits/[visitId]/page.tsx`, printed/PDF exports.

### §5.2 Components

```
frontend/app/doctor/visits/[visitId]/components/safety/
  AISafetyReviewPanel.tsx
  SafetyStatusRow.tsx
  FindingCard.tsx
  AcknowledgeFindingDialog.tsx
  SafetyUnavailableBanner.tsx
  useEvaluatorFindings.ts
  types.ts
```

### §5.3 Visual language (aurora-glass conformance)

Reuses existing primitives. No new tokens.

| Severity | Background | Border | Icon | Source |
|---|---|---|---|---|
| CRITICAL | `bg-rose-500/10` | `border-rose-400/40` | `AlertOctagonIcon` | `Card` variant |
| HIGH | `bg-amber-500/10` | `border-amber-400/40` | `AlertTriangleIcon` | `Card` |
| MEDIUM | `bg-sky-500/10` | `border-sky-400/40` | `InfoIcon` | `Card` |
| LOW | `bg-slate-500/10` | `border-slate-400/30` | `InfoIcon` | `Card` |
| Acknowledged | `bg-slate-500/5` (muted) | `border-slate-400/20` | `CheckCircleIcon` | `Card` |
| Unavailable | `bg-slate-500/5` | `border-slate-400/20` | `CloudOffIcon` | `SafetyUnavailableBanner` |

All cards inherit existing `glass-card` class. Status pills reuse `Badge.tsx`. Typography matches `ReportPanel.tsx` rhythm (`SectionHeader`, `DataRow`).

### §5.4 Component behaviour

**`AISafetyReviewPanel`:**
- Hook: `useEvaluatorFindings(visitId)` — initial GET + listens to SSE events.
- Collapsed by default if all clear; auto-expanded if any findings.
- During evaluator run: phased spinner + skeleton rows per category.
- On `evaluator.error` or per-validator unavailable: render `SafetyUnavailableBanner` for affected categories; others render normally.

**`FindingCard`:**
- Header: severity icon + category + short message + chevron.
- Body (expanded): `field_path`, full `message`, details key/value list, "Jump to field" button (scrolls + highlights field in `ReportPanel`).
- CRITICAL: inline "Acknowledge" button → opens `AcknowledgeFindingDialog`.
- Acknowledged: muted style, footer "Acknowledged by Dr. {name} at {time} — {reason}".

**`AcknowledgeFindingDialog`:**
- Reuses `Dialog.tsx`. Optional `Textarea` (max 255 chars).
- On confirm → `POST /api/visits/{visitId}/findings/{findingId}/acknowledge`. Optimistic update; rollback on failure.

### §5.5 Finalize button gating

In `ReportPreview.tsx` (component owning the finalize CTA):
- `unackedCriticalCount = findings.filter(f => f.severity==='CRITICAL' && !f.acknowledged_at).length`.
- If `> 0`: button disabled, tooltip "Acknowledge {n} critical safety finding{s} before finalizing."
- Click handler defensively handles `409 UNACKNOWLEDGED_CRITICAL_FINDINGS` (race): toast + refetch findings.

### §5.6 Re-evaluation UX

After `/agents/report/edit` completes → evaluator re-runs synchronously → new `evaluator.done` arrives.

- Existing findings fade out (300ms), new ones fade in.
- Acknowledged findings disappear if superseded (per §4.1 superseding rule).
- New CRITICAL: panel auto-expands; toast "New critical safety finding detected".

Manual re-eval button: small "Re-run safety checks" in panel header → `POST /api/visits/{visitId}/re-evaluate`.

### §5.7 Empty / loading / error states

| State | UI |
|---|---|
| Pre-generation (no draft) | Panel hidden |
| Drafter running | Panel hidden |
| Drafter done, evaluator running | Skeleton rows |
| All clear | Collapsed "✓ All AI safety checks passed" |
| Findings exist | Status pills + expanded findings |
| Partial validator failure | Affected categories show "unavailable"; others normal |
| Total evaluator failure | Full panel replaced by `SafetyUnavailableBanner`; finalize button **enabled** (don't penalise doctor for our infra failure; logged) |
| No drugs proposed | Drug categories show "n/a — no medications proposed" |

### §5.8 Accessibility

- Severity icons paired with text (colour-blind safe).
- Status pills: `aria-label` with full category + status.
- Dialog: focus trap, Esc to cancel, Enter to confirm.
- Disabled finalize: `aria-disabled="true"` + `aria-describedby` pointing to tooltip.
- Keyboard: Tab focuses cards, Enter expands, `A` opens acknowledge on focused CRITICAL card.

### §5.9 Theme conformance verification (E2E)

Per `feedback_e2e_test_protocol.md`:
- Reference shots from current production state (PatientContextPanel, Toast, Dialog, Badge instances).
- New components captured at 1440×900, same theme.
- `expect(page).toHaveScreenshot()` with 1% tolerance.
- Lint checks: no new color tokens, no arbitrary radius/text-size values, all cards use `glass-card` utility.

---

## §6 — Error Handling, Observability, Audit

### §6.1 Failure modes

The evaluator MUST NEVER block the drafter. Every failure degrades gracefully.

| Failure | Behaviour | User sees |
|---|---|---|
| Neo4j unreachable | Cypher validators → unavailable; non-Neo4j validators run | Affected categories "unavailable — manual review" |
| Single validator throws | Category → unavailable; others continue | Same, scoped |
| Hallucination LLM timeout/parse error | Category → unavailable, log `parse_error`/`timeout` | Hallucination row "unavailable" |
| Patient missing pregnancy/weight columns | Validators emit MEDIUM "data missing — manual review" | Visible flag |
| No draft persisted | `evaluator.error` SSE | `SafetyUnavailableBanner`; finalize stays enabled (defence-in-depth via Spring Boot guard) |
| Total runtime > 15s | Hard timeout; persist what we have; missing → unavailable | Partial panel + banner |
| Postgres write fails | Emit via SSE; retry once; if retry fails → `evaluator.error` `persist_failed` | Banner "validation results may be incomplete" |
| Spring Boot finalize-guard query fails | Fail open; logged P1 | Finalize succeeds; oncall alert |
| Concurrent re-eval race | Postgres advisory lock keyed on `visit_id` for supersede+insert txn | Last writer wins |

**Invariant:** Evaluator is non-blocking on drafter side and non-blocking at finalize EXCEPT for unacknowledged CRITICAL findings.

### §6.2 Timeouts

| Stage | Timeout | On timeout |
|---|---|---|
| Single Cypher validator | 3s | Mark category unavailable |
| Hallucination LLM | 8s | Mark category unavailable |
| Total wall-clock | 15s | Persist partial; missing → unavailable; emit `evaluator.done` |
| Spring Boot → agent re-evaluate | 20s (CB) | Cached findings + DEGRADED |
| Spring Boot → agent findings GET | 5s | Same |

All configurable via env / `application.yml`.

### §6.3 Logging

Per-run summary at INFO (correlation_id propagated):

```json
{ "ts": "...", "level": "INFO", "logger": "evaluator",
  "event": "evaluator.run_complete",
  "correlation_id": "...", "visit_id": "...", "patient_id": "...",
  "duration_ms": 1234,
  "validators_run": ["DRUG_ALLERGY","DDI","DOSE","PREGNANCY","COMPLETENESS","HALLUCINATION"],
  "validators_unavailable": [],
  "findings_count": {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 0, "LOW": 0},
  "drugs_evaluated": 2 }
```

Per-validator failure at WARN: `{event: "evaluator.validator_failed", validator, error_class, error_msg_redacted}`.

**Privacy redaction (universal):**
- Never log: drug names, patient names, finding messages, transcript fragments, allergy names, free-text clinical content.
- Safe: `visit_id`, `patient_id` UUIDs, validator names, severity counts, durations, error classes (not error messages).
- `drugs_evaluated` is a count only.

### §6.4 Metrics (Prometheus)

| Metric | Type | Labels |
|---|---|---|
| `evaluator_runs_total` | counter | `outcome={success,partial,error}` |
| `evaluator_duration_seconds` | histogram | `phase={cheap,hallucination,total}` |
| `evaluator_findings_total` | counter | `category`, `severity` |
| `evaluator_validator_failures_total` | counter | `validator`, `error_class` |
| `evaluator_finalize_blocks_total` | counter | — |
| `evaluator_acknowledgements_total` | counter | `category` |
| `drug_graph_lookup_misses_total` | counter | `validator`, `reason={unknown_drug,no_dose_rule}` |

**Alerts:**
- P2: `evaluator_runs_total{outcome="error"} / evaluator_runs_total > 0.05` over 1h.
- P3: `evaluator_duration_seconds.p95 > 5s` over 30m.

### §6.5 Audit log (PDPA)

All written to existing `audit_log` table; never UPDATE/DELETE.

| Logical action | DB action | metadata.subaction | resource_type | actor |
|---|---|---|---|---|
| `FINDING.CREATE` | `CREATE` | — | `evaluator_finding` | system (agent) |
| `FINDING.SUPERSEDE` | `UPDATE` | `SUPERSEDE` | `evaluator_finding` | system (agent) |
| `FINDING.READ` | `READ` | — | `evaluator_finding` | doctor / staff |
| `FINDING.ACKNOWLEDGE` | `UPDATE` | `ACKNOWLEDGE` | `evaluator_finding` | doctor |
| `VISIT.FINALIZE_BLOCKED` | `UPDATE` | `FINALIZE_BLOCKED` | `visit` | doctor |
| `EVALUATOR.RE_EVALUATE` | `READ` | `EVALUATOR_RE_EVALUATE` | `visit` | doctor |

Acknowledgement reason text is NOT in audit metadata (privacy) — lives only in `evaluator_findings.acknowledgement_reason`.

### §6.6 Correlation IDs

`X-Correlation-ID` header propagates: frontend → Spring Boot → agent. Same ID joins draft generation, evaluation, finding creation, acknowledgement, finalize attempt. Findings audit rows include `correlation_id`.

---

## §7 — Testing

Posture: TDD validators + 1 E2E (CRITICAL → soft-block → ack → finalize) + visual theme conformance via Playwright MCP.

### §7.1 Test pyramid

| Layer | What | Where | Coverage |
|---|---|---|---|
| Unit | Each validator | `agent/tests/agents/evaluator/` | ≥ 90% |
| Unit | Severity / dose / freq parsers | `agent/tests/agents/evaluator/test_mappers.py` | 100% |
| Unit | Spring Boot finalize guard, ack endpoint | `backend/src/test/java/.../visit/` | ≥ 80% |
| Integration | Evaluator with real Neo4j (testcontainers) + Postgres | `agent/tests/integration/test_evaluator_e2e.py` | 1 per scenario |
| Contract | Frontend hook + SSE fixtures | `frontend/__tests__/safety/useEvaluatorFindings.test.tsx` | All states |
| E2E | Doctor flow + theme conformance | `e2e/tests/safety-soft-block.spec.ts` | 1 golden path |

### §7.2 Unit-test scenarios per validator

**DDI:** empty input; direct DDI (warfarin+ibuprofen → CRITICAL); class-level (warfarin+naproxen via NSAID class); proposed-vs-proposed; same drug not self-DDI; expired active med (>90d) ignored; cancelled visit ignored; symmetric edge no double-emit; severity mapping parametrized.

**Pregnancy:** `NOT_PREGNANT`/`UNKNOWN`/NULL → no findings (no Cypher call); `PREGNANT`+D/X → CRITICAL; `PREGNANT`+C → HIGH; `PREGNANT`+B → LOW; `LACTATING`+`lactation_safe=false` → HIGH; `LACTATING`+safe → LOW; no Category edge → MEDIUM; trimester present/absent in details; **privacy assertion**: pregnancy state never in `validators_unavailable` metadata.

**Dose:** under min → HIGH; at boundary → no finding; per-dose over max → CRITICAL; daily total over max → CRITICAL; freq unparseable → LOW; dose unit missing → MEDIUM; no dose rule for age band → MEDIUM; weight required but null → MEDIUM; drug not in graph → LOW (skip); freq synonym table parametrized.

**Completeness:** required field empty → MEDIUM; ICD-10 mismatch → LOW; follow-up needed without timeframe → MEDIUM; empty `plan.medications` with treatable assessment → LOW; all good → empty.

**Hallucination:** in transcript → no finding; in context (not transcript) → no finding (CONTEXTUAL allowed); not in either → HIGH UNSUPPORTED; `inferred` flag → no finding (already flagged); LLM invalid JSON → `parse_error` unavailable; LLM timeout → `timeout` unavailable; mock fixture → deterministic mapping.

**Mapping (pure functions):** DDI severity (`MAJOR/MODERATE/MINOR` → 3 rows); pregnancy matrix (5×4 = 20 rows); dose severity (7 rows).

### §7.3 Integration tests

`agent/tests/integration/test_evaluator_e2e.py`:

1. Happy path no findings.
2. Allergy match → 1 CRITICAL.
3. DDI cascade (warfarin + ibuprofen) → 1 CRITICAL.
4. Pregnancy + DDI combined.
5. Re-eval supersedes prior + acked finding.
6. Re-eval re-emits if issue persists (NOT acknowledged on new instance).
7. Validator unavailable (kill Neo4j mid-run).
8. Total timeout (mock validators 20s each).
9. Audit rows assertion for create / ack / blocked-finalize.

### §7.4 Spring Boot tests

1. `listFindings` returns only non-superseded.
2. Doctor not assigned to visit → 403.
3. Patient role → 403.
4. `acknowledge` writes ack columns + audit row in single txn.
5. `acknowledge` already-acknowledged → idempotent OK.
6. `acknowledge` superseded finding → 410 Gone.
7. `finalize` with unacked CRITICAL → 409 + audit row.
8. `finalize` all acked → 200.
9. `re-evaluate` proxy + CB-open → DEGRADED header.

### §7.5 Frontend tests

**Hook:** initial fetch; SSE `evaluator.done` updates state; SSE `evaluator.error` sets UNAVAILABLE; ack optimistic + rollback.

**Components:** panel collapsed when clear / expanded when findings; FindingCard renders Acknowledge only on CRITICAL; AcknowledgeFindingDialog validates max-length; finalize button disabled when unackedCriticalCount > 0.

### §7.6 E2E (Playwright MCP)

`e2e/tests/safety-soft-block.spec.ts`:

```
1. Rebuild Docker stack with --no-cache (per E2E protocol).
2. Login as Dr. Lim (seeded).
3. Navigate to visit with transcript producing CRITICAL DDI
   (seeded patient on warfarin, transcript "prescribe ibuprofen 400mg TDS").
4. Click "Generate report".
5. Wait for SSE evaluator.done.
6. Assert: AI Safety Review panel with 1 CRITICAL DDI finding.
7. Screenshot diff vs safety-panel-critical.snap.png.
8. Click Finalize → expect 409, toast, finalize NOT succeeded.
9. Click Acknowledge → reason → confirm.
10. Screenshot diff vs safety-panel-acked.snap.png.
11. Click Finalize → 200 → finalized view.
12. Assert finalized report does NOT contain "evaluator", "AI Safety", "approved by".
13. Screenshot diff vs report-preview-clean.snap.png.
```

### §7.7 Visual theme conformance

- Reference shots from current production-state screens (PatientContextPanel, Toast, Dialog, Badge).
- Pixel diff via `expect(page).toHaveScreenshot()` 1% tolerance.
- Lint checks: no new color tokens; no arbitrary `text-[Npx]` / `rounded-[Npx]`; all cards use `glass-card`.
- Manual visual review in PR template (not CI).

### §7.8 Test fixtures

- `agent/tests/fixtures/drug_knowledge_test.json` — ~20 drugs, ~10 DDI edges, ~5 pregnancy categories, ~10 dose rules.
- `agent/tests/fixtures/test_patients.json` — 5 personas (clean, pregnant, lactating, paediatric, elderly).
- `agent/tests/fixtures/test_drafts.json` — 8 SOAP drafts triggering each finding type.
- E2E seed extends existing demo seeder behind `cliniflow.dev.seed-demo-enabled` flag.

### §7.9 TDD discipline

1. Unit tests RED first.
2. Implement validators to GREEN one at a time.
3. Refactor.
4. Integration RED → GREEN.
5. Spring Boot side.
6. Frontend.
7. E2E + visual snapshots.

Plan phase sequence (writing-plans skill output) will encode this ordering.

---

## §8 — Migration & Deployment

### §8.1 Postgres migration

Apply Block 1 + Block 2 SQL in Supabase SQL editor (already done as of design-time). Document in:

```
backend/src/main/resources/db/migration/V2__evaluator_and_drug_validation.sql
```

Reference-only documentation per CLAUDE.md ("Flyway is NOT used … `db/migration/` SQL files are documentation/reference only").

### §8.2 Neo4j seed

`apply_drug_knowledge()` invoked from FastAPI lifespan after `apply_schema()`. Idempotent (`MERGE`-based). Safe to re-run on every start.

### §8.3 Configuration

New env vars:

```
EVALUATOR_TIMEOUT_TOTAL_SECONDS=15
EVALUATOR_TIMEOUT_CYPHER_SECONDS=3
EVALUATOR_TIMEOUT_LLM_SECONDS=8
EVALUATOR_DDI_ACTIVE_MED_LOOKBACK_DAYS=90
```

All sourced from `agent/app/config.py`; defaults applied if unset.

### §8.4 Rollback

If the evaluator misbehaves in production:
1. Feature flag `evaluator.enabled` (env var) — when false, `/agents/report/generate` skips evaluator entirely. Drafter behaviour unchanged.
2. Findings already in DB are read-only legacy; UI tolerates absent SSE event (banner "validation skipped").
3. Schema changes (Postgres + Neo4j) are additive only — no rollback needed for inert columns/nodes.

---

## §9 — Open questions / future work

- **Patient self-reported pregnancy / weight collection UX:** out of scope. Today doctor or staff enters via existing patient-edit form (which gains 4 new fields). A future patient-portal flow could let patients self-update weight + pregnancy status with consent and audit trail.
- **Drug knowledge updates:** seed JSON is checked in. Future: scheduled refresh from RxNav / openFDA / Malaysian drug formulary, triggered by ops job.
- **Evaluator output as Hermes input signal:** when Hermes feedback loop is built (deferred subproject), it should consume evaluator findings — if a doctor edited a section the evaluator flagged, that edit is a flag-correction, NOT a style preference; do NOT learn it.
- **Internal consistency + documentation quality checks (v2):** deferred. Re-introduce as separate validators if doctor feedback indicates demand.
- **Hard-block at finalize for CRITICAL (v3?):** currently soft-block via ack. If incident data shows acks-without-reason becoming routine, consider tightening to require reason text on CRITICAL acks.

---

## Appendix A — Severity decision rules summary

| Finding | Severity | Rationale |
|---|---|---|
| Drug allergy match | CRITICAL | Known patient sensitisation — highest direct-harm class |
| DDI MAJOR | CRITICAL | Severe interaction; harm risk demands explicit acknowledgement |
| DDI MODERATE | HIGH | Notable; doctor should see flag but invariant doesn't require ack |
| DDI MINOR | LOW | Informational |
| Pregnancy + Cat D / X | CRITICAL | Teratogenic / fetal harm — highest direct-harm class |
| Pregnancy + Cat C | HIGH | Animal evidence of harm; proceed with caution |
| Pregnancy + Cat B (lactation `lactation_safe=false`) | HIGH | Lactation safety concern |
| Pregnancy + Cat A/B (others) | LOW | Informational |
| Dose: per-dose or daily total over max | CRITICAL | Overdose risk |
| Dose: under min therapeutic | HIGH | Subtherapeutic — treatment failure risk |
| Dose: no rule for age/weight band | MEDIUM | Coverage gap; manual review needed |
| Dose: weight required but null | MEDIUM | Data gap; manual review |
| Hallucination (UNSUPPORTED claim) | HIGH | Hallucination risk; doctor sees same content beside flag |
| Completeness: required field missing | MEDIUM | Mechanical; finalize blocked by existing validation |
| Completeness: ICD-10 mismatch | LOW | Documentation hygiene |
| Drug not in graph | LOW (skip) | Unknown drug; evaluator can't validate; coverage logged |

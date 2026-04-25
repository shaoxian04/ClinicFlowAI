# Pre-Visit Panel Redesign — Design Spec

**Date:** 2026-04-22
**Branch:** `day3-postvisit-portal` (sub-slice)
**Status:** Approved for implementation

## 1. Goal, Architecture, Scope

### Goal

Improve the Visit Detail → Pre-Visit Report tab so a doctor can understand a patient's pre-visit situation in under 15 seconds, without reading any conversation transcript. Two tracks:

- **Track A** — Replace the raw intake-transcript rendering with a structured clinical-summary card that reads from `visits.pre_visit_structured.fields`. Requires the agent to actually populate those fields (it doesn't today — `/agents/pre-visit/turn-sync` hardcodes `fields={}` at `agent/app/routes/pre_visit.py:98`).
- **Track B** — Wire up the already-built Patient Context sidebar (`PatientContextPanel`) to live Neo4j data by adding a backend proxy endpoint that delegates to the agent's `get_patient_context` query + visit history.

Both tracks land on the same tab and together eliminate the current "transcript dump + unavailable banner" experience.

### Architecture

```
┌────────────────────────────────────────────────────┐
│  Visit Detail page — Pre-Visit tab                 │
│                                                    │
│  ┌──────────────────────────┐  ┌────────────────┐ │
│  │ PreVisitSummary          │  │ PatientContext │ │
│  │ (Track A)                │  │ Panel          │ │
│  │ reads:                   │  │ (Track B wire) │ │
│  │   detail.preVisitStruct. │  │                │ │
│  │   fields                 │  │ reads:         │ │
│  └──────────────────────────┘  │  /patients/.../│ │
│                                 │   context      │ │
│                                 └───────▲────────┘ │
└─────────────────────────────────────────┼──────────┘
                                          │ HTTP GET
                                 ┌────────┴────────┐
                                 │ Backend         │
                                 │ PatientController│
                                 │ .getContext()   │
                                 └────────┬────────┘
                                          │ AgentServiceClient
                                          │ .getPatientContext()
                                 ┌────────▼────────┐
                                 │ Agent           │
                                 │ GET /agents/    │
                                 │  patient-       │
                                 │  context/{id}   │
                                 └────────┬────────┘
                                          │ Cypher
                                 ┌────────▼────────┐
                                 │ Neo4j           │
                                 │ (:Patient)      │
                                 │   -[:ALLERGIC_TO]│
                                 │   -[:HAS_COND]  │
                                 │   -[:TAKES]     │
                                 │   -[:HAD_VISIT] │
                                 └─────────────────┘
```

**Architectural rules preserved:**

- Frontend → Spring Boot only (no direct agent/Neo4j access from the browser).
- Neo4j access remains agent-only; backend is a pass-through.
- No new writes — both tracks are read-only.
- No DB migration — `pre_visit_structured.fields` already exists as jsonb.

### Scope

**In scope:**

- Track A: `/turn-sync` extraction call, `PreVisitSummary` component, removal of transcript-dump fallback, field-contract typing in `frontend/lib/types/preVisit.ts`.
- Track B — read path: New agent route `GET /agents/patient-context/{patient_id}` (combines existing `get_patient_context` + `get_visit_history`), new backend route `GET /patients/{id}/context`, new `AgentServiceClient.getPatientContext(UUID)` method, response DTO, error mapping.
- Track B — Neo4j health: `GET /agents/patient-context/healthz` endpoint; non-fatal startup probe.
- Track B — demo seed: `POST /agents/patient-context/seed-demo-bulk` agent route, `POST /patients/context/seed-demo-all` backend route (flag-gated), `/whoami` `devSeedAllowed` field, frontend "Seed demo graph (all patients)" button inside `PatientContextPanel`.
- Both: updated unit tests for changed code paths; integration tests for the new endpoints.

**Out of scope (deferred):**

- Adding new slots to `PreVisitSlots` (associated_symptoms, red_flags, aggravating/relieving factors, recent_exposure).
- Urgency-suggestion field on the summary.
- "View full transcript" link on the summary.
- Patient-reported data separate from graph-KB data (panel shows only graph-KB / "records on file").
- Clickable `recentVisits` rows deep-linking to prior visit detail pages.
- Caching patient context.
- Authorization scoping beyond what exists today.
- Draft-visit label on recent visits (only finalized visits are in Neo4j today).

---

## 2. Track A — Pre-Visit Summary

### Data contract

Agent-emitted shape (returned by `/turn-sync`, persisted at `visits.pre_visit_structured.fields`):

```json
{
  "chief_complaint": "Cough and low-grade fever",
  "symptom_duration": "3 days",
  "pain_severity": 4,
  "known_allergies": ["penicillin"],
  "current_medications": ["paracetamol 500mg BD"],
  "relevant_history": ["asthma (childhood)"]
}
```

This matches the existing `PreVisitSlots` pydantic schema at `agent/app/schemas/pre_visit.py:15` exactly — no schema change, just wiring it into the response path.

Every field is patient-confirmed (per the rule that the agent always re-confirms every pre-populated slot). Empty list or `null` = slot not captured this intake.

### Extraction mechanism

After the ReAct loop finishes its reply, a second LLM call extracts `PreVisitSlots` from the full intake history. Runs on every turn so fields accumulate.

```python
async def extract_slots(history: list[dict]) -> PreVisitSlots:
    resp = await llm.chat(
        messages=[
            {"role": "system", "content": EXTRACTION_PROMPT},
            {"role": "user", "content": json.dumps(history)},
        ],
        tools=[],
        response_format={"type": "json_object"},
    )
    return PreVisitSlots.model_validate_json(resp.text)
```

The extraction prompt says "extract only slots the patient has explicitly confirmed or provided; leave others null/empty". The extraction runs concurrently with preparing the final HTTP response (not streamed to the patient separately) — doctor always sees `fields` populated on the same request that persisted the turn.

### Frontend type mirror

New file `frontend/lib/types/preVisit.ts`:

```ts
export interface PreVisitFields {
  chiefComplaint: string | null;
  symptomDuration: string | null;
  painSeverity: number | null;   // 0-10
  knownAllergies: string[];
  currentMedications: string[];
  relevantHistory: string[];
}
```

Backend DTO boundary converts snake_case → camelCase (same `@JsonAlias` pattern as `MedicalReportDto`).

### UI wireframe

```
┌──────────────────────────────────────────────┐
│  PRE-VISIT INTAKE                 01 / INTAKE│
├──────────────────────────────────────────────┤
│                                              │
│  CHIEF COMPLAINT                             │
│  Cough and low-grade fever                   │
│                                              │
│  DURATION            PAIN SEVERITY           │
│  3 days              4 / 10                  │
│                                              │
│  ─────────────────── CONFIRMED WITH PATIENT  │
│                                              │
│  KNOWN ALLERGIES                             │
│  [penicillin]                                │
│                                              │
│  CURRENT MEDICATIONS                         │
│  [paracetamol 500mg BD]                      │
│                                              │
│  RELEVANT HISTORY                            │
│  [asthma (childhood)]                        │
│                                              │
│  Intake captured 10:47 AM                    │
└──────────────────────────────────────────────┘
```

### State matrix

| Agent state | `fields` | `done` | UI rendering |
|---|---|---|---|
| Intake not yet started | `{}` | `false` | "No pre-visit intake completed" |
| Intake in progress, 0 slots filled | `{}` or all-null | `false` | "Pre-visit intake in progress. Summary will appear when captured." |
| Intake in progress, some slots filled | partial | `false` | Show what's captured, hide empty sections |
| Intake complete | complete (null for unknown slots) | `true` | Full summary as wireframed |
| Visit finalized | frozen snapshot | `true` | Same as complete, with "(captured at intake)" timestamp label |

Empty-section rule: if a slot is `null`/`[]`, hide that subsection entirely. Exception: if all slots are empty, show "not yet completed" copy.

### Track A acceptance criteria

1. After a patient completes a fresh intake, the doctor's Pre-Visit Report tab renders the structured summary card with at least `chief_complaint` and `symptom_duration` populated. No transcript visible.
2. If the intake is partial, the doctor sees only the slots captured so far, labeled "intake in progress".
3. Agent `/turn-sync` response returns non-empty `fields` — verified by integration test.
4. No change to patient-facing intake UI.
5. Existing `history` transcript is still stored in `pre_visit_structured.history` for audit/PDPA.

---

## 3. Track B — Patient Context wiring

### Neo4j state today (context)

The Neo4j instance is schema-ready (9 constraints + 3 indexes applied on agent startup) but has **no runtime write paths**. No registration, intake, or finalize code writes to the graph. The only data that ever enters the graph comes from `agent/scripts/seed_demo_graph.py`, which must be run manually. Consequences:

- Any live patient's sidebar is empty because no `:Patient` node exists for them.
- Track B therefore needs **both** a read path (agent query route + backend proxy) and a **demo-seed** path so doctors can populate the graph for demo purposes.

Runtime graph writes (on registration / intake confirmation / finalize) are deliberately out of scope — a separate sub-project.

### Agent side

**New route 1 — health check:**
```
GET /agents/patient-context/healthz
→ 200 {"neo4j": "ok"} when graph is reachable
→ 200 {"neo4j": "unavailable"} otherwise (never 500)
```
Also: on agent startup, after `apply_schema()`, run a one-shot `RETURN 1 AS ok` query and log the result. Failure is ERROR-level but non-fatal (agent stays up; read routes degrade gracefully).

**New route 2 — patient context read** — `GET /agents/patient-context/{patient_id}` combines the two existing Neo4j queries:

```python
@router.get("/agents/patient-context/{patient_id}")
async def patient_context(patient_id: UUID) -> JSONResponse:
    ctx, visits = await asyncio.gather(
        get_patient_context(patient_id),
        get_visit_history(patient_id, limit=5),
    )
    return JSONResponse({
        "patient_id": str(patient_id),
        "allergies":   ctx.allergies,
        "conditions":  ctx.conditions,
        "medications": ctx.medications,
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

Error handling:
- Neo4j driver error → 503 via existing `_log_unhandled`.
- Patient not in graph → 200 with all-empty arrays (`get_patient_context` already handles this).

No schema change — both Cypher queries already exist.

### Backend side

New DTO `backend/.../controller/biz/patient/response/PatientContextResponse.java`:

```java
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

Shape matches the frontend's existing `PatientContext` type — drop-in, no frontend changes needed.

Mapping rules (agent → DTO):

- `allergies: ["penicillin", ...]` → `[{id: "penicillin", label: "Penicillin"}, ...]`. `id` = lowercased name.
- `conditions` → `chronicConditions` (name change).
- `medications: ["paracetamol 500mg"]` → `[{id, name: "Paracetamol 500mg", dose: ""}]`. Dose is empty until graph model is enriched — known gap.
- `recent_visits[].primary_diagnosis` → `diagnosis` (fallback to `chief_complaint`, final fallback "—").
- `recent_visits[].visited_at` → `date`.

New `AgentServiceClient.getPatientContext(UUID)` method + new route on `PatientController`:

```java
@GetMapping("/patients/{patientId}/context")
public PatientContextResponse getContext(@PathVariable UUID patientId) {
    return patientReadService.getContext(patientId);
}
```

Security already restricts `/patients/**` to DOCTOR role — verify `SecurityConfiguration` needs no change.

Error mapping:

| Agent response | Backend response |
|---|---|
| 200 with empty arrays | 200 (empty arrays) |
| 503 (Neo4j down) | 502 |
| Timeout | 504 |
| Network error | 502 |

### Frontend side

One-line broadening of the error-handler in `PatientContextPanel.tsx:58`:

```ts
if (msg.startsWith("HTTP 404") || msg.startsWith("HTTP 502") || msg.startsWith("HTTP 504")) {
  setState({ kind: "unavailable" });
  return;
}
```

No render-layer changes — DTO shape already matches.

### Demo-seed path (all patients in one shot)

Because no live code path writes to Neo4j, doctors need a dev-mode affordance to populate the graph so the sidebar shows non-empty data during demos.

**Agent route — bulk demo seed:**
```
POST /agents/patient-context/seed-demo-bulk
Body: {"patients": [{"id", "full_name", "dob", "gender"}, ...]}
→ 200 {"seeded": <count>}
```
For each patient in the body:
- `MERGE (p:Patient {id: $id})` + SET demographics
- `MERGE` allergy edges to Penicillin + Peanuts
- `MERGE` condition edge to Type 2 Diabetes
- `MERGE` medication edge to Metformin 500mg
- `MERGE` 2 historic visits with **per-patient IDs**: `v-demo-{id[:8]}-1` (2026-01-05, Cough → J06.9) and `v-demo-{id[:8]}-2` (2026-04-14, Fever → A09). Per-patient IDs prevent collisions on the `visit_id_unique` constraint.

All writes are MERGE-based and idempotent — safe to re-run.

**Backend route — triggers the bulk seed:**
```
POST /patients/context/seed-demo-all
→ 200 {"patientsSeeded": <count>}
→ 403 {"error":"demo seeding disabled"} when flag is off
```
Flag-gated by `cliniflow.dev.seed-demo-enabled=true` (default `false`; only set in `application-dev.yml`, never in the prod profile). Controller:
1. Returns 403 if the flag is off.
2. Reads all rows from the Postgres `patients` table.
3. Marshals them as `{id, full_name, dob, gender}` and sends to the agent in one call.
4. Returns the count.

**`/whoami` response gains a new field:**
```json
{ "userId": "...", "role": "DOCTOR", "devSeedAllowed": true }
```
`devSeedAllowed` = the value of `cliniflow.dev.seed-demo-enabled`. Frontend uses this to decide whether to show the seed button.

**Frontend affordance:**
Inside `PatientContextPanel`, when the fetched state has **all four arrays empty** AND `devSeedAllowed === true`, render a small button labeled "Seed demo graph (all patients)" at the bottom of the panel body. Click → POST to backend → re-fetch current patient's context. Invisible in production (the flag is off, the `/whoami` value is false, the button renders nothing).

### Track B acceptance criteria

1. Doctor opens Pre-Visit tab for a patient with graph-KB data → sidebar populates with real allergies, chronic conditions, active medications, recent 5 visits.
2. Doctor opens tab for a patient with no graph-KB data → sidebar shows 4 blocks, each with their respective "no X on file" empty-state. No "unavailable" banner.
3. Neo4j down → sidebar shows "Context unavailable" ghost banner; rest of page functions normally.
4. All 4 blocks are collapsible (already the case).
5. No changes to the intake conversation path.
6. Integration test: `GET /patients/{id}/context` with stubbed agent returns mapped DTO.
7. **Neo4j health**: `GET /agents/patient-context/healthz` returns `{"neo4j": "ok"}` when reachable, `{"neo4j": "unavailable"}` otherwise. Agent startup logs a non-fatal ERROR if the probe fails.
8. **Demo seeding**: with `cliniflow.dev.seed-demo-enabled=true`, doctor clicks "Seed demo graph (all patients)" in any empty sidebar → bulk seed runs → re-fetch shows the standard bundle for current patient (2 allergies, 1 condition, 1 medication, 2 recent visits). Re-clicking is idempotent.
9. **Production safety**: with the flag off, the button is hidden and `POST /patients/context/seed-demo-all` returns 403. Verified by a controller unit test under the default profile.

---

## 4. Shared Acceptance, Testing, Risks

### End-to-end acceptance

1. Patient starts pre-visit intake → completes 5-7 turns.
2. Backend `pre_visit_structured.fields` is populated with chief complaint, duration, and the three list slots.
3. Doctor opens Visit Detail → Pre-Visit Report tab.
4. Pre-Visit Summary panel renders under 2 seconds, showing all captured slots. No transcript.
5. Patient Context sidebar loads in parallel with real Neo4j data.
6. Doctor sees the entire pre-visit picture without scrolling more than one viewport.

### Testing plan

**Agent:**
- `test_turn_sync_extracts_slots` — unit (mocked LLM), canned 5-turn history produces expected `PreVisitSlots`.
- `test_turn_sync_partial_extraction` — unit, missing slots serialize as `null` / `[]`.
- `test_patient_context_route_happy_path` — integration (Neo4j testcontainer).
- `test_patient_context_route_no_data` — integration, empty patient returns all-empty arrays.

**Backend:**
- `PatientControllerTest.getContext_happy` — MockMvc + stubbed AgentServiceClient.
- `PatientControllerTest.getContext_agent_unavailable` — stub agent 503 → backend 502.
- `PreVisitWriteAppServiceTest.applyTurn_persists_fields` — extended, `result.fields()` non-empty.

**Frontend:**
- `PreVisitSummary.test.tsx` — RTL, populated / empty-section / fully-empty states.
- `PatientContextPanel` existing tests — broadened error handling.

**Manual smoke:** one end-to-end intake via browser (real LLM), verify both panels populate.

### Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Extraction call doubles per-turn latency | High | Medium | Run extraction async after returning the patient's reply; await only before persisting. |
| LLM hallucinates unconfirmed slots | Medium | High | Prompt enforces "only confirmed/stated"; log extraction results; manual sample check post-deploy. |
| Graph missing `:HAD_VISIT` edges for older patients | Medium | Low | Accept for MVP; backfill roadmap. |
| Medications without structured dose | Certain | Low | DTO accommodates future dose; known gap. |
| Pre-existing visits stay at `fields={}` | Certain | Low | Legacy-visit empty-state: "Summary not captured for this legacy visit" if `history.length>0 && fields=={}`. |
| Dev forgets to turn off `cliniflow.dev.seed-demo-enabled` in prod | Low | Medium | Flag defaults to `false`; prod profile never overrides. Unit test asserts controller 403s under default profile. |
| Bulk seed overwrites real patient data | None | n/a | All seed writes are MERGE-based — does not delete existing edges. Re-seeding a patient already in the graph adds no duplicates. |

---

## 5. Rollout

### Merge order

1. **Agent** — extraction + new `/agents/patient-context/{id}` route.
2. **Backend** — new `GET /patients/{id}/context` + DTO + mapping.
3. **Frontend** — new `PreVisitSummary`, remove transcript rendering, broaden panel error-handler.

Each independently deployable. No feature flag required.

### Data migrations

None.

### Backout

Each of the three merges can be reverted independently. No coordinated rollback needed.

### Out of scope / future considerations

- Adding slots to `PreVisitSlots` (associated_symptoms, red_flags, aggravating/relieving, recent_exposure).
- **Real runtime graph writes** (on patient registration / pre-visit confirmation / visit finalize). This spec only provides a dev-mode bulk seed. Populating the graph via live flows is a separate sub-project and will likely touch the Graphify pattern described in `docs/details/agent-design.md`.
- Graph draft-visit ingestion → draft chip on recent visits.
- Clickable recent-visits rows.
- Caching patient context.
- Medication dose through graph model.
- Per-patient tailored seed data (today the demo bundle is identical for every patient — fine for demo, but a real clinical demo would want varied data).

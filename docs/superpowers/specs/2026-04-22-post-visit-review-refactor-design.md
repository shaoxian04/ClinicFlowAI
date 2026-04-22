# Post-Visit Review Refactor — Design Spec

**Date**: 2026-04-22
**Status**: Draft — awaiting user approval
**Scope**: doctor-facing post-transcript workflow (generate → clarify → review → approve → publish)

---

## 1. Goal

Replace the current three-step Capture → Draft → Publish flow with a single-step "Generate report" action plus a side-by-side review pane (report panel + chat panel). Wire the frontend to the agent capabilities that already exist but aren't exposed (`/agents/report/generate|clarify|edit|finalize`). Keep the bilingual patient-portal summary.

## 2. Why now

- The current UI hits a flat `/soap/generate` shortcut and can't surface clarification questions, reasoning, or chat-driven edits — all of which the agent already produces.
- The `Post-Visit Preview` tab's `/post-visit/:id/draft` endpoint 404s; users see a "backend pending" stub instead of a real preview.
- The Medications card is disconnected from the report. Doctors maintain meds twice (once in transcript, once in form).
- Post-mortem (`docs/post-mortem/2026-04-22-soap-generate-and-finalize-e2e.md`) documents how cross-layer contract mismatches repeatedly produced opaque 502s.

## 3. Architecture

```
┌─ Next.js Visit Detail Page ─────────────────────────────────────────┐
│  Tabs: Pre-Visit Report | Consultation | Report Preview (renamed)   │
│                                                                     │
│  Consultation tab layout:                                           │
│    GenerateBar (transcript + "Generate report")                     │
│    After first generate:                                            │
│      ┌ ReportPanel (60%) ──┐  ┌ ReportChatPanel (40%) ────────┐     │
│      │ SOAP + medications   │  │ chat thread + input          │     │
│      │ [Approve & continue] │  │                              │     │
│      └──────────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
         │ sync JSON, no SSE in frontend (Approach Y)
┌─ Spring Boot Backend ───────────────────────────────────────────────┐
│  ReportController (new sync endpoints):                             │
│    POST /api/visits/{id}/report/generate-sync                       │
│    POST /api/visits/{id}/report/clarify-sync                        │
│    POST /api/visits/{id}/report/edit-sync                           │
│    POST /api/visits/{id}/report/approve                             │
│    PATCH /api/visits/{id}/report/draft                              │
│    GET  /api/visits/{id}/report/chat                                │
│    POST /api/visits/{id}/report/finalize                            │
│  ReportAggregatorService: consumes agent SSE, returns JSON          │
└─────────────────────────────────────────────────────────────────────┘
         │ agent keeps SSE; backend aggregates
┌─ Python Agent (unchanged except +GET /chat, +current_draft on edit) ┐
│  POST /agents/report/generate (SSE)                                 │
│  POST /agents/report/clarify  (SSE)                                 │
│  POST /agents/report/edit     (SSE)  — accepts current_draft        │
│  POST /agents/report/finalize (JSON)                                │
│  GET  /agents/report/chat     (JSON) — NEW                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Key decisions

1. **Sync JSON at the frontend boundary** (Approach Y). Frontend never parses SSE. Backend aggregates events from the agent's existing SSE routes into a single JSON response.
2. **Chat history in `agent_turns`** is the source of truth. Frontend pulls via `GET /report/chat` after every action; no live SSE in the browser.
3. **Medications inline inside the report panel** as structured form rows. Form edits go through `PATCH /report/draft` (fast, silent, no LLM). Chat edits go through `/edit-sync` (LLM-mediated).
4. **Two-step approval**:
   - "Approve & continue" in report panel → navigates to Report Preview tab; sets `preview_approved_at`.
   - "Publish to patient" in Report Preview tab → actual finalize + portal publish.
5. **Clear writer ownership by table**:
   - Agent writes: `agent_turns`, `visits.report_draft`, `visits.report_confidence_flags`
   - Backend writes: `medical_reports`, `audit_log`, `visits.status`, `visits.finalized_at`
   - Nothing is shared-writer. Finalize is the only place these two domains meet, and it meets at the **backend's** atomic transaction (agent returns data; backend persists).

## 4. Contracts (frontend ↔ backend ↔ agent)

Full detail is normative — every endpoint below must be implemented with the exact field names shown. The class of bug this refactor is preventing (`snake_case` vs `camelCase` drift, path skew, SSE-vs-JSON shape mismatch) requires contracts to be audited at PR time.

### 4.1 Convention

| Layer | Keys | Envelope | Errors |
|---|---|---|---|
| Frontend ↔ Backend | camelCase | `WebResult<T> = { code, message, data }` | non-zero `code` |
| Backend ↔ Agent | snake_case | raw JSON | HTTP 4xx/5xx; backend wraps as `UpstreamException` → 502 |

Every Java DTO facing the agent declares `@JsonProperty("snake_case")` on every field.

### 4.2 Frontend-facing endpoints

#### `POST /api/visits/{visitId}/report/generate-sync`
Request: `{ transcript: string, specialty: string | null }`
Response `data`: `{ status: "complete" | "clarification_pending" | "error", report: MedicalReport | null, clarification: { field, prompt, context } | null }`

#### `POST /api/visits/{visitId}/report/clarify-sync`
Request: `{ answer: string }`
Response `data`: same shape as `/generate-sync`.

#### `POST /api/visits/{visitId}/report/edit-sync`
Request: `{ instruction: string }`
Response `data`: same shape as `/generate-sync`.

#### `PATCH /api/visits/{visitId}/report/draft`
Request: `{ path: string, value: any }` (JSON path dotted; arrays indexed like `plan.medications[0].dose`)
Response `data`: `{ report: MedicalReport }`
No agent call; silent edit. Does **not** append to `agent_turns`.

#### `GET /api/visits/{visitId}/report/chat`
Response `data`: `{ turns: [{ turnIndex, role, content, toolCallName?, createdAt }] }`
Only `role in ("user","assistant")` returned by default. Filtering by role is server-side.

#### `POST /api/visits/{visitId}/report/approve`
Request: no body.
Response `data`: `{ approved: true, approvedAt: ISO-8601 }`
Writes `medical_reports.preview_approved_at = now()`. Does **not** finalize.

#### `POST /api/visits/{visitId}/report/finalize`
Request: no body (visit identity derived from path).
Response `data`: `{ visitId, summaryEn, summaryMs, finalizedAt }`
Gate: returns **409** if `preview_approved_at IS NULL`.

### 4.3 Backend ↔ Agent mapping

| Frontend call | Backend action | Agent endpoint |
|---|---|---|
| `/generate-sync` | aggregate SSE → JSON | `POST /agents/report/generate` |
| `/clarify-sync` | aggregate SSE → JSON | `POST /agents/report/clarify` |
| `/edit-sync` | bootstrap `current_draft` + aggregate SSE → JSON | `POST /agents/report/edit` |
| `/chat` | proxy | `GET /agents/report/chat?visit_id={uuid}` **(new)** |
| `/approve` | local write | — |
| `/draft` (PATCH) | local write to `visits.report_draft` jsonb | — |
| `/finalize` | gate check → agent finalize (validate + summarize only) → backend writes `visits` + `medical_reports` + `audit_log` atomically | `POST /agents/report/finalize` (response: `{ report, summary_en, summary_ms }` — no longer writes `visits.status`) |

### 4.4 SSE-to-JSON aggregator rules (in `ReportAggregatorService`)

```
event                              aggregate effect
──────────────────────────────     ──────────────────────────────────────
turn.start                         no-op
reasoning.delta                    no-op (not surfaced to frontend)
message.delta                      no-op (chat reads from GET /chat)
tool.call {update_soap_draft}      parse args.report → latest draft
tool.call {ask_doctor_clarification}
                                   capture args → pending_clarification
tool.result                        no-op
clarification.needed               status = clarification_pending
turn.complete                      status = complete (if no clarification)
agent.error                        throw UpstreamException (→ 502)
```

On stream close, return `{ status, report, clarification }` using last-seen values.
If `/edit` completes with no `update_soap_draft`, backend falls back to the pre-edit `visits.report_draft` so UI never goes blank.

### 4.5 Agent: new `GET /agents/report/chat`

```
GET /agents/report/chat?visit_id={uuid}&agent_type=report&roles=user,assistant
```
Response:
```json
{ "turns": [{ "turn_index": 0, "role": "user", "content": "...", "tool_call_name": null, "created_at": "..." }] }
```
Thin wrapper over `AgentTurnRepository.load()`. Filter by roles optional; default `user,assistant`.

### 4.6 Agent: `POST /agents/report/edit` body extension

Add optional `current_draft` field (MedicalReport jsonb). When present, agent prepends a system message `"Current draft state:\n<json>"` before building the conversation. Guarantees doctor's silent form-row edits are visible to the LLM on next chat-edit (D1a).

### 4.7 MedicalReport DTO — single source

Python `agent/app/schemas/report.py` is the canonical definition. Java mirror in `backend/.../dto/MedicalReportDto.java` (new) with `@JsonProperty` for every snake_case field. TypeScript mirror in `frontend/lib/types/report.ts`. All three kept in sync manually; contract tests (§7) verify.

### 4.8 Contract-verification checklist

For each of the 7 frontend-facing endpoints, a PR reviewer must tick:
1. Path matches exactly (hyphen, plural, trailing slash).
2. Request JSON keys match the Java record / agent Pydantic model.
3. Response `data` keys match frontend TypeScript type.
4. Backend→agent mapping has `@JsonProperty("snake_case")` on every field.
5. At least one contract test hits the real endpoint through all three layers.

## 5. Data model

### 5.1 Ownership

| Data | Storage | Writer | Readers |
|---|---|---|---|
| Chat history | `agent_turns` (append-only, PDPA trigger) | Agent | Backend via `GET /chat` |
| Live draft | `visits.report_draft`, `visits.report_confidence_flags` (jsonb) | Agent via `update_soap_draft`; Backend on form-row `PATCH` | Agent (bootstrap), Backend (projection) |
| Finalized SOAP | `medical_reports` (flat text cols) | Backend on `/finalize` | Backend, portal, audit |
| Bilingual summary | `medical_reports.summary_en`, `summary_ms` (new) | Backend on `/finalize` | Portal |
| Preview-approved | `medical_reports.preview_approved_at` (new) | Backend on `/approve` | `/finalize` gate |
| Visit lifecycle | `visits.status`, `visits.finalized_at` | Backend (sole writer after this refactor) | All |

### 5.2 Migration — V8

```sql
ALTER TABLE medical_reports
  ADD COLUMN IF NOT EXISTS preview_approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS summary_en TEXT NULL,
  ADD COLUMN IF NOT EXISTS summary_ms TEXT NULL;
```

Additive, safe for existing rows (NULL defaults). No new indexes (visit_id already indexed).

### 5.3 State transitions

```
visits.status: SCHEDULED → IN_PROGRESS → FINALIZED

IN_PROGRESS:
  ├─ [Generate report]  agent writes visits.report_draft + agent_turns
  ├─ [Chat edit]        agent updates visits.report_draft + agent_turns
  ├─ [Form-row edit]    backend PATCHes visits.report_draft (no chat entry)
  ├─ [Approve]          backend sets medical_reports.preview_approved_at; navigate
  └─ [Publish]          gate: preview_approved_at NOT NULL
                        agent /finalize → validates draft, generates summary,
                          returns { report, summary_en, summary_ms }
                          (agent does NOT flip visits.status — atomicity req.)
                        backend atomic txn:
                          UPDATE visits SET status='FINALIZED', finalized_at=now()
                          UPDATE medical_reports (flat SOAP + summary + finalized flags)
                          INSERT audit_log
```

### 5.4 Concurrency

Single-doctor, single-visit assumption. No optimistic locking; last-write-wins on `visits.report_draft`. Documented limitation, post-MVP.

### 5.5 Atomicity guarantees

`/finalize` runs as a single Spring `@Transactional`: `visits` UPDATE + `medical_reports` UPDATE + `audit_log` INSERT commit together or not at all. The agent's `/finalize` **must be modified** to no longer write `visits.status` — it returns `{ report, summary_en, summary_ms }` only, and backend owns the entire finalization write. If the audit trigger/insert fails, the whole publish rolls back (PDPA correctness > publish reliability). Integration test enforces.

**Agent-side code change required**: remove the `UPDATE visits SET status='FINALIZED', finalized_at=now()` from `agent/app/routes/report.py:/finalize`. The agent only validates the draft and generates the bilingual summary.

## 6. Frontend components

### 6.1 New files

- `components/review/GenerateBar.tsx` — transcript input (Record/Upload/Type sub-tabs absorbed from ConsultationCapture) + "Generate report" button. Collapses to a summary row after first successful generate.
- `components/review/SplitReview.tsx` — two-pane layout. Owns `ReviewState`. Fetches chat on mount; refreshes after each agent action.
- `components/review/ReportPanel.tsx` — renders MedicalReport. Textareas for S/O/A/P. Structured form rows for `plan.medications[]`. Header with title + "Approve & continue →" button. Inline `PATCH` on field blur (no debounce).
- `components/review/ReportChatPanel.tsx` — chat thread + input. Submits to `/edit-sync` or `/clarify-sync` based on `clarification != null`. Optimistic user-turn render; reconcile from `GET /chat` after response.
- `components/review/PhasedSpinner.tsx` — timer-driven progress text during the 15–30s generate wait ("Reading transcript" → "Drafting report" → "Checking interactions"). Pure presentation.
- `lib/types/report.ts` — TypeScript `MedicalReport` mirror of Pydantic schema.
- `lib/reviewReducer.ts` — pure state reducer (testable independently).

### 6.2 Renames

- `components/PostVisitPreview.tsx` → `components/ReportPreview.tsx` (export + imports updated)
- Tab label "Post-Visit Preview" → "Report Preview"
- Tab id `"post"` → `"preview"`
- Frontend state var `postVisitPanel` → `reportPreviewPanel`

Backend endpoint paths (`/api/postvisit/...`) stay as-is — user-invisible.

### 6.3 Deletions

- `components/ConsultationCapture.tsx` — absorbed into `GenerateBar`.
- `components/MedsCard.tsx` (if exists) — absorbed into `ReportPanel`.
- Sticky `FinalizeBar` footer — replaced by header button in `ReportPanel` + Publish button in `ReportPreview`.
- Current "Generate SOAP draft" button on transcript card — replaced by `GenerateBar`'s "Generate report".
- `onGeneratePreview` function hitting `/post-visit/:id/draft` — deleted; Report Preview now derives summary from `medical_reports` via `GET /patient/visits/{id}` (for portal) or a new backend endpoint.

### 6.4 ReviewState

```ts
type ReviewState = {
  report: MedicalReport | null;
  chat: ChatTurn[];
  approved: boolean;
  generating: boolean;
  editing: boolean;
  patching: Set<string>;           // field paths currently saving
  clarification: { field: string; prompt: string; context: string } | null;
  error: string | null;
};
```

Owned by `SplitReview`, never hoisted to global state.

### 6.5 Error surfaces

| Scope | Where | Behavior |
|---|---|---|
| Report-level (generate/edit/patch) | banner inside `ReportPanel` | non-blocking; retry |
| Chat-level (clarify) | inline below failed user message | input stays enabled |
| Gate (finalize 409) | page-level banner | navigate back to Consultation tab |
| Upstream 502 | generic "Assistant unavailable" banner | retry last action |

### 6.6 Accessibility

- `aria-busy` on Generate report button during generate
- `aria-live="polite"` region for PhasedSpinner so screen readers get phase updates
- Chat input: Enter sends, Shift+Enter newline
- Tab order: report top-to-bottom, then chat
- All form-row saving indicators use visible text, not color-only

## 7. Testing

### 7.1 Agent (pytest)

1. `ReportAgent` emits `update_soap_draft` on complete transcript (FakeLLM).
2. `ReportAgent` raises `ClarificationRequested` on missing required field (FakeLLM).
3. `/agents/report/edit` with `current_draft` prepends system context (integration).
4. `GET /agents/report/chat` returns turns filtered by role (integration, testcontainers).
5. `AgentTurnRepository.append` recovers from unique-key collision via retry (already implemented; add test).
6. `BaseAgent._load_openai_messages` skips malformed groups (already implemented; add test).

### 7.2 Backend (JUnit + WireMock + Testcontainers)

1. `ReportAggregatorService` reduces SSE events — one test per event type.
2. `ReportAggregatorService` throws `UpstreamException` on `agent.error`.
3. `ReportAggregatorService` falls back to pre-edit draft when `/edit` completes without `update_soap_draft`.
4. `ReportController /generate-sync` happy path (WireMock agent + real JPA).
5. `ReportController /approve` writes `preview_approved_at`.
6. `ReportController /finalize` returns 409 without approve; succeeds with approve.
7. **`FinalizeAtomicityTest`** — with a deliberately broken `audit_log` trigger, finalize rolls back and leaves `visits.status = IN_PROGRESS`. Asserts zero leakage.
8. `PATCH /report/draft` updates jsonb at arbitrary path.

### 7.3 Frontend

1. `SplitReview` renders report on `status=complete`.
2. `SplitReview` shows clarification UI on `status=clarification_pending`.
3. `ReportChatPanel` optimistic user turn before response, reconciles after.
4. `ReportPanel` form-row keeps typed value on patch failure (shows error badge).
5. `GenerateBar` collapses after first generate.
6. `reviewReducer` — transition tests per action.

If no test runner exists in `frontend/` today, skip this layer and rely on §7.5 E2E.

### 7.4 Contract tests (mandatory)

One per frontend endpoint, real HTTP through all three layers:

- `test_generate_sync_contract`
- `test_clarify_sync_contract`
- `test_edit_sync_contract`
- `test_chat_contract`
- `test_draft_patch_contract`
- `test_approve_contract`
- `test_finalize_contract`

Each asserts JSON keys match the Java records AND the Pydantic models exactly. Failing any contract test blocks merge.

Location: `backend/src/test/java/my/cliniflow/contract/`. CI runs with docker-compose-provided agent.

### 7.5 E2E (Playwright)

1. `test_e2e_happy_path` — login → visit → transcript → generate → approve → publish → portal shows summary.
2. `test_e2e_clarification` — transcript missing chief complaint → generate → clarification in chat → answer → complete → approve → publish.

Real Playwright event dispatch (not the MCP React-props workaround from post-mortem §8).

### 7.6 Out of scope

- LLM output quality (separate eval project)
- Z.AI GLM provider swap
- Admin/staff/graph-KB panels
- Mobile layouts

### 7.7 CI gates (order)

1. `pytest` (agent)
2. `./mvnw test` (backend, incl. integration + contract)
3. `npm run lint && npm run typecheck` (frontend)
4. `playwright test` (2 E2E)

## 8. Open questions / decisions deferred

- **Regenerate confirmation**: currently full-replacement, no confirm dialog (user chose). Revisit if doctors complain about lost edits.
- **Patch debounce**: blur-only for now (user chose). Revisit if typing feels laggy.
- **SSE in frontend**: not done here. Could be added later for a reasoning-visibility enhancement, but Approach Y stays the default.
- **Multi-tab concurrency**: not addressed. Document as known limitation.
- **Structured medication data (drug_name dictionary)**: meds form rows validate minimally (non-empty). Full drug-dictionary integration is out of scope.

## 9. Rollout

Single branch: `day3-postvisit-refactor` (or continue on current `day3-postvisit-portal`). No feature flag — the refactor replaces the old flow wholesale because half of it (`/post-visit/draft`) is already broken.

### Agent-side code deltas (non-contract changes)
- Remove `UPDATE visits SET status='FINALIZED', finalized_at=now()` from `agent/app/routes/report.py`'s `/finalize` handler. Agent only returns `{ report, summary_en, summary_ms }`; backend persists everything else.
- Add `GET /agents/report/chat` route handler.
- Add optional `current_draft` parameter to `POST /agents/report/edit` request model and prompt-assembly logic.

### Backend-side new code
- `ReportAggregatorService` (SSE consumer → JSON reducer).
- `ReportController` new endpoints per §4.2.
- Migration V8 (three columns on `medical_reports`).
- `MedicalReportDto` Java mirror of agent Pydantic schema.
- Atomic finalize transaction in `ReportWriteAppService` (new or extended).

### Frontend-side
- Per §6 — four new review components, one new reducer, one renamed preview component, three deletions.

Manual smoke after merge: docker-compose up, exercise the full happy path and the clarification path.

---

## Appendix A — Request/response examples

### Generate happy path

Request (FE → BE):
```http
POST /api/visits/b01f7c92-.../report/generate-sync
{ "transcript": "patient is coughing for 3 days, dry...", "specialty": "general" }
```

Response (BE → FE):
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "complete",
    "report": {
      "subjective": { "chief_complaint": "Dry cough x 3 days", ... },
      "objective": { ... },
      "assessment": { "primary_diagnosis": "Acute bronchitis", ... },
      "plan": { "medications": [...], "follow_up": { "needed": true, "timeframe": "1 week" } },
      "confidence_flags": { "subjective.chief_complaint": "extracted", ... }
    },
    "clarification": null
  }
}
```

### Generate with clarification

Same request, different response:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "clarification_pending",
    "report": null,
    "clarification": {
      "field": "subjective.chief_complaint",
      "prompt": "The transcript doesn't state a chief complaint clearly. What should it be?",
      "context": "Transcript mentions cough but no duration or quality."
    }
  }
}
```

### Form-row patch

```http
PATCH /api/visits/.../report/draft
{ "path": "plan.medications[0].dose", "value": "250mg" }
```

Response:
```json
{ "code": 0, "message": "ok", "data": { "report": { ...updated... } } }
```

### Finalize

```http
POST /api/visits/.../report/finalize
```

If not approved:
```json
{ "code": 4091, "message": "Preview must be approved before finalizing." }
```
(HTTP 409)

If approved:
```json
{
  "code": 0, "message": "ok",
  "data": {
    "visitId": "b01f7c92-...",
    "summaryEn": "You were seen today for a dry cough...",
    "summaryMs": "Anda telah diperiksa hari ini kerana batuk kering...",
    "finalizedAt": "2026-04-22T16:30:00+08:00"
  }
}
```

---

## Appendix B — Non-negotiable invariants (inherited from CLAUDE.md + post-mortem)

1. **Doctor-in-the-loop**: no AI-generated clinical content is published without explicit doctor approval via the two-step gate (approve → publish).
2. **PDPA audit-log is append-only**: every `/finalize` produces exactly one `audit_log` row; transaction rollback on insert failure.
3. **Frontend talks to Spring Boot only**: Next.js never calls the agent directly.
4. **Hermes rules are style-only**: no rule can alter diagnosis/treatment/dosing. (Not touched in this refactor; carrying forward.)
5. **Boundary logging**: every new endpoint logs `[AGENT]` / `[UPSTREAM]` / `[BIZ]` tags with status + body on 4xx/5xx, per post-mortem §Meta.

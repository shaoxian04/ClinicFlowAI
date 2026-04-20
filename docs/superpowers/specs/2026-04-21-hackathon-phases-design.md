# CliniFlow AI — 7-Day Hackathon Phase Plan

**Date:** 2026-04-21
**Owner:** solo builder
**Deadline:** 7 days from kickoff
**Deliverables:** pre-recorded demo video (5–7 min) + written submission + public repo
**Judging surface:** mixed AI / Healthcare / Product tracks

---

## 1. Goals & non-goals

### Goals

- Demonstrate the **full patient journey** end-to-end on happy-path data: Pre-Visit → Visit → Post-Visit.
- Showcase **two differentiators** that separate CliniFlow from a generic "AI SOAP notes" demo:
  - **Graphify** — Neo4j-backed patient knowledge graph with visualization and one graph-tool injected into the Visit agent.
  - **Hermes** — doctor-edit feedback loop that learns *documentation style only* (never clinical reasoning) and applies learned rules to the next SOAP draft.
- Ship a **doctor-in-the-loop** review UX that visibly distinguishes AI draft from doctor-confirmed output.
- Respect the **hard safety invariants** from `CLAUDE.md`: audit-log append-only, frontend → backend only, Hermes style-scoped.

### Non-goals

- Production-grade depth. Every feature is demo-grade: hardcoded seeds, happy-path only, skipped edge cases.
- **Admin dashboard** (feature "I" from the original feature list) — dropped.
- Real deployment on managed cloud. Everything runs on `docker compose up` locally, then screen-recorded.
- Any attempt at clinical accuracy evaluation, medical-grade STT, or real patient data. Fake data throughout.
- Production multi-tenancy, SSO, password reset flows, email verification.

---

## 2. Scope contract (important)

This plan intentionally picks **all remaining PRD features** (pre-visit chatbot, visit capture, SOAP generation + doctor review, post-visit summary, patient portal, Graphify, Hermes, RBAC + audit) and accepts **shallow/demo-grade depth** as the trade-off. Each feature gets 30–60 seconds of airtime in the demo video. If anything slips, the cut order (first to drop) is:

1. Patient portal polish
2. Post-visit summary AI generation (fall back to template-fill)
3. Hermes rule application in next draft (keep rule capture, skip injection)

Graphify and doctor-review-of-SOAP are **never** cut — those are the demo's load-bearing moments.

---

## 3. Architecture reuse

This plan assumes the skeleton already scaffolded:

- `frontend/` — Next.js 14 App Router + TypeScript strict
- `backend/` — Spring Boot 3.3.4 + Java 21 + Maven, DDD package tree for 4 aggregates (`visit`, `patient`, `user`, `adaptiverule`), controllers grouped by route (`previsit`, `visit`, `postvisit`, `patient`, `auth`)
- `agent/` — FastAPI + LangGraph + Python 3.12, `/agents/{pre-visit,visit,post-visit,rules}` routers
- Postgres (Supabase) via Flyway `V1__init.sql`; Neo4j 5.20 via `agent/app/graph/schema.py::apply_schema`
- Docker Compose with Nginx reverse proxy
- LLM via **OpenAI-compatible** endpoint (`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`). Swap to Z.AI GLM by changing those three env vars.

No structural changes to the skeleton. This plan is pure feature work.

---

## 4. Day-by-day plan

### Day 1 — Auth + Pre-Visit chatbot (feature A, partial B)

**Backend:**
- `UserModel` + `UserRepository` + JWT login endpoint (`POST /api/auth/login`) returning access token with `role` claim.
- `PreVisitReportModel` child of `VisitModel` aggregate; `PreVisitWriteAppService.submit(...)` persists structured intake.
- `POST /api/previsit/sessions` → calls agent `POST /agents/pre-visit/turn` with conversation state.

**Agent:**
- LangGraph state machine with 5–7 canned questions (chief complaint, duration, severity, pain scale, red-flag screen, allergies, medication list). Each node: LLM extracts structured field from user reply, advances state.
- Returns `{ next_question, structured_so_far, done }`. When done, emits a `PreVisitReport` payload.

**Frontend:**
- `/login` page.
- `/previsit/new` page — simple chat bubble UI, POSTs each turn, displays structured summary at the end.

**Exit criteria:** Patient logs in, completes a chat, sees the structured intake. Row lands in `pre_visit_reports` and is linked to a new `visits` row.

---

### Day 2 — Visit capture + SOAP generation (feature B core, C, doctor review)

**Backend:**
- `POST /api/visits/{id}/transcript` accepts pasted text (skip audio STT for hackathon; mention it in the video as a future hook).
- `VisitWriteAppService.generateSoap(visitId)` → calls agent `POST /agents/visit/soap` with transcript + pre-visit report + (Day 4) retrieved graph context.
- Response persisted to `medical_reports` with `is_finalized=false`, `ai_draft_hash=SHA256(soap_json)`.

**Agent:**
- Single LLM call, prompt composes: pre-visit report + transcript + system instructions demanding SOAP JSON shape `{ subjective, objective, assessment, plan }`.

**Frontend:**
- `/visits/[id]/capture` — big textarea for transcript + "Generate SOAP" button → loading state → SOAP editor.
- `/visits/[id]/review` — 4-section editable form (S/O/A/P), "AI draft" badge, "Confirm & finalize" button → `PATCH /api/visits/{id}/finalize` flips `is_finalized=true`, sets `finalized_by` + `finalized_at`.
- Visual rule: unfinalized = amber left-border + "AI DRAFT" pill; finalized = green border + "✓ Confirmed by Dr. X" pill. Never both visible simultaneously.

**Exit criteria:** Doctor pastes transcript, gets SOAP draft, edits freely, clicks finalize. Audit row written (stub aspect if Day 5 not done yet — we'll wire the aspect on Day 5).

---

### Day 3 — Post-visit summary + patient portal (feature D, E)

**Backend:**
- `PostVisitSummaryModel` child of `VisitModel`. `POST /api/postvisit/{visitId}/generate` calls agent `POST /agents/post-visit/summarize` with finalized SOAP.
- `MedicationModel` child — doctor can add 0–3 medications on the review screen; these flow into the summary.
- `GET /api/patient/visits` returns the current patient's visits (post-visit summary + meds only, never raw SOAP).

**Agent:**
- One LLM call: "Rewrite this SOAP for a layperson at a Primary-6 reading level in English and Malay. Output `{ en: string, ms: string, medications: [{ name, dose, instructions }] }`."

**Frontend:**
- Doctor's review screen gains a "Finalize & notify patient" button (wraps finalize + summary generation).
- `/portal` — patient landing page listing their visits; click one → renders the summary with language toggle.

**Exit criteria:** End-to-end flow works for one visit: patient intake → doctor SOAP → patient sees friendly summary in their portal. Three screens, three roles, one DB.

---

### Day 4 — Graphify + Hermes (features F, G, H)

#### Graphify (the wow moment)

**Agent:**
- After SOAP finalization, backend fires `POST /agents/graphify/ingest` with the finalized SOAP + patient_id + visit_id.
- Agent does **one-pass LLM entity extraction** into `{ symptoms, diagnoses, medications, allergies, conditions }`. Confidence is faked: `1.0` if the term appeared verbatim in the transcript, else `0.7`.
- MERGE into Neo4j: `(:Patient {id})-[:HAS_VISIT]->(:Visit {id})-[:HAS_SYMPTOM|HAS_DIAGNOSIS|PRESCRIBED|...]->(entity)`, each edge carrying `confidence` + `visit_id`.
- New graph tool `get_patient_history(patient_id)` returns top-10 entities by recency. Injected into the Visit-agent SOAP prompt starting on the **second** visit for that patient.

**Frontend:**
- `/visits/[id]/graph` — React Flow visualization. Nodes colored by label (symptom = blue, diagnosis = red, medication = green). Edge opacity ∝ confidence. Click a node → right-side drawer shows source visit.
- Fallback plan: if React Flow rendering eats too much time, screen-record **Neo4j Bloom** against the live DB for the video segment.

#### Hermes (the safety moment)

**Backend:**
- On `PATCH /api/visits/{id}/finalize`, compute a diff between the stored `ai_draft_hash` snapshot and the finalized SOAP. Identify the single section with the most edits (by char-level Levenshtein).
- Fire `POST /agents/rules/feedback` with `{ section, original, final, doctor_id }`.

**Agent:**
- LLM with **strict style-only prompt**: "Output a rule about formatting, tone, abbreviation, or structure ONLY. If the edit changes clinical content (diagnosis, medication, dosage, contraindication, red-flag threshold), return `null`." Parse LLM output; if `null` or content contains any clinical keyword (dose, mg, diagnosis, …), discard.
- Persist as `(:AdaptiveRule { text, doctor_id, created_at })` in Neo4j.
- On next SOAP generation, `get_rules_for_doctor(doctor_id)` pulls up to 5 rules and appends them to the system prompt as "Writing style preferences:".

**Demo moment:** Show a clinical edit returning `null` (the agent rejected it). This is the safety story for the judges.

**Exit criteria:** Two adaptive rules live in Neo4j; second visit for the seeded patient uses both the rules and the graph tool.

---

### Day 5 — RBAC + polish (feature J)

- **3 roles** seeded: `DOCTOR`, `PATIENT`, `STAFF`. Enum in `user` aggregate; JWT carries `role` claim; Spring Security `@PreAuthorize("hasRole('DOCTOR')")` on write endpoints that modify clinical data.
- **Audit-log aspect**: `@Aspect` around every `@PostMapping`/`@PutMapping`/`@PatchMapping`/`@DeleteMapping` in `controller/biz/**`. Inserts `(user_id, action, resource, correlation_id, at)` into `audit_log`. The DB-level trigger enforces append-only — the aspect just writes.
- **Polish pass** on the 4 demo screens: loading states, empty states, Tailwind spacing, and the AI-draft-vs-confirmed visual rule enforced everywhere. No new features.
- **Seed script**: `V2__seed_demo.sql` (doctor + patient + 3 past finalized visits) plus `agent/scripts/seed_graph.py` (Neo4j entities for the 3 visits + 2 adaptive rules). Idempotent on re-run.

**Exit criteria:** Login as each role, see role-gated UI; every demo action writes an audit row; seed produces a populated KG ready for the graph screenshot.

---

### Day 6 — Video + pitch

**Recording (OBS, 1080p):**
- 30s problem framing
- 60s architecture diagram walkthrough (reuse SAD diagram)
- 60s pre-visit chat
- 90s visit capture → SOAP → doctor review → finalize
- 60s Graphify screen (React Flow or Neo4j Bloom)
- 60s Hermes demo: show diff → rule persisted → next draft picks it up → show clinical edit returning `null`
- 30s safety invariants recap (doctor-in-loop, style-only learning, append-only audit)
- 30s close & repo link

Record 2–3 takes per segment; cut in DaVinci Resolve Free. Hardcode happy-path inputs.

**Written submission:**
- README.md pitch section + architecture diagram + repo link + link to SAD in Notion.

### Day 7 — Buffer

Pure slack. Fix whatever broke on Day 6. If nothing broke, enrich seed data (third adaptive rule, one more visit). **Do not start new features.**

---

## 5. Hard safety invariants (never compromise)

Pulled verbatim from `CLAUDE.md`, restated here because they gate feature acceptance:

- **Doctor-in-the-loop:** every AI-generated clinical note passes an explicit doctor review-and-confirm before finalization. UI visibly distinguishes AI draft from human-confirmed.
- **Hermes adaptive rules are scoped to documentation style only — never clinical reasoning.** No learned rule may alter diagnosis, treatment, dosing, contraindications, or red-flag thresholds. Enforced by prompt + keyword-filter + demo of a rejected clinical edit.
- **PDPA audit log** is append-only. DB trigger rejects UPDATE/DELETE; application code only ever INSERTs.
- **Frontend talks to Spring Boot only.** Next.js never calls the Python agent or Neo4j directly, and never uses the Supabase JS client for clinical data.

A day's exit criteria is not met if any of these is violated.

---

## 6. Risk register & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| React Flow styling eats a full day | medium | Time-box to 2h; fall back to Neo4j Bloom for video-only |
| LLM hallucinates clinical content in Hermes rule | low | Prompt + keyword filter + discard on any clinical term; demo a rejection on camera |
| Supabase DDL access issues | low | Flyway already on direct port 5432, not pooler |
| Demo breaks live during recording | medium | Seed script is idempotent; re-run between takes |
| Scope creep on Day 2 (SOAP editor polish) | high | Hard stop — editor just needs 4 textareas + finalize button on Day 2; polish lands Day 5 |
| STT integration tempts "just one more thing" | medium | Explicitly out-of-scope; paste text only. Mention STT as a future hook in the video. |

---

## 7. Exit criteria for the whole plan

By end of Day 7, the following must be true:

- `docker compose up --build` boots all 5 services clean on a fresh clone.
- Seed script produces a demoable patient with history, rules, and graph.
- The 5–7 minute video exists as an MP4 and has been watched end-to-end for errors.
- README pitch section exists with repo link and SAD link.
- No hard safety invariant is violated in the demo flow.

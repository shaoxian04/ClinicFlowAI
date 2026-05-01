# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Keep it short — it's an **index**, not documentation. Put depth in `docs/details/` and link to it.

## Project: CliniFlow AI

AI-powered clinical workflow platform for **SME clinics in Malaysia**. Covers three phases of the patient journey:

1. **Pre-Visit** — AI symptom-intake chatbot → structured report for the doctor
2. **Visit** — Text/voice consultation capture → AI-generated SOAP notes → doctor reviews/edits before finalizing
3. **Post-Visit** — Patient-friendly summary + medication instructions + patient portal

Four roles with RBAC: **Patient**, **Doctor**, **Clinic Staff/Receptionist**, **Clinic Admin/Owner**.

## Repository status

**MVP flows implemented; ongoing hardening.** `frontend/` (Next.js 14), `backend/` (Spring Boot 3.3 / Java 21 / Maven), `agent/` (FastAPI + LangGraph), `deploy/nginx/`. Registration, pre-visit intake, SOAP generation + doctor review, post-visit summary, patient portal, admin user management, audit log, and the Neo4j projection drainer are wired end-to-end. The DDD package tree for the 4 bounded contexts lives under `backend/src/main/java/my/cliniflow/`.

Design artifacts:
- `Product Requirement Document (PRD) — CliniFlow AI.pdf` — product spec (what to build)
- `Domain 1_AI Systems & Agentic Workflow Automation.pdf` — domain brief
- **System Analysis Documentation (SAD)** — in Notion: https://www.notion.so/3472193af50f8177bf9cef07de040fd7 — authoritative technical design (how to build). Fetch via Notion MCP for specifics.

**Conflict resolution**: SAD wins on technical matters; PRD wins on product scope.

**Default branch**: `master`. Feature branches target `master` for PRs.

## Database setup

- **Postgres (Supabase)** — schema lives in `backend/src/main/resources/db/migration/V1__init.sql`. **Flyway is NOT used** (removed — incompatible with Supabase pgbouncer). Apply schema changes manually via the Supabase SQL editor or CLI. JPA is in `none` mode (`ddl-auto: none`). The `db/migration/` SQL files are documentation/reference only — they are not auto-applied.
- **Neo4j** — constraints + indexes in `agent/app/graph/schema.py::apply_schema`, invoked from the FastAPI lifespan on agent startup. Statements are idempotent (`IF NOT EXISTS`).
- **PDPA invariant**: `audit_log` has DB-level triggers that reject UPDATE/DELETE — never edit that table in application code, always insert.

## Build / run / test commands

Copy `.env.example` to `.env` and fill in secrets before running.

| Service | Location | Dev run | Build | Test |
|---|---|---|---|---|
| Frontend | `frontend/` | `npm run dev` (port 3000) | `npm run build` | `npm run lint` · `npm run typecheck` |
| Backend | `backend/` | `./mvnw spring-boot:run` (port 8080) | `./mvnw package` | `./mvnw test` |
| Agent | `agent/` | `uvicorn app.main:app --reload --port 8000` | — | `pytest` |
| Full stack | repo root | `docker compose up --build` (Nginx on :80) | — | — |

## Stack at a glance

Next.js → Spring Boot 3 (Java 21) + Spring Security → Python FastAPI + LangGraph → Z.AI GLM 5.1. Supabase Postgres for relational data, Neo4j for the patient knowledge graph. Deploy via Docker Compose behind Nginx. Monorepo: `frontend/`, `backend/`, `agent/`, `deploy/`.

See `docs/details/architecture.md` for the full stack table, ports, DDD bounded contexts, and non-negotiable architectural rules.

## Hard safety invariants (never compromise)

Read these before touching agent or clinical-data code:
- **Doctor-in-the-loop**: every AI-generated clinical note passes an explicit doctor review-and-confirm before finalization. UI visibly distinguishes AI draft from human-confirmed.
- **Hermes adaptive rules are scoped to documentation style only — never clinical reasoning.** No learned rule may alter diagnosis, treatment, dosing, contraindications, or red-flag thresholds.
- **PDPA audit log** is append-only. Never delete or update rows in application code. Every CREATE / UPDATE / DELETE of per-patient data must write a row.
- **Server-side identity.** Every controller that acts on per-patient data must derive `patient_id` from the JWT principal (`PatientReadAppService.findByUserId(claims.userId())`). Path-parameter IDs require an explicit ownership check. Never hardcode UUIDs. See `docs/details/identity-and-authz.md`.
- **Frontend talks to Spring Boot only.** Next.js never calls the Python agent or Neo4j directly, and never uses the Supabase JS client for clinical data.
- **Evaluator soft-block.** Any CRITICAL evaluator finding (DDI, allergy, dose, pregnancy) must be acknowledged by the doctor before the visit can move forward. The gate is enforced at three points: (1) `ReportReviewAppService.approve`, (2) `SoapWriteAppService.finalize`, (3) the Python agent's `/agents/report/finalize`. The doctor may override CRITICAL findings only via the frontend `ApproveOverrideDialog`, which writes a per-finding ack-with-reason row to `evaluator_findings` before retrying the gated mutation. Never remove or bypass this gate, and never auto-acknowledge findings without a doctor-supplied reason. See `docs/details/agent-design.md` §Evaluator Agent.

## Skill usage

- **Frontend design work** — when creating or redesigning UI (layouts, components, styling, visual polish), use the `frontend-design` skill before writing code.

## Post-mortems (`docs/post-mortem/`)

Read before making infrastructure or API changes — these are real mistakes from this project, not hypotheticals.

- **`2026-04-22-backend-boot-and-schema.md`** — Docker cache pitfalls (`--no-cache` vs `--build`; `restart` vs `up -d`); Flyway exclusion silently no-ops `enabled: true`; `ddl-auto: validate` blocks startup when schema is manually managed; `apiPost` throws on void responses; component prop names must be read before use; frontend pages must confirm backend routes exist before calling them.
- **`2026-04-30-cross-patient-phi-leak.md`** — Hardcoded `patientId` in `PreVisitController` made every patient see Pat Demo's chart; LLM looked like it was hallucinating but was reading a wrong patient. Lessons: derive identity from JWT, audit every mutation (`VISIT.CREATE` was missed), don't blame the model before checking what data it received.

## Detail index (`docs/details/`)

Read the relevant file on demand — don't preload everything.

- **`architecture.md`** — Full tech-stack table, ports/protocols, DDD bounded contexts, architectural rules. Read before making structural changes.
- **`identity-and-authz.md`** — How to derive identity from the JWT principal, ownership checks on path-parameter IDs, `@PreAuthorize` defaults, audit-row obligations. **Read before writing any controller that touches per-patient data.**
- **`ddd-conventions.md`** — Java package layering, class-naming suffixes (`XxxModel`, `XxxDomainService`, `XxxRepository`, `XxxReadAppService`, `XxxWriteAppService`, `XxxController`, `XxxModel2DTOConverter`…), CQRS split, end-to-end slice example. **Read before writing any Java code in `backend/`.**
- **`agent-design.md`** — Per-agent responsibilities, Graphify pattern (Neo4j graph-RAG with confidence-scored edges), Hermes pattern (adaptive rule engine, style-only), Visit-agent prompt composition. Read before working on `agent/`.
- **`data-model.md`** — Postgres tables and Neo4j node/edge schema. Read before schema changes or Cypher queries.
- **`api-surface.md`** — Spring Boot external endpoints and Python agent internal endpoints. Read before adding routes.
- **`non-functional.md`** — PDPA, performance targets, Resilience4j config, rollout strategy, priority matrix, golden signals, correlation IDs. Read before ops/observability work.
- **`scope-and-acceptance.md`** — Explicit out-of-scope list, MVP must/should split, user-story IDs with PRD-defined acceptance criteria. Read before adding features.
- **`open-questions.md`** — Unresolved decisions and assumptions to validate.

Feature specs and plans (read on-demand for those features):
- **`docs/superpowers/specs/2026-05-01-evaluator-and-drug-validation-design.md`** — Full design for the evaluator agent + drug validation (DDI, allergy, dose, pregnancy, hallucination, completeness validators).
- **`docs/superpowers/plans/2026-05-01-evaluator-and-drug-validation.md`** — Phase-by-phase implementation plan for the evaluator feature.

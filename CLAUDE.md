# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Keep it short — it's an **index**, not documentation. Put depth in `docs/details/` and link to it.

## Project: CliniFlow AI

AI-powered clinical workflow platform for **SME clinics in Malaysia**. Covers three phases of the patient journey:

1. **Pre-Visit** — AI symptom-intake chatbot → structured report for the doctor
2. **Visit** — Text/voice consultation capture → AI-generated SOAP notes → doctor reviews/edits before finalizing
3. **Post-Visit** — Patient-friendly summary + medication instructions + patient portal

Four roles with RBAC: **Patient**, **Doctor**, **Clinic Staff/Receptionist**, **Clinic Admin/Owner**.

## Repository status

**Skeleton scaffolded** — `frontend/` (Next.js 14), `backend/` (Spring Boot 3.3 / Java 21 / Maven), `agent/` (FastAPI + LangGraph), `deploy/nginx/`. Business logic not yet implemented. DDD package tree for the 4 bounded contexts is in place under `backend/src/main/java/my/cliniflow/` (empty leaves marked with `.gitkeep`).

Design artifacts:
- `Product Requirement Document (PRD) — CliniFlow AI.pdf` — product spec (what to build)
- `Domain 1_AI Systems & Agentic Workflow Automation.pdf` — domain brief
- **System Analysis Documentation (SAD)** — in Notion: https://www.notion.so/3472193af50f8177bf9cef07de040fd7 — authoritative technical design (how to build). Fetch via Notion MCP for specifics.

**Conflict resolution**: SAD wins on technical matters; PRD wins on product scope.

**Default branch**: `master`. Feature branches target `master` for PRs.

## Database setup

- **Postgres (Supabase)** — schema lives in `backend/src/main/resources/db/migration/V1__init.sql`. Flyway runs it automatically on backend boot (`spring.flyway.enabled=true`). JPA is in `validate` mode — schema changes go through a new `V<n>__*.sql`, never `ddl-auto=update`.
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

The Maven wrapper (`./mvnw`) is not yet committed — generate it once with `mvn wrapper:wrapper` inside `backend/` after installing Maven locally, or just use `mvn` directly.

## Stack at a glance

Next.js → Spring Boot 3 (Java 21) + Spring Security → Python FastAPI + LangGraph → Z.AI GLM 5.1. Supabase Postgres for relational data, Neo4j for the patient knowledge graph. Deploy via Docker Compose behind Nginx. Monorepo: `frontend/`, `backend/`, `agent/`, `deploy/`.

See `docs/details/architecture.md` for the full stack table, ports, DDD bounded contexts, and non-negotiable architectural rules.

## Hard safety invariants (never compromise)

Read these before touching agent or clinical-data code:
- **Doctor-in-the-loop**: every AI-generated clinical note passes an explicit doctor review-and-confirm before finalization. UI visibly distinguishes AI draft from human-confirmed.
- **Hermes adaptive rules are scoped to documentation style only — never clinical reasoning.** No learned rule may alter diagnosis, treatment, dosing, contraindications, or red-flag thresholds.
- **PDPA audit log** is append-only. Never delete or update rows in application code.
- **Frontend talks to Spring Boot only.** Next.js never calls the Python agent or Neo4j directly, and never uses the Supabase JS client for clinical data.

## Skill usage

- **Frontend design work** — when creating or redesigning UI (layouts, components, styling, visual polish), use the `frontend-design` skill before writing code.

## Detail index (`docs/details/`)

Read the relevant file on demand — don't preload everything.

- **`architecture.md`** — Full tech-stack table, ports/protocols, DDD bounded contexts, architectural rules. Read before making structural changes.
- **`ddd-conventions.md`** — Java package layering, class-naming suffixes (`XxxModel`, `XxxDomainService`, `XxxRepository`, `XxxReadAppService`, `XxxWriteAppService`, `XxxController`, `XxxModel2DTOConverter`…), CQRS split, end-to-end slice example. **Read before writing any Java code in `backend/`.**
- **`agent-design.md`** — Per-agent responsibilities, Graphify pattern (Neo4j graph-RAG with confidence-scored edges), Hermes pattern (adaptive rule engine, style-only), Visit-agent prompt composition. Read before working on `agent/`.
- **`data-model.md`** — Postgres tables and Neo4j node/edge schema. Read before schema changes or Cypher queries.
- **`api-surface.md`** — Spring Boot external endpoints and Python agent internal endpoints. Read before adding routes.
- **`non-functional.md`** — PDPA, performance targets, Resilience4j config, rollout strategy, priority matrix, golden signals, correlation IDs. Read before ops/observability work.
- **`scope-and-acceptance.md`** — Explicit out-of-scope list, MVP must/should split, user-story IDs with PRD-defined acceptance criteria. Read before adding features.
- **`open-questions.md`** — Unresolved decisions and assumptions to validate.

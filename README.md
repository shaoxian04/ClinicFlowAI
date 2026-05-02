# CliniFlow AI

[![CI](https://github.com/shaoxian04/ClinicFlowAI/actions/workflows/ci.yml/badge.svg)](https://github.com/shaoxian04/ClinicFlowAI/actions/workflows/ci.yml)

**AI-powered clinical workflow platform for SME clinics in Malaysia.** End-to-end automation of the patient journey — pre-visit symptom intake, in-visit SOAP-note generation from voice or text, and post-visit bilingual (EN / MS) patient summaries. Built around a strict doctor-in-the-loop safety model.

> Hackathon submission · Team **Dependency Free** · Solo developer: **Tang Shao Xian**

---

## Judges — start here

> All four submission artifacts and the pitching video are linked below. Click to open.

| # | Artifact | Link |
|---|----------|------|
| 1 | **Product Requirement Document (PRD)** | [Open PDF](Product%20Requirement%20Document%20%28PRD%29%20%E2%80%94%20CliniFlow%20AI.pdf) |
| 2 | **System Analysis Document (SAD)** | [Open PDF](System%20Analysis%20Document%20%28SA%29%20%E2%80%94%20CliniFlow%20AI.pdf) |
| 3 | **Testing Analysis Document** | [Open PDF](Testing%20Analysis%20Document.pdf) |
| 4 | **Pitching Deck** | [Open PDF](Pitching%20Deck.pdf) |
| 5 | **Pitching Video** | [Watch on Google Drive ▶](https://drive.google.com/file/d/1kpo0B8AMJh_CxKhLLqf9a52mxFfU2zSg/view?usp=drive_link) |

If GitHub doesn't preview a PDF inline, use the **Download** button on the file's page. Direct repo paths:

- [`./Product Requirement Document (PRD) — CliniFlow AI.pdf`](Product%20Requirement%20Document%20%28PRD%29%20%E2%80%94%20CliniFlow%20AI.pdf)
- [`./System Analysis Document (SA) — CliniFlow AI.pdf`](System%20Analysis%20Document%20%28SA%29%20%E2%80%94%20CliniFlow%20AI.pdf)
- [`./Testing Analysis Document.pdf`](Testing%20Analysis%20Document.pdf)
- [`./Pitching Deck.pdf`](Pitching%20Deck.pdf)

---

## What it does

CliniFlow AI splits the consultation into **three phases**, each owned by a bounded context and powered by a dedicated AI agent:

| Phase | Actor | What the AI does |
|-------|-------|------------------|
| **Pre-Visit** | Patient | Conversational symptom-intake chatbot decides when enough info has been gathered, then produces a structured pre-visit report for the doctor. |
| **Visit** | Doctor (with patient) | Three input modes — **live mic recording**, **uploaded audio**, or **typed text**. Audio routes through OpenAI Whisper STT; the transcript is then turned into a SOAP-format draft (Subjective / Objective / Assessment / Plan) with extracted medications, diagnoses, and a graph-KB drug-interaction check. |
| **Post-Visit** | Patient (reads) | Bilingual (English + Bahasa Melayu) plain-language summary, structured medication guide, red-flag symptoms, and follow-up guidance, surfaced in a patient portal. |

**Doctor-in-the-loop is non-negotiable.** Every AI-generated clinical note passes an explicit doctor review-and-confirm before it is finalized. The UI visibly distinguishes AI draft from human-confirmed.

---

## Architecture at a glance

Polyglot service architecture — one service per concern, two databases, one LLM provider:

```
                        ┌────────────────────────┐
                        │   Next.js 14 (React)   │  Patient · Doctor · Staff · Admin
                        └────────────┬───────────┘
                                     │ REST / JSON via Nginx
                        ┌────────────▼───────────┐
                        │  Spring Boot 3.3 / J21 │  Auth, RBAC, DDD bounded contexts,
                        │       :8080            │  patient record CRUD, audit log
                        └─┬──────────────────────┘
                          │ HTTP (per-agent)
                        ┌─▼──────────────────────┐
                        │  FastAPI · Python 3.12 │  ReAct agents (Pre-Visit, Report)
                        │       :8000            │  LangGraph · OpenAI / GLM via ILMU · Whisper
                        └─┬───────────┬──────────┘
                          │ JDBC      │ Bolt
                  ┌───────▼─┐    ┌────▼──────────┐
                  │ Postgres│    │  Neo4j 5.20   │  Patient knowledge graph
                  │(Supabase│    │ (graph KB)    │  + adaptive rules
                  └─────────┘    └───────────────┘
```

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router, React 18, TypeScript) |
| Business logic | Spring Boot 3.3 · Java 21 · Spring Security · DDD bounded contexts |
| AI orchestration | FastAPI · Python 3.12 · LangGraph-style ReAct agents |
| LLM provider | OpenAI-compatible — `gpt-4o-mini` (dev), **Z.AI GLM 5.1 via ILMU** (prod) |
| Speech-to-Text | OpenAI Whisper (`whisper-1`) |
| Relational DB | Supabase Postgres (pgbouncer transaction-mode, **no Flyway**) |
| Graph DB | Neo4j 5.20 Community |
| Edge | Nginx reverse proxy on `:80` |
| Deploy | Docker Compose |

> Frontend talks to Spring Boot **only** — never directly to the Python agent or Neo4j, never via the Supabase JS client for clinical data.

Full architecture detail: see the [System Analysis Document (SAD)](System%20Analysis%20Document%20%28SA%29%20%E2%80%94%20CliniFlow%20AI.pdf) and [`docs/details/architecture.md`](docs/details/architecture.md).

---

## Hard safety invariants

These are baked into the design and the code reviews. **Never compromise:**

1. **Doctor-in-the-loop** — every AI clinical note requires explicit doctor finalize; UI distinguishes AI draft from human-confirmed.
2. **Adaptive (Hermes) rules are scoped to documentation style only** — never clinical reasoning. No learned rule may alter diagnosis, treatment, dosing, contraindications, or red-flag thresholds.
3. **PDPA audit log is append-only** — DB triggers raise on `UPDATE`/`DELETE`. Same applies to `agent_turns`. Application code only ever `INSERT`s.
4. **Frontend never bypasses the backend** — no direct calls to the agent service or Neo4j from the browser.

---

## Repository layout

```
.
├── frontend/          Next.js 14 (App Router) — all four roles
├── backend/           Spring Boot 3.3 — DDD bounded contexts:
│                        my.cliniflow.{previsit,visit,postvisit,management}
├── agent/             FastAPI + LangGraph — Pre-Visit & Report agents,
│                        graph KB client, STT proxy, Hermes rules
├── deploy/nginx/      Reverse-proxy config (TLS, 300s read timeout for LLM)
├── docs/
│   ├── details/       Per-topic deep dives (architecture, ddd, agent, data model…)
│   └── post-mortem/   Real incidents from this build — read before infra changes
└── docker-compose.yml
```

---

## Run it locally

Copy `.env.example` to `.env` and fill in secrets, then:

| Service | Where | Command | Port |
|---|---|---|---|
| Frontend | `frontend/` | `npm run dev` | 3000 |
| Backend | `backend/` | `./mvnw spring-boot:run` | 8080 |
| Agent | `agent/` | `uvicorn app.main:app --reload --port 8000` | 8000 |
| **Full stack** | repo root | `docker compose up --build` | 80 (Nginx) |

Tests:

| Target | Command |
|---|---|
| Frontend lint + typecheck | `cd frontend && npm run lint && npm run typecheck` |
| Backend tests | `cd backend && ./mvnw test` |
| Agent tests | `cd agent && pytest` |

CI runs all three on every push and PR (`.github/workflows/ci.yml`).

---

## Database setup

- **Postgres (Supabase)** — schema lives in `backend/src/main/resources/db/migration/V1__init.sql` … `V8__*.sql`. **Flyway is NOT used** (incompatible with Supabase pgbouncer) — apply schema changes manually via the Supabase SQL editor in V-order. JPA runs with `ddl-auto: none`.
- **Neo4j** — constraints + indexes are applied at FastAPI startup from `agent/app/graph/schema.py::apply_schema`. All statements are idempotent (`IF NOT EXISTS`).
- **PDPA invariant** — `audit_log` and `agent_turns` reject `UPDATE`/`DELETE` at the DB level via triggers. Always `INSERT`.

---

## Roles & RBAC

Four roles enforced in Spring Security, each with its own workspace:

- **Patient** — symptom intake chatbot, post-visit portal with EN/MS toggle
- **Doctor** — visit workspace (pre-visit / consultation / post-visit tabs), SOAP review, finalize
- **Clinic Staff / Receptionist** — patient intake, scheduling
- **Clinic Admin / Owner** — user management, audit visibility

---

## Deeper documentation

| File | Read before… |
|---|---|
| [`docs/details/architecture.md`](docs/details/architecture.md) | making structural changes |
| [`docs/details/ddd-conventions.md`](docs/details/ddd-conventions.md) | writing any Java code in `backend/` |
| [`docs/details/agent-design.md`](docs/details/agent-design.md) | working on `agent/` |
| [`docs/details/data-model.md`](docs/details/data-model.md) | schema changes or Cypher queries |
| [`docs/details/api-surface.md`](docs/details/api-surface.md) | adding routes |
| [`docs/details/non-functional.md`](docs/details/non-functional.md) | ops / observability work |
| [`docs/details/scope-and-acceptance.md`](docs/details/scope-and-acceptance.md) | adding features |
| [`docs/post-mortem/`](docs/post-mortem/) | infra or API changes — these are real incidents |

---

## Conflict resolution

- **SAD wins on technical matters.**
- **PRD wins on product scope.**

---

## License

Hackathon submission · all rights reserved by the author pending license decision.

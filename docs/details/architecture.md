# Architecture

Polyglot multi-service architecture, monorepo layout.

## Tech stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | **Next.js** (React) | Web-responsive UI for all 4 roles |
| Backend | **Spring Boot 3.x (Java 21)** + **Spring Security** | API gateway, authn/authz, RBAC, patient-record CRUD, DDD bounded contexts, orchestrates agent calls |
| Agent service | **Python + FastAPI + LangGraph** | Pre-visit / Visit / Post-visit agents, GLM orchestration, graph-KB queries, adaptive rule engine |
| Relational DB | **Supabase** (managed Postgres) | Users, patients, visits, reports, medications, audit log |
| Graph DB | **Neo4j** | Patient knowledge graph: symptoms, diagnoses, medications, allergies, conditions, adaptive rules |
| LLM | **Z.AI GLM 5.1** | Called from Python agent via OpenAI-compatible endpoint (custom `base_url`) |
| STT | **Whisper-class API** | Consultation audio → transcript; called from Spring Boot, forwarded to Visit agent |
| Reverse proxy | **Nginx** | TLS termination, routing to Next.js / Spring Boot |
| Deployment | **Docker Compose** | Three compose files (base / dev / prod); each service in its own multi-stage-built container |
| CI/CD | **GitHub Actions** | Build, test, Trivy scan, push to GitHub Container Registry |
| Migrations | **Flyway** (Postgres) + Cypher bootstrap script (Neo4j) | Spring Boot owns schema; runs at startup |
| Resilience | **Resilience4j** (Java), **tenacity** (Python) | Circuit breakers, retries, rate limiters, timeouts |
| Observability | **Grafana Cloud** (Prometheus/Loki/Tempo), **Sentry**, **Uptime Robot** | Metrics, logs, traces, errors, external probes |
| Repo layout | **Monorepo** | `frontend/` (Next.js), `backend/` (Spring Boot), `agent/` (Python), `deploy/` (Docker/Nginx) |

## Ports and protocols

- Frontend → Spring Boot: HTTPS via Nginx → `:8080` (REST/JSON, JWT in `Authorization` header)
- Spring Boot → Python agent: internal HTTP `:8000` (service token; **never exposed via Nginx**)
- Python agent → Neo4j: **Bolt**
- Spring Boot → Supabase Postgres: **JDBC** over TLS
- Python agent → Z.AI GLM / STT provider: HTTPS

## Spring Boot bounded contexts (DDD)

Four contexts, per SAD §2.1: **Pre-Visit**, **Visit**, **Post-Visit**, **Management**. `Visit` is the aggregate root owning its three phase artifacts (pre-visit report, medical report, post-visit summary). Keep these boundaries explicit in package structure.

## Architectural rules (non-negotiable)

- **Frontend → Spring Boot only.** Next.js never calls the Python agent or Neo4j directly. Do not use the Supabase JS client from Next.js for clinical data — all patient-data reads/writes flow through Spring Boot so RBAC and audit logging are enforced centrally.
- **Spring Boot → Python agent** calls are authenticated (internal service token), carry an `X-Correlation-ID` header propagated end-to-end, and use Resilience4j (timeouts, circuit breaker, fallback). Fallback path when the agent is unavailable: present a manual-entry template to the doctor.
- **Auth**: Spring Security issues JWTs. Users live in a Spring-managed `users` table (Postgres) with `password_hash` + `role`. Next.js attaches the JWT to every API call. The Python agent validates its own inbound service token.
- **Schema ownership**: Spring Boot owns the Postgres schema via Flyway (`src/main/resources/db/migration/`). Python writes to Neo4j only; for Postgres it is read-only or calls back to Spring Boot. Avoid two writers on the same Postgres tables.
- **LLM integration**: Z.AI GLM 5.1 has an OpenAI-compatible API. Configure `OPENAI_BASE_URL` + `OPENAI_API_KEY` + model name in env vars so provider swaps are config-only (PRD §8.2 R6).
- **Doctor-in-the-loop**: every AI-generated clinical note passes through explicit doctor review-and-confirm before finalization. UI must visibly distinguish AI draft vs. human-confirmed content. This is a hard safety invariant, not a UX preference.
- **PDPA audit log**: append-only table in Postgres, separate from business tables. Every read and every mutation of patient data writes a row. Never delete or update rows in this table from application code.
- **Graceful degradation**: GLM down → manual entry template; STT down → text input path; Neo4j down → Postgres-only context (reduced agent quality, still functional). Design failure modes explicitly, don't let exceptions surface to users.

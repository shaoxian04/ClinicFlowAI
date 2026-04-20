# Data Model

## Postgres tables (SAD §2.3.2)

UUID PKs, `gmt_create` / `gmt_modified` audit columns on most entities.

- `users` — Spring-managed, with `password_hash` + `role` for Spring Security
- `patients` — demographics
- `visits` — one row per consultation; aggregate-root reference
- `pre_visit_reports` — symptom-intake output
- `medical_reports` — SOAP columns (`subjective`, `objective`, `assessment`, `plan`) + `is_finalized`
- `post_visit_summaries` — patient-friendly summary
- `medications` — prescribed per visit
- **PDPA audit log** — separate append-only table; every read and mutation of patient data writes a row

## Neo4j graph schema (SAD §2.3.3)

Nodes: `Patient`, `Doctor`, `Visit`, `Symptom`, `Diagnosis`, `Medication`, `Allergy`, `Condition`, `AdaptiveRule`.

Relationships:
- `(Patient)-[:PRESENTED_WITH]->(Symptom)`
- `(Visit)-[:DIAGNOSED_AS]->(Diagnosis)`
- `(Visit)-[:PRESCRIBED]->(Medication)`
- `(Medication)-[:CONTRAINDICATES]->(Allergy)`
- `(Patient)-[:HAS_HISTORY_OF]->(Condition)`
- `(AdaptiveRule)-[:APPLIES_TO]->(Doctor)`
- `(AdaptiveRule)-[:IN_CONTEXT_OF]->(Condition)`

Every edge is tagged with relation type, confidence (`EXTRACTED` = 1.0, `INFERRED` = 0.0–1.0), and source location. No vector DB — reasoning is graph-based, not RAG.

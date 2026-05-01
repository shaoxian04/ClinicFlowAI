# Data Model

## Postgres tables (SAD §2.3.2)

UUID PKs, `gmt_create` / `gmt_modified` audit columns on most entities.

- `users` — Spring-managed, with `password_hash` + `role` for Spring Security
- `patients` — demographics; includes `whatsapp_consent_at` (timestamptz, nullable) and `whatsapp_consent_version` (varchar 16, nullable)
- `visits` — one row per consultation; aggregate-root reference
- `pre_visit_reports` — symptom-intake output
- `medical_reports` — SOAP columns (`subjective`, `objective`, `assessment`, `plan`) + `is_finalized`
- `post_visit_summaries` — patient-friendly summary
- `medications` — prescribed per visit
- **PDPA audit log** — separate append-only table; every read and mutation of patient data writes a row
- `schedule_template` — doctor's weekly working hours + slot duration + cancel-lead-hours policy. Columns: `id` (uuid PK), `doctor_id` (FK doctors), `effective_from` (date), `slot_minutes` (smallint, CHECK in {10,15,20,30}), `weekly_hours` (jsonb, e.g. `{"MON":[["09:00","12:00"]]}`), `cancel_lead_hours` (smallint, default 2), `generation_horizon_days` (smallint, default 28), `gmt_create`, `gmt_modified`. Unique on (`doctor_id`, `effective_from`).
- `appointment_slots` — eager-materialised slot grid generated from the template. Columns: `id` (uuid PK), `doctor_id` (FK doctors), `start_at` (timestamptz), `end_at` (timestamptz, CHECK end>start), `status` (varchar CHECK in AVAILABLE/BOOKED/BLOCKED/CLOSED), `gmt_create`, `gmt_modified`. Unique on (`doctor_id`, `start_at`). Partial unique on (`doctor_id`, `start_at`) WHERE `status`='AVAILABLE' [Postgres-only].
- `appointments` — bookings linking a slot to a patient + visit. Columns: `id` (uuid PK), `slot_id` (FK appointment_slots), `patient_id` (FK patients), `visit_id` (FK visits), `appointment_type` (CHECK in NEW_SYMPTOM/FOLLOW_UP), `parent_visit_id` (FK visits, nullable, used for FOLLOW_UP only), `status` (CHECK in BOOKED/CANCELLED/COMPLETED/NO_SHOW), `cancel_reason` (varchar 64), `cancelled_at`, `cancelled_by` (FK users), `gmt_create`, `gmt_modified`. Partial unique on (`slot_id`) WHERE `status`='BOOKED' [Postgres-only — race safety net]. Partial unique on (`visit_id`) WHERE `status`='BOOKED'.
- `schedule_day_overrides` — staff exceptions to the regular schedule. Columns: `id` (uuid PK), `doctor_id` (FK doctors), `override_date` (date), `override_type` (CHECK in DAY_CLOSED/WINDOW_BLOCKED), `window_start` (time, nullable), `window_end` (time, nullable), `reason` (varchar 255), `created_by` (FK users), `gmt_create`. CHECK: WINDOW_BLOCKED requires non-null windows with end > start.
- `notification_outbox` — pending WhatsApp notifications. Columns: `id` (uuid PK), `event_type` (varchar 48, e.g. APPOINTMENT_BOOKED), `channel` (CHECK in WHATSAPP), `template_id` (varchar 64), `recipient_patient_id` (FK patients), `payload` (jsonb), `idempotency_key` (varchar 128 UNIQUE), `status` (CHECK in PENDING/SENDING/SENT/FAILED/SKIPPED_NO_CONSENT), `attempts` (smallint), `next_attempt_at`, `last_error`, `sent_at`, `gmt_create`, `gmt_modified`. Partial index on (`next_attempt_at`) WHERE `status` IN (PENDING, FAILED) for the drainer poll.
- `whatsapp_message_log` — outbound message history (one row per send attempt). Columns: `id` (uuid PK), `outbox_id` (FK notification_outbox), `twilio_sid` (varchar 64, nullable), `to_phone_hash` (varchar 64, sha-256 of E.164 phone — PII redaction), `template_id`, `rendered_locale` (varchar 8), `delivery_status` (CHECK in QUEUED/SENT/DELIVERED/READ/FAILED/UNDELIVERED), `twilio_error_code` (varchar 16, nullable), `gmt_create`, `gmt_modified`.

**PDPA audit log invariant:** Every WhatsApp consent grant/withdraw, every appointment CREATE/UPDATE, every notification SEND, and every schedule template UPDATE writes an audit row. The audit log itself is append-only; never edit or delete rows in application code (database-level triggers enforce this).

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

## Demo seeding — destructive, dev-only

`agent/app/graph/queries/seed_demo.py` (invoked via `POST /agents/patient-context/seed-demo-bulk`) runs an unconditional Cypher MERGE that adds `Penicillin` + `Peanuts` allergies, `Type 2 Diabetes`, and `Metformin 500mg` edges to **every patient passed in**. It does not delete or replace existing edges, so running it against a populated graph silently contaminates real patient charts with these demo values. Backend gate: `cliniflow.dev.seed-demo-enabled` flag (off by default). Treat the seeder as destructive — never enable in any environment that has real patients.

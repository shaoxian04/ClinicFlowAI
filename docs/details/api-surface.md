# API Surface (SAD §2.2.2)

> Identity rules for every endpoint here: see `identity-and-authz.md`. Every per-patient endpoint must derive `patient_id` from the JWT principal, never trust a path/body ID without an ownership check, and write an `audit_log` row on mutations.

## Spring Boot (external, JWT-authenticated)

- `POST /api/previsit/sessions` — start a pre-visit session. **No body.** `patient_id` derived server-side from JWT principal (`@PreAuthorize("hasRole('PATIENT')")`). Returns `{ visitId, assistantMessage, structured, done }`.
- `POST /api/previsit/sessions/{visitId}/turn` — append a patient turn. Verifies `visit.patient_id == caller's patient_id`; mismatch returns `40300` (HTTP 403). Body: `{ userMessage }`.
- `GET /api/visits/{id}`
- `POST /api/visits/{id}/audio`
- `POST /api/visits/{id}/notes-text`
- `PUT /api/visits/{id}/report`
- `GET /api/post-visit/{visitId}/summary`

## Schedule & appointments

**Patient endpoints (`hasRole('PATIENT')`):**
- `GET  /api/appointments/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` → `AvailabilityResponse{slots[]}` — list AVAILABLE slots for the (single MVP) doctor in the date range. Max 14-day range.
- `POST /api/appointments` ← `AppointmentBookRequest{slotId, type, visitId?, parentVisitId?}` → `UUID` — book an appointment. NEW_SYMPTOM requires visitId; FOLLOW_UP requires parentVisitId. 409 on race-loss (slot taken).
- `GET  /api/appointments/mine?status=BOOKED|CANCELLED|...` → `List<AppointmentDTO>`
- `DELETE /api/appointments/{id}` ← `AppointmentCancelRequest{reason?}` → 204. 403 cross-patient. 409 if cancel lead-time has passed.
- `PUT /api/patients/me/phone` ← `PhoneUpdateRequest{phone}` → 204. E.164 validation.
- `PUT /api/patients/me/whatsapp-consent` ← `WhatsAppConsentUpdateRequest{consent: bool}` → 204. 400 if consent=true with no phone on file.

**Staff endpoints (`hasRole('STAFF')`):**
- `GET  /api/schedule/days/{date}` → `DayScheduleResponse{date, slots[], appointments[]}`
- `POST /api/schedule/days/{date}/closures` ← `DayClosureRequest{date, reason?}` → `UUID` (override id). 409 if active bookings exist.
- `POST /api/schedule/days/{date}/blocks` ← `WindowBlockRequest{date, windowStart, windowEnd, reason?}` → `UUID`. 409 if active bookings overlap.
- `DELETE /api/schedule/overrides/{id}` → 204
- `POST /api/schedule/appointments/{id}/no-show` → 204

**Admin endpoints (`hasRole('ADMIN')`):**
- `GET  /api/schedule/template` → `ScheduleTemplateDTO` (404 if none)
- `PUT  /api/schedule/template` ← `ScheduleTemplateUpsertRequest` → `ScheduleTemplateDTO`. Triggers slot regeneration in same transaction.

**Doctor endpoints (`hasRole('DOCTOR')`):**
- `GET  /api/doctor/appointments/today` → `List<AppointmentDTO>`

## Python agent (internal, service-token-authenticated)

- `POST /agents/pre-visit/start` + continue step
- `POST /agents/visit/generate` (body: transcript or text)
- `POST /agents/post-visit/generate`
- `POST /agents/rules/feedback`

The Python agent service is **never** exposed through Nginx. Only Spring Boot may reach it.

## Evaluator routes (added 2026-05-01)

### Spring Boot (frontend-facing)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/visits/{visitId}/findings` | Active findings for the visit, ordered by severity then `gmt_create`. Doctor must own the visit. Audit: `READ` / `evaluator_finding`. |
| `POST` | `/api/visits/{visitId}/findings/{findingId}/acknowledge` | Body `{reason?}` (max 255 chars). Idempotent. Audit: `UPDATE` / `evaluator_finding_ack`. Publishes `EvaluatorFindingAcknowledgedDomainEvent`. |
| `POST` | `/api/visits/{visitId}/re-evaluate` | Calls the agent's `/agents/evaluator/re-evaluate` then returns the new active set. Audit: `READ` / `evaluator_reevaluate`. |

> **Audit action enum.** `audit_log.action` is `varchar(16)` constrained to `READ, CREATE, UPDATE, DELETE, LOGIN, EXPORT`. Evaluator-specific intent is encoded in `resource_type` (e.g. `evaluator_finding_ack`, `visit_finalize_blocked`), not in `action`. Don't reintroduce `EVALUATOR_*` action strings — the CHECK constraint will reject them.

### Spring Boot (existing routes — new behavior)

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/visits/{visitId}/report/approve` | Returns 409 when unacknowledged CRITICAL findings exist. The frontend's override-with-reason dialog acknowledges each finding before retrying, so the gate becomes a no-op in the happy path; it remains as defense-in-depth against direct API callers. |
| `POST` | `/api/visits/{visitId}/report/finalize` | Returns 409 with `{code, message, findingIds}` when unacknowledged CRITICAL findings exist. Audit on block: `UPDATE` / `visit_finalize_blocked`. |

### Agent (internal)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/agents/evaluator/findings/{visit_id}` | Same active-findings query as Spring Boot but without ownership checks (service-to-service). |
| `POST` | `/agents/evaluator/re-evaluate` | Body `{visit_id, patient_id, doctor_id}`. Runs `EvaluatorAgent.evaluate` synchronously and returns the new findings. |

### Agent (existing routes — new SSE event)

| Route | New event |
|---|---|
| `POST /agents/report/generate` | After drafter completes: `event: evaluator.done` followed by JSON `{findings, validators_run, validators_unavailable}`, OR `event: evaluator.error` with `{reason}` |
| `POST /agents/report/edit` | Same |
| `POST /agents/report/clarify` | Same |

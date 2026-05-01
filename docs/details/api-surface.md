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

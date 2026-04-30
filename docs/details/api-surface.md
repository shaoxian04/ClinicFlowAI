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

## Python agent (internal, service-token-authenticated)

- `POST /agents/pre-visit/start` + continue step
- `POST /agents/visit/generate` (body: transcript or text)
- `POST /agents/post-visit/generate`
- `POST /agents/rules/feedback`

The Python agent service is **never** exposed through Nginx. Only Spring Boot may reach it.

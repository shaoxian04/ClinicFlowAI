# Scope & Acceptance Criteria

## Explicitly out of scope (PRD §7)

Do not build or propose these unless the user changes scope:
e-prescribing/pharmacy integration, telemedicine/video, insurance claims, medical imaging analysis (X-ray/MRI), full EHR replacement, billing/payment, native iOS/Android apps, vector DB / RAG.

## MVP must-haves vs. should-haves (PRD §6)

- **Must**: symptom intake agent, pre-visit report, multi-input (text+voice) consultation capture, documentation agent, structured SOAP report, patient record storage, patient record viewing, medication/dosage instruction generation, patient appointment booking, WhatsApp clinical reminders (post-finalize meds + follow-up)
- **Should**: voice input for symptom intake, AI-suggested diagnosis codes / medication autocomplete, admin analytics dashboard

## Acceptance criteria

User stories **US-P01..P05, US-D01..D06, US-R01..R02, US-O01..O02** have explicit acceptance criteria in PRD §5. Use those criteria verbatim as the test oracle for features — don't invent new ones.

## Appointment booking & reminders (added 2026-04-30)

**US-P06: Patient appointment booking**
- As a patient, I can view available appointment slots for the clinic doctor in a 14-day rolling calendar.
- I can book an available slot by selecting a time and specifying appointment type (NEW_SYMPTOM or FOLLOW_UP).
- For NEW_SYMPTOM bookings, the pre-visit symptom-intake chat is mandatory before confirming the slot.
- For FOLLOW_UP bookings, selecting a previous visit is mandatory; symptom intake is optional.
- Booking fails with HTTP 409 if the slot is no longer available (race condition).
- I can view my upcoming and past appointments via `/api/appointments/mine?status=...`.
- I can cancel a booked appointment up to 2 hours before the scheduled time; cancellations after the lead-time are rejected with HTTP 409.

**US-P07: WhatsApp clinical reminders**
- As a clinic, I can enable WhatsApp reminders to patients who have consented.
- Every appointment booking, cancellation, and SOAP report finalization triggers a WhatsApp notification sent to the patient's phone (if consent is granted and phone is on file).
- Reminders include appointment confirmation (with date/time), cancellation notice (with reason if provided), and post-visit medication/follow-up instructions (sent when doctor finalizes the SOAP).
- Patients can opt-in/opt-out of WhatsApp reminders at any time via the patient portal (`PUT /api/patients/me/whatsapp-consent`).
- The notification outbox ensures at-most-once delivery (idempotency via outbox pattern); failed sends are retried with exponential backoff.
- Phone numbers are PII-redacted in logs; only a SHA-256 hash is stored in the message log.

## Evaluator + drug validation (added 2026-05-01)

**Status:** MVP complete on `feat/evaluator-and-drug-validation`.

**Acceptance criteria** (from spec §7.6 E2E):
- Generating a SOAP draft for a warfarin patient with proposed ibuprofen produces ≥1 CRITICAL DDI finding visible in the AI Safety Review panel.
- The publish/finalize button is disabled while any unacknowledged CRITICAL finding exists; tooltip shows the count.
- Acknowledging with optional reason enables the publish button (UI) and the backend permits finalize (200 instead of 409).
- The finalized doctor-facing report contains no AI-Safety attribution (no "evaluator", "AI Safety", or "approved by evaluator" strings).
- Validator failure (e.g., Neo4j down) marks the validator unavailable in the SSE event without preventing the rest of the flow.

**Out of scope** (deferred for follow-up):
- Hermes-style adaptive rule learning from acknowledgement reasons. (Read side built in agent; write side is `NotImplementedError`.)
- E-prescription generation (per PRD §7 — explicitly out of scope).

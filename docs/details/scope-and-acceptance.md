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

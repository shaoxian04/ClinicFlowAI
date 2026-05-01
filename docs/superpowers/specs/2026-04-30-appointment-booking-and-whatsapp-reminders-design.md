# Appointment Booking & WhatsApp Reminders — Design

**Date:** 2026-04-30
**Status:** Approved (brainstorming complete; awaiting implementation plan)
**Owner:** shaoxian04
**Companion files:** `backend/src/main/resources/db/migration/V11__schedule_and_notifications.sql`

---

## 1. Problem & scope

Two patient-facing modules are added to CliniFlow AI:

1. **Appointment booking** — patients self-book a clinic visit on a fixed-slot grid; staff manage day-to-day exceptions; admin sets the recurring weekly template.
2. **WhatsApp notifications** — outbound clinical reminders (booking confirmations, cancellations, post-consultation medication summary, follow-up nudge) over WhatsApp via Twilio.

### PRD scope note

`docs/details/scope-and-acceptance.md` previously listed appointment booking under PRD §7 *out-of-scope*. This spec **expands** that boundary (user choice on 2026-04-30). When the spec is approved, `scope-and-acceptance.md` will be updated to remove appointment booking from the §7 exclusion list and to upgrade reminders from "Should" to "Must". This documentation update is part of the implementation plan.

### MVP boundaries (explicit non-goals)

- ❌ T-24h / T-2h scheduled appointment reminders (no scheduler in v1).
- ❌ Recurring medication reminders ("take pill at 8am, 8pm"). Single message at SOAP finalize only.
- ❌ Reschedule as one atomic operation. Cancel + rebook is the path.
- ❌ Multi-doctor selection in the UI. Data model is multi-doctor-ready; UI is single-doctor only.
- ❌ Email / SMS / in-app push fallback channels.
- ❌ Inbound WhatsApp processing (the `CANCEL` keyword in templates is informational; replies are not parsed in v1).
- ❌ Twilio inbound webhook signing (delivery-status webhooks are a follow-up).
- ❌ Pure walk-ins (staff-inserted bookings) in v1 — patients hit the patient flow.
- ❌ Calendar export (.ics).
- ❌ Auto-no-show after slot start.

### Hard safety invariants honoured

- **PDPA append-only audit log** — every CREATE / UPDATE / DELETE writes a row. Never edit `audit_log` from app code.
- **Server-side identity** — every controller derives `patientId` from JWT principal. Path-parameter IDs require explicit ownership checks.
- **Frontend → Spring Boot only.** No direct Twilio calls from the browser; no Supabase JS client for clinical data.
- **PHI-minimisation in third-party traffic** — Twilio templates use approved-template variable slots only. No free-text symptoms / diagnoses / SOAP body crosses the Twilio boundary.

---

## 2. Architecture decisions

| Axis | Decision | Rationale |
|---|---|---|
| **A.** Module placement | New `domain/biz/schedule/` bounded context (slots, template, overrides, appointments). New `infrastructure/notification/` for outbox + Twilio sender. `domain/biz/visit/` extended only with an outbound `SoapFinalizedEvent`. | Schedule lives at the clinic level — slots exist before any visit and outlive visits. Notifications are cross-cutting infra with no real domain model. |
| **B.** Notification layer | Infrastructure module (no model/repository in DDD-strict sense). Three components: `OutboxWriter`, `TwilioWhatsAppSender`, `MessageTemplateRegistry`. | Domain layer would be ceremony for "event in → outbox row → vendor SDK out". |
| **C.** Slot generation | Eager — saving the weekly template materialises 28 days of `appointment_slots`. A daily 02:00 task extends the horizon by one day. | Standard clinic pattern; gives a real table to render and to constrain (partial unique index for double-book prevention). |
| **D.** Notification provider | **Twilio WhatsApp API**; sandbox in dev, paid number in prod. Wrapped behind a `WhatsAppSender` interface; `StubWhatsAppSender` (logs to console) used in dev/test profiles. | Faster to ship than Cloud API direct (no Meta business verification gate); abstraction shields us if we migrate later. |
| **E.** Reminder scheduling | **Event-driven only — no reminder scheduler.** Booking → confirmation. Cancel → cancellation notice. SOAP finalize → med summary (+ follow-up if plan has a date). Note: two `@Scheduled` jobs still exist for plumbing — the Twilio outbox drainer (every 30s) and the daily slot-horizon extender (02:00). These are *infrastructure* schedulers, not reminder schedulers. | Removes Quartz / cron / parsing-frequency complexity from v1. |
| **F.** PDPA consent for WhatsApp | Distinct, withdrawable purpose. Captured via second checkbox on registration, separately from umbrella PDPA. Withdrawable in `/portal/profile`. | PDPA "purpose limitation" — clinical comms over a third-party messenger is a different purpose from clinical-data processing. |
| **G.** Pre-visit / booking integration | Pre-visit chat is **mandatory for new symptoms, optional for follow-ups**. Two booking entry points: post-pre-visit CTA (NEW_SYMPTOM) and "Book follow-up" from a past visit (FOLLOW_UP). | Keeps the symptom-intake-as-funnel story; doesn't punish follow-up patients. Doctor sees missing pre-visit on a NEW_SYMPTOM appointment as a flag. |

---

## 3. Module structure

### Backend (Spring Boot, Java 21)

```
backend/src/main/java/my/cliniflow/
├── domain/biz/
│   ├── visit/                                 [existing — minor extension]
│   │     └── service/...                      publishes SoapFinalizedEvent at finalize
│   │
│   └── schedule/                              [NEW]
│       ├── enums/                             AppointmentStatus, SlotStatus, OverrideType,
│       │                                      AppointmentType
│       ├── event/                             AppointmentBookedEvent,
│       │                                      AppointmentCancelledEvent
│       ├── info/                              TimeWindow, WeeklyHours value objects
│       ├── model/                             ScheduleTemplateModel, AppointmentSlotModel,
│       │                                      AppointmentModel, ScheduleDayOverrideModel
│       ├── repository/                        Spring Data JPA repos
│       └── service/                           ScheduleTemplateDomainService,
│                                              SlotGenerationDomainService,
│                                              AppointmentDomainService
│
├── application/biz/schedule/                  AppointmentReadAppService,
│                                              AppointmentWriteAppService,
│                                              ScheduleTemplateWriteAppService,
│                                              ScheduleDayOverrideWriteAppService,
│                                              *Model2DTOConverter
│
├── controller/biz/schedule/                   AppointmentController       (patient)
│                                              ScheduleController          (staff)
│                                              ScheduleTemplateController  (admin)
│                                              DoctorTodayController       (doctor RO)
│
├── application/biz/patient/                   [existing — extended]
│                                              + WhatsAppConsentWriteAppService method
│
├── controller/biz/patient/                    [existing — extended]
│                                              + PUT /api/patients/me/whatsapp-consent
│                                              + PUT /api/patients/me/phone
│
└── infrastructure/notification/               [NEW]
    ├── outbox/                                NotificationOutboxRepository,
    │                                          NotificationOutboxWriter
    ├── template/                              MessageTemplateRegistry (id, locale → body)
    ├── twilio/                                TwilioWhatsAppSender,
    │                                          StubWhatsAppSender (test/dev profile)
    └── listener/                              AppointmentBookedListener,
                                               AppointmentCancelledListener,
                                               SoapFinalizedListener
```

Naming follows `docs/details/ddd-conventions.md` (`XxxModel`, `XxxDomainService`, `XxxRepository`, `XxxReadAppService`, `XxxWriteAppService`, `XxxController`, `XxxModel2DTOConverter`).

### Frontend (Next.js 14)

```
frontend/app/
├── auth/register/page.tsx                     [MODIFIED] second consent checkbox
├── portal/
│   ├── book/page.tsx                          [NEW] calendar grid for new-symptom booking
│   ├── book/follow-up/page.tsx                [NEW] follow-up entry point
│   ├── appointments/page.tsx                  [NEW] my upcoming + past list
│   ├── appointments/[id]/page.tsx             [NEW] detail + cancel button
│   ├── profile/page.tsx                       [NEW] phone + whatsapp consent toggle
│   └── (existing portal pages)                + "Book follow-up" CTA on past-visit cards
├── previsit/                                  [existing]
│   └── completion screen                      + "Book your appointment" CTA
├── staff/
│   └── schedule/page.tsx                      [NEW] day-overrides UI
├── admin/
│   └── schedule-template/page.tsx             [NEW] weekly hours editor
└── doctor/                                    [existing]
    └── today/                                 + "today's appointments" panel
```

All new pages reuse `frontend/components/ui/` primitives (`Field`, `Input`, `Button`, `Separator`) and the aurora-glass design tokens in `frontend/design/` and `frontend/app/globals.css`.

---

## 4. Data model

All Postgres. Schema is managed manually (Flyway is removed — incompatible with Supabase pgbouncer transaction mode). The reference SQL lives at `backend/src/main/resources/db/migration/V11__schedule_and_notifications.sql`. **The user has already applied this file via the Supabase SQL editor on 2026-04-30.** Re-runs are safe (idempotent).

### Modified tables

- `patients` — added two nullable columns:
  - `whatsapp_consent_at  timestamptz` — `NULL` = not consented; timestamp = consented at that moment.
  - `whatsapp_consent_version  varchar(16)` — `wa-v1` for the launch text.
  - Partial index `idx_patients_wa_consent` for the outbox-sender's "is patient reachable?" lookup.
- `audit_log` — no schema change; new event types are inserted (see §7).

### New tables (all created)

- `schedule_template` — one row per `(doctor_id, effective_from)`; holds `weekly_hours` JSONB, `slot_minutes`, `cancel_lead_hours`, `generation_horizon_days`.
- `appointment_slots` — concrete materialised slots, `(doctor_id, start_at)` UNIQUE, `status` ∈ `AVAILABLE | BOOKED | BLOCKED | CLOSED`. Partial index on `AVAILABLE` for fast availability queries.
- `appointments` — bookings. Partial unique indexes:
  - `uq_appointments_active_slot ON (slot_id) WHERE status='BOOKED'` — one active booking per slot; cancellations free the slot.
  - `uq_appointments_active_visit ON (visit_id) WHERE status='BOOKED'` — visit ↔ appointment is 1:1.
  - `appointment_type` ∈ `NEW_SYMPTOM | FOLLOW_UP`; `parent_visit_id` set only for follow-ups.
- `schedule_day_overrides` — staff-managed exceptions (`DAY_CLOSED` or `WINDOW_BLOCKED`). Window required when blocked.
- `notification_outbox` — one row per outbound message. UNIQUE `idempotency_key`. Drainer index on `next_attempt_at` filtered to `PENDING|FAILED`.
- `whatsapp_message_log` — per-attempt delivery log. **`to_phone_hash` is SHA-256 of the phone, never the raw phone** — so PDPA-sensitive identifiers don't sit in this log.

### Slot generation rule

When `schedule_template` is updated:
1. Delete `appointment_slots` rows where `status='AVAILABLE'` AND `start_at > now()` for that doctor.
2. Iterate `next 28 days × weekly_hours[dow] × slot_minutes` → INSERT new slots.
3. Apply existing `schedule_day_overrides` (skip closed days, skip blocked windows).

A daily Spring `@Scheduled` task at `02:00 Asia/Kuala_Lumpur` extends the horizon by one day. Booked / cancelled / past slots are immutable.

---

## 5. API surface

Identity rules from `docs/details/identity-and-authz.md` apply on every per-patient endpoint: derive `patientId` from JWT principal; verify ownership on path-parameter IDs; write `audit_log` rows on mutations.

### Patient — `hasRole('PATIENT')`

| Method | Path | Body / params | Notes |
|---|---|---|---|
| `GET`  | `/api/appointments/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` | — | Lists `AVAILABLE` slots in window (capped at 14 days). |
| `POST` | `/api/appointments` | `{ slotId, type:NEW_SYMPTOM\|FOLLOW_UP, visitId?, parentVisitId? }` | For `NEW_SYMPTOM`: `visitId` is **required** (created earlier by `/api/previsit/sessions`) and is validated against caller. For `FOLLOW_UP`: `visitId` is **omitted**, `parentVisitId` is required and must belong to caller; server creates a new visit row. Returns `{ appointmentId, slot, status }`. 409 `40901: SLOT_TAKEN` on race. |
| `GET`  | `/api/appointments/mine?status=...` | — | Caller's bookings. |
| `DELETE` | `/api/appointments/{id}` | — | 403 `40301: CANCEL_WINDOW_PASSED` if within `cancel_lead_hours`; 403 if cross-patient. |
| `PUT`  | `/api/patients/me/whatsapp-consent` | `{ consent: bool }` | Grants/withdraws. Audit: `WHATSAPP_CONSENT.GRANT` or `.WITHDRAW`. |
| `PUT`  | `/api/patients/me/phone` | `{ phone }` | E.164 format; rejects clearing while consent is on. |

### Staff — `hasRole('CLINIC_STAFF')`

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/api/schedule/days/{date}` | Slots + bookings for that date. |
| `POST` | `/api/schedule/days/{date}/closures` | Whole day closed → cascades slots to `CLOSED`. Rejects if active bookings present. |
| `POST` | `/api/schedule/days/{date}/blocks` | `{ from, to, reason }` → in-window slots → `BLOCKED`. Rejects with 409 `40902: BOOKINGS_IN_WINDOW`. |
| `DELETE` | `/api/schedule/overrides/{id}` | Reverse override; only if no displaced bookings. |
| `POST` | `/api/appointments/{id}/no-show` | Marks no-show after slot start. |

### Admin — `hasRole('CLINIC_ADMIN')`

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/api/schedule/template` | Current weekly hours. |
| `PUT`  | `/api/schedule/template` | Updates template; triggers regeneration of `AVAILABLE`-future-only slots. |

### Doctor — `hasRole('DOCTOR')`

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/api/doctor/appointments/today` | Today's bookings, in start-time order, with patient summary + visit ID. Read-only. |

---

## 6. Notification pipeline

```
┌── domain side ──────────────────────┐    ┌── infra/notification ─────────────┐
│ AppointmentDomainService.book()    │───▶│ AppointmentBookedListener         │
│ AppointmentDomainService.cancel()  │───▶│ AppointmentCancelledListener      │
│ VisitDomainService.finalize()      │───▶│ SoapFinalizedListener             │
│   publishes Spring ApplicationEvents│    │   each calls OutboxWriter.enqueue │
└────────────────────────────────────┘    └─────────┬───────────────────────┘
                                                    ▼
                                  notification_outbox  (status=PENDING)
                                                    ▲
                                                    │ every 30s @Scheduled
                                  ┌─────────────────┴────────────────────────┐
                                  │ TwilioWhatsAppSender                     │
                                  │   1. SELECT … FOR UPDATE SKIP LOCKED    │
                                  │      WHERE status IN ('PENDING','FAILED')│
                                  │      AND next_attempt_at <= now()       │
                                  │      LIMIT 25                            │
                                  │   2. for each row:                       │
                                  │      a. flip status='SENDING'            │
                                  │      b. consent + phone gate            │
                                  │         → SKIPPED_NO_CONSENT (terminal) │
                                  │      c. render template (en/ms/zh)     │
                                  │      d. call Twilio API                │
                                  │      e. on success: status='SENT'       │
                                  │         insert whatsapp_message_log    │
                                  │      f. on failure: status='FAILED'     │
                                  │         attempts++, exponential backoff │
                                  │         max 5 attempts → terminal       │
                                  │   3. always insert audit_log row        │
                                  └─────────────────────────────────────────┘
```

### Listener mode

`@TransactionalEventListener(phase = AFTER_COMMIT)` for all three. Ensures Twilio failures don't roll back the booking, and rolled-back transactions don't enqueue messages.

### Idempotency keys

| Event | Key |
|---|---|
| `AppointmentBookedEvent` | `APPOINTMENT_BOOKED:{appointmentId}` |
| `AppointmentCancelledEvent` | `APPOINTMENT_CANCELLED:{appointmentId}` |
| `SoapFinalizedEvent` (meds) | `SOAP_FINALIZED_MEDS:{visitId}` |
| `SoapFinalizedEvent` (follow-up) | `SOAP_FINALIZED_FOLLOWUP:{visitId}` |

UNIQUE constraint on `notification_outbox.idempotency_key` makes re-publish a no-op. Trade-off acknowledged: post-finalize SOAP edits do **not** re-send messages — acceptable per the no-scheduler rule.

### Backoff schedule

`next_attempt_at = now() + (2 ^ attempts) minutes`, capped at 30 min. After 5 attempts, row stays `FAILED` and is no longer picked. Resilience4j circuit breaker on the Twilio HTTP client; in-app booking is unaffected by Twilio outage.

### Message templates

Approved through Twilio Content Templates console, in 3 locales. Resolved by `MessageTemplateRegistry` from `patients.preferred_language` (defaults to `en`).

| `template_id` | Variables | Purpose |
|---|---|---|
| `appointment_confirmation_v1` | name, doctor, date, time | Booking confirmation |
| `appointment_cancelled_v1`    | name, date, time, portal-link | Cancellation notice |
| `soap_meds_summary_v1`        | name, med list (server-formatted), portal-link | Post-consult med summary |
| `soap_followup_reminder_v1`   | name, doctor, target-date, portal-link | Follow-up nudge |

PHI-minimisation rule: medication names go in template variables (allowed by Meta as part of an approved utility template). Free-text symptoms / diagnoses / SOAP body never cross the Twilio boundary.

---

## 7. Audit log entries (existing `audit_log` table)

| `event_type` | Written when |
|---|---|
| `APPOINTMENT.CREATE` | New booking inserted. |
| `APPOINTMENT.CANCEL` | Patient or staff cancellation. |
| `APPOINTMENT.NO_SHOW` | Staff marks no-show. |
| `SCHEDULE_TEMPLATE.UPDATE` | Admin edits weekly hours. |
| `SCHEDULE_OVERRIDE.CREATE` | Staff blocks a day/window. |
| `SCHEDULE_OVERRIDE.DELETE` | Staff reverses an override. |
| `WHATSAPP_CONSENT.GRANT` | Patient opts in. |
| `WHATSAPP_CONSENT.WITHDRAW` | Patient opts out. |
| `NOTIFICATION.SEND` | Outbox drainer attempts a send (success or failure recorded in payload). |

PDPA invariant honoured — `audit_log` triggers (in `V1__init.sql`) reject UPDATE/DELETE; we only INSERT.

---

## 8. Integration with the pre-visit chat module

**Primary funnel — symptom intake → booking:**

```
patient on /portal → "I'm not feeling well" CTA
   → /previsit (existing flow): chats with AI; AI marks done=true; structured report stored
   → completion screen now has TWO actions:
        • [primary]   "Book your appointment"          → /portal/book?visitId={visitId}
        • [secondary] "I'll book later"                → /portal
   → /portal/book?visitId=…
        • GET /api/appointments/availability for next 14 days
        • week-view calendar grid (rows = slots, cols = days)
        • click slot → confirmation modal → POST /api/appointments
   → server books, fires AppointmentBookedEvent, AFTER_COMMIT enqueues outbox row
   → Twilio drainer → WhatsApp confirmation
   → UI redirects to /portal/appointments/{id} with green "Booked" banner
        + (if !whatsapp_consent_at) "Enable WhatsApp in your profile to get reminders."
```

**Follow-up funnel:**

```
/portal/appointments → past visit card → "Book follow-up" button
   → /portal/book/follow-up?parentVisitId={pastVisitId}
   → same calendar grid; POST sends type=FOLLOW_UP and parentVisitId
   → server creates a NEW visit row (no pre-visit report on it yet),
     sets appointment.visit_id to that new visit, parent_visit_id to the past visit
```

**SOAP finalize → reminders:**

```
Doctor confirms SOAP via existing PUT /api/visits/{id}/report (is_finalized=true)
   → VisitDomainService.finalize() now publishes SoapFinalizedEvent
   → SoapFinalizedListener writes 1 or 2 outbox rows:
        • SOAP_FINALIZED_MEDS  — if visit.medications exists, payload contains med list
        • SOAP_FINALIZED_FOLLOWUP — only if medical_reports.plan contains a follow-up date
   → Twilio drainer → WhatsApp to patient (if consent + phone)
```

---

## 9. PDPA consent UX

### Registration page (`/auth/register`)

Existing umbrella PDPA checkbox stays required. Add a second checkbox grouped as **"Privacy & communication"**:

```
─── Privacy & communication ───────────────────────────

[x] I agree to CliniFlow's privacy notice and consent to
    my health data being processed under PDPA.
    (required)

[ ] I consent to receiving appointment confirmations,
    medication instructions, and follow-up reminders via
    WhatsApp at the phone number above. I can withdraw
    anytime in my profile settings.
    (optional)
```

Validation: if WhatsApp box is checked → `phone` becomes required at form-submit time. Backend re-validates.

### Profile page (`/portal/profile`) — minimal MVP

```
─── Communication preferences ─────────

Phone:    +60 12-345-6789  [edit]

WhatsApp clinical reminders:  [● ON  ○ OFF]
   We'll send appointment confirmations,
   medication instructions, and follow-up
   reminders here.
```

ON↔OFF triggers:
- `PUT /api/patients/me/whatsapp-consent` with the new value.
- Server writes `whatsapp_consent_at` (granted) or sets it null (withdrawn) and writes the audit row.

### Existing patients (registered before this feature)

After migration their `whatsapp_consent_at IS NULL`. On their **next login**, a one-time post-login modal asks: *"Want WhatsApp reminders?"* Dismissable; stays NULL if dismissed. Track dismissal in `localStorage` keyed by user ID — not server-side; the user can be re-prompted on a different device, which is acceptable.

### Behaviour when consent is missing

Booking and SOAP finalize always succeed. Outbox writer still enqueues the row, but the drainer's consent gate marks it `SKIPPED_NO_CONSENT` (terminal). In-app booking confirmation surfaces a small banner: *"WhatsApp reminders disabled — enable in your profile to get reminded by phone."*

---

## 10. Edge cases (explicit handling)

| Case | Handling |
|---|---|
| Two patients tap the same slot simultaneously | Booking SQL: `SELECT … FOR UPDATE` on the slot, then partial unique index `uq_appointments_active_slot` is the safety net. Loser → 409 `40901: SLOT_TAKEN`. UI refreshes availability and shows "Slot just booked, please pick another." |
| Patient cancels at the boundary (T-1h59m vs T-2h01m) | Server check: `slot.start_at - now() >= cancel_lead_hours_interval`. UI hides cancel button when within window, but server is the source of truth → 403 `40301: CANCEL_WINDOW_PASSED`. |
| Patient toggles WhatsApp consent off **after** an outbox row is queued | Drainer re-checks `whatsapp_consent_at` at send time, not enqueue time. Off → row terminates with `SKIPPED_NO_CONSENT`. |
| Patient deletes phone (sets null) while consent is on | App-layer validation rejects clearing phone while consent is on. Drainer treats null phone the same as null consent (`SKIPPED_NO_CONSENT`). |
| Twilio outage | Backoff retries up to 5×; `FAILED` after that. Resilience4j circuit breaker on the HTTP client. In-app booking is unaffected. |
| Admin edits weekly template, has booked future slots | Slot regeneration deletes only `AVAILABLE` future slots. Booked slots persist. If the new template no longer covers a booked slot's time, the slot becomes "orphan but kept" — staff sees it and can manually cancel / reschedule with the patient. |
| Staff blocks a window that contains an active booking | Block is rejected with 409 `40902: BOOKINGS_IN_WINDOW`. Staff must cancel each affected booking first; UI shows the list. |
| Slot generation timezone vs. server timezone | App uses `Asia/Kuala_Lumpur` for slot generation. Slots are stored as `timestamptz`; client renders with browser locale. |
| Doctor finalizes SOAP, then re-edits & finalizes again | Idempotency key `SOAP_FINALIZED_MEDS:{visitId}` blocks duplicate enqueue. Trade-off accepted (no re-send on edit). |
| WhatsApp template not yet approved by Meta | Sender catches Twilio error code `63016` → marks row `FAILED` with `last_error="template_not_approved"`, no retry. Logged for ops. |
| Worker dies mid-send, leaving outbox row stuck in `SENDING` | The drainer query only picks `PENDING` / `FAILED`, so a stuck `SENDING` row never recovers on its own. Mitigation: a 5-minute "reaper" pass at the start of each drainer tick reverts `SENDING` rows older than 2 minutes back to `FAILED` (so backoff governs the retry). Cheap, deterministic, no extra scheduler. |

---

## 11. Testing strategy

Per project standard: 80%+ coverage; TDD where practical.

### Unit (`backend/src/test/java/.../domain/biz/schedule/`)

- `SlotGenerationDomainServiceTest` — weekly_hours JSON → expected slot count; respects day overrides; re-generation deletes only `AVAILABLE`-future, leaves booked rows intact.
- `AppointmentDomainServiceTest` — booking when slot taken throws `SlotTakenException`; cancel inside lead-window throws `CancelWindowPassedException`; cancel outside window flips status and frees slot.
- `MessageTemplateRegistryTest` — locale fallback (`zh` missing → `en`); placeholder variable count matches template body.
- `NotificationOutboxWriterTest` — idempotency-key collision is a no-op (returns existing row, doesn't insert duplicate).

### Integration (Spring Boot test slice + Testcontainers Postgres)

- `AppointmentControllerIT` — full book → cancel → rebook cycle; 409 on race; 403 on cross-patient access; audit_log rows present.
- `ScheduleTemplateControllerIT` — admin edit triggers regeneration, booked slots retained.
- `NotificationOutboxIT` — `AppointmentBookedEvent` enqueues one row; idempotency dedupes; `SKIPPED_NO_CONSENT` path covered.
- `TwilioSenderIT` with WireMock simulating Twilio: success path (SENT + log row); retryable failure (backoff increments); 63016 (no-retry).

### E2E (Playwright via MCP — **mandatory protocol**)

For every E2E phase the implementation plan **must**:

1. **Rebuild Docker images, no cache.**
   ```
   docker compose down -v
   docker compose build --no-cache
   docker compose up -d
   ```
   Rationale: `docs/post-mortem/2026-04-22-backend-boot-and-schema.md` documents real harm from cached image reuse silently masking changes.

2. **Drive the browser via Playwright MCP**, not headless local playwright. Use `mcp__plugin_playwright_playwright__browser_navigate` / `_click` / `_fill_form` / `_snapshot` / `_take_screenshot` / `_console_messages`. Sessions are visible; snapshots and console errors land in the conversation.

3. **Visually evaluate each new page against the existing aurora-glass theme.** Take a screenshot via MCP and check:
   - Color palette: `obsidian` background, `ink-well`/`ink-rim` cards, `cyan` accents, `fog`/`fog-dim` text, `crimson` for errors.
   - Typography: display / sans / mono families already configured.
   - Primitives: `Field`, `Input`, `Button`, `Separator` from `frontend/components/ui/` — don't invent new shells.
   - Sibling-page baseline: new pages must look like siblings of `/auth/register`, `/portal`, `/admin/users` (commits `0bd28b9`, `bd04125`, `caa0dc0`).
   - Default Tailwind boilerplate is a CRITICAL review failure, not a polish issue.

4. **Invoke the `frontend-design` skill** before writing UI code for any new page (per existing memory).

E2E specs to author (mirroring `frontend/e2e/`):

- `appointment-booking.spec.ts` — patient registers → pre-visit complete → book → see in `/portal/appointments` → cancel.
- `staff-schedule.spec.ts` — staff blocks tomorrow morning, slots disappear from patient availability call.
- `whatsapp-consent.spec.ts` — register without WhatsApp consent → book → confirmation page shows the "WhatsApp disabled" banner; toggle consent in profile → outbox shows `SKIPPED → SENDING` transition (verified via DB or admin endpoint).

### Mock vs. real Twilio

CI runs the `StubWhatsAppSender` (logs to console). A separate manually-triggered profile (`-Pintegration-twilio`) hits the Twilio sandbox once per release.

---

## 12. Build sequence (high level — implementation plan will detail)

Roughly the order the implementation plan should execute:

1. Schema applied (already done — V11 SQL ran on 2026-04-30).
2. Domain layer: `schedule` context (enums, models, repositories, domain services).
3. Application layer: read/write app services + DTO converters.
4. Controller layer: appointment, schedule, schedule-template, doctor-today.
5. Patient profile extensions: phone + consent endpoints + audit hooks.
6. Notification infrastructure: outbox writer, template registry, stub sender, listeners.
7. Wire Twilio sender behind a profile flag.
8. Frontend: register-page consent checkbox; `/portal/book`, `/portal/book/follow-up`, `/portal/appointments`, `/portal/profile`; staff & admin schedule pages; doctor today panel.
9. Pre-visit completion CTA wiring.
10. E2E specs + visual review (full Docker rebuild protocol).
11. Update `docs/details/scope-and-acceptance.md` to remove appointment booking from §7.
12. Update `docs/details/api-surface.md` with new endpoints.

---

## 13. Open questions deferred to the implementation plan

- Exact Spring `@Scheduled` configuration (single-instance lock vs. ShedLock) so the daily slot extender doesn't double-fire across replicas. v1 deploys are single-instance per the existing Compose layout, so a simple `@Scheduled` is fine; add ShedLock when we move to multi-replica.
- Localisation of free-text labels on new frontend pages — wire to the existing i18n pattern if there is one; otherwise English-only for v1, parallel to most existing pages.
- Whether to soft-cap `/api/appointments/availability` by clinic-side rate limit (the existing `bucket4j` dependency makes this trivial; decide per ops budget).
- Twilio Content Template approval lead time — plan should include a "submit templates day 1" step so they're approved by E2E test time.

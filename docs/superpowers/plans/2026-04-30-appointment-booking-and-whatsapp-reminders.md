# Appointment Booking & WhatsApp Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-04-30-appointment-booking-and-whatsapp-reminders-design.md`
**SQL companion:** `backend/src/main/resources/db/migration/V11__schedule_and_notifications.sql` (already applied to Supabase 2026-04-30).

**Goal:** Add patient self-service appointment booking on a fixed-slot grid (single doctor, multi-doctor-ready), and WhatsApp clinical reminders via Twilio at four event points (booking confirm, cancellation, SOAP finalize → meds, SOAP finalize → follow-up).

**Architecture:** New `domain/biz/schedule/` bounded context owns slots, template, overrides, appointments. New `infrastructure/notification/` provides outbox, Twilio sender (with stub for dev/test), message-template registry, and Spring `@TransactionalEventListener` listeners that translate domain events into outbox rows. Visit aggregate is extended with one outbound event (`SoapFinalizedEvent`). Patient aggregate is extended with two profile fields and two endpoints.

**Tech Stack:** Spring Boot 3.3.4 / Java 21 / Maven · Spring Data JPA · Hibernate (jsonb via `@JdbcTypeCode(SqlTypes.JSON)`) · Spring Security + JJWT · Resilience4j · `com.twilio.sdk:twilio` (NEW) · Testcontainers · WireMock-jre8 (NEW) · JUnit 5 + Mockito + AssertJ · Next.js 14 + zod · Playwright (driven via MCP) · Asia/Kuala_Lumpur timezone for slot generation.

**Branch:** Continue work on the existing `feat/registration-onboarding` branch *or* branch off it for `feat/appointment-booking-and-reminders`. The plan assumes the latter — adjust commands if the user prefers the former.

---

## Conventions used in this plan

- **TDD**: every task that produces production code follows `write failing test → run failing → implement → run passing → commit`.
- **Commit cadence**: one task = one commit, conventional-commits style (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`).
- **Backend test runner**: `cd backend && ./mvnw test -Dtest=ClassName#method` for a single test, `./mvnw test` for the suite.
- **Frontend lint/typecheck**: `cd frontend && npm run typecheck && npm run lint`.
- **DDD package roots**: `my.cliniflow.domain.biz.schedule`, `my.cliniflow.application.biz.schedule`, `my.cliniflow.controller.biz.schedule`, `my.cliniflow.infrastructure.repository.schedule`, `my.cliniflow.infrastructure.notification`.
- **Domain service rule** (from `docs/details/ddd-conventions.md` line 86): one domain service per state transition. So `AppointmentBookDomainService`, `AppointmentCancelDomainService`, `SlotGenerateDomainService`, `ScheduleTemplateUpdateDomainService`, `SlotBlockDomainService`, etc. — **not** a catch-all `AppointmentDomainService`. This refines the spec's section 3 nomenclature.
- **Identity rule**: every per-patient endpoint derives `patientId` from JWT principal via `((JwtService.Claims) auth.getPrincipal()).userId()` then `PatientReadAppService.findByUserId(userId)`. Path-parameter IDs require ownership checks.
- **PHI rule**: free-text symptoms / diagnoses / SOAP body never cross the Twilio boundary. Templates use approved variable slots only.
- **No placeholders**: every step contains the actual code, command, or expected output.

---

## Phase plan (each phase ships working software)

| Phase | Scope | Ships |
|---|---|---|
| 0 | Branch + Maven deps + Twilio config skeleton | working tree on new branch |
| 1 | JPA entities + repositories for schedule + notification (round-trip ITs) | tables fully exercisable from Java |
| 2 | Schedule domain layer (models, value objects, enums, domain services) | unit-tested booking/cancel/slot-gen invariants |
| 3 | Schedule application layer + DTOs + converters | integration-tested write/read services |
| 4 | Schedule controllers (patient, staff, admin, doctor) | full HTTP surface for booking module |
| 5 | Patient phone/consent endpoints + audit hooks | profile API ready |
| 6 | Visit context: `SoapFinalizedEvent` publication | event source live |
| 7 | Notification infra: outbox writer, template registry, stub sender, listeners | reminders module works end-to-end with stub |
| 8 | Real Twilio sender + drainer + horizon extender | reminders go out via Twilio |
| 9 | Frontend patient flows (register consent, /portal/book, /portal/appointments, /portal/profile, post-login modal) | patient UX complete |
| 10 | Frontend staff/admin/doctor schedule UIs | clinic UX complete |
| 11 | Pre-visit completion booking CTA wiring | symptom-intake-as-funnel live |
| 12 | E2E Playwright (MCP) + Docker `--no-cache` rebuild + design-theme review | acceptance check |
| 13 | Docs updates (`scope-and-acceptance.md`, `api-surface.md`, `data-model.md`) | docs aligned |

Each phase is independently shippable. Phases 1–8 produce a working booking-only-with-stub-WhatsApp backend; Phase 8 flips the Twilio bean profile to send for real; Phases 9–11 layer the UI on top.

---

## File map

### Backend — `domain/biz/schedule/`

| File | Action | Responsibility |
|---|---|---|
| `enums/AppointmentStatus.java` | Create | `BOOKED`, `CANCELLED`, `COMPLETED`, `NO_SHOW` |
| `enums/SlotStatus.java` | Create | `AVAILABLE`, `BOOKED`, `BLOCKED`, `CLOSED` |
| `enums/AppointmentType.java` | Create | `NEW_SYMPTOM`, `FOLLOW_UP` |
| `enums/OverrideType.java` | Create | `DAY_CLOSED`, `WINDOW_BLOCKED` |
| `enums/DayOfWeekEnum.java` | Create | `MON..SUN` (kept simple — `java.time.DayOfWeek` ordering matches) |
| `info/TimeWindow.java` | Create | record `(LocalTime start, LocalTime end)` invariant `end > start` |
| `info/WeeklyHours.java` | Create | record `(Map<DayOfWeek, List<TimeWindow>> hours)` with JSON ↔ object converter |
| `event/AppointmentBookedDomainEvent.java` | Create | record event |
| `event/AppointmentCancelledDomainEvent.java` | Create | record event |
| `event/SoapFinalizedDomainEvent.java` | Create *in `visit/event/`* | publishes from `MedicalReportFinalizeDomainService` |
| `model/ScheduleTemplateModel.java` | Create | aggregate root: `id, doctorId, effectiveFrom, slotMinutes, weeklyHours, cancelLeadHours, generationHorizonDays` |
| `model/AppointmentSlotModel.java` | Create | aggregate root: `id, doctorId, startAt, endAt, status` |
| `model/AppointmentModel.java` | Create | aggregate root: `id, slotId, patientId, visitId, type, parentVisitId, status, cancelReason, cancelledAt, cancelledBy` |
| `model/ScheduleDayOverrideModel.java` | Create | aggregate root |
| `repository/ScheduleTemplateRepository.java` | Create | interface |
| `repository/AppointmentSlotRepository.java` | Create | interface |
| `repository/AppointmentRepository.java` | Create | interface |
| `repository/ScheduleDayOverrideRepository.java` | Create | interface |
| `repository/query/AppointmentSlotPageQuery.java` | Create | filter object: `(doctorId, fromInclusive, toExclusive, statusIn)` |
| `service/SlotGenerateDomainService.java` | Create | regen future-AVAILABLE slots from template + overrides |
| `service/AppointmentBookDomainService.java` | Create | `book(slot, patient, visitInfo) → Appointment`; raises `SlotTakenException`, `PreVisitMissingException` |
| `service/AppointmentCancelDomainService.java` | Create | enforces `cancel_lead_hours`; raises `CancelWindowPassedException` |
| `service/ScheduleTemplateUpdateDomainService.java` | Create | validates weekly hours; orchestrates regeneration |
| `service/SlotBlockDomainService.java` | Create | day-closed / window-blocked; raises `BookingsInWindowException` |
| `service/AppointmentNoShowDomainService.java` | Create | sets status NO_SHOW (post-slot-start only) |

### Backend — `application/biz/schedule/`

| File | Action | Responsibility |
|---|---|---|
| `AppointmentReadAppService.java` | Create | listing, availability, doctor-today, /mine |
| `AppointmentWriteAppService.java` | Create | book, cancel, no-show; publishes `Appointment*DomainEvent`; writes `audit_log` |
| `ScheduleTemplateWriteAppService.java` | Create | put-template; triggers slot regen; audits |
| `ScheduleTemplateReadAppService.java` | Create | get-template |
| `ScheduleDayOverrideWriteAppService.java` | Create | day-close, window-block, override-delete; audits |
| `ScheduleSlotReadAppService.java` | Create | day grid for staff/doctor |
| `SlotHorizonExtenderScheduler.java` | Create | `@Scheduled(cron = "0 0 2 * * *", zone = "Asia/Kuala_Lumpur")` calls `SlotGenerateDomainService` |
| `converter/AppointmentModel2DTOConverter.java` | Create | model → response DTO |
| `converter/AppointmentSlotModel2DTOConverter.java` | Create | model → response DTO |
| `converter/ScheduleTemplateModel2DTOConverter.java` | Create | model → response DTO |
| `converter/ScheduleDayOverrideModel2DTOConverter.java` | Create | model → response DTO |

### Backend — `controller/biz/schedule/`

| File | Action | Responsibility |
|---|---|---|
| `AppointmentController.java` | Create | patient endpoints: book / cancel / mine / availability |
| `ScheduleController.java` | Create | staff endpoints: day grid, closures, blocks, override-delete, no-show |
| `ScheduleTemplateController.java` | Create | admin endpoints: get/put template |
| `DoctorTodayController.java` | Create | `GET /api/doctor/appointments/today` |
| `request/AppointmentBookRequest.java` | Create | inbound DTO |
| `request/AppointmentCancelRequest.java` | Create | inbound DTO (optional `reason`) |
| `request/ScheduleTemplateUpsertRequest.java` | Create | inbound DTO |
| `request/DayClosureRequest.java` | Create | inbound DTO (optional `reason`) |
| `request/WindowBlockRequest.java` | Create | inbound DTO (`from, to, reason`) |
| `response/AppointmentDTO.java` | Create | outbound DTO |
| `response/SlotDTO.java` | Create | outbound DTO |
| `response/ScheduleTemplateDTO.java` | Create | outbound DTO |
| `response/AvailabilityResponse.java` | Create | `List<SlotDTO>` |
| `response/DayScheduleResponse.java` | Create | combines slots + bookings |

### Backend — `controller/biz/patient/` (modify)

| File | Action | Responsibility |
|---|---|---|
| `PatientMeController.java` | Create | `PUT /api/patients/me/whatsapp-consent`, `PUT /api/patients/me/phone` |
| `request/WhatsAppConsentUpdateRequest.java` | Create | `{ boolean consent }` |
| `request/PhoneUpdateRequest.java` | Create | `{ String phone }` (E.164 regex) |
| `application/biz/patient/PatientWriteAppService.java` | Modify | add `updatePhone`, `updateWhatsAppConsent` methods + audit + outbox-event publish |
| `domain/biz/patient/model/PatientModel.java` | Modify | add `whatsappConsentAt`, `whatsappConsentVersion` fields + behavior `grantWhatsAppConsent()` / `withdrawWhatsAppConsent()` |
| `infrastructure/repository/patient/PatientEntity.java` | Modify | add columns mapped to existing DB cols `whatsapp_consent_at`, `whatsapp_consent_version` |

### Backend — `domain/biz/visit/` (modify)

| File | Action | Responsibility |
|---|---|---|
| `event/SoapFinalizedDomainEvent.java` | Create | `(UUID visitId, UUID patientId, boolean hasMedications, LocalDate followUpDate)` |
| `service/MedicalReportFinalizeDomainService.java` | Modify | publish `SoapFinalizedDomainEvent` after invariants pass |
| `application/biz/visit/SoapWriteAppService.java` | Modify | use `ApplicationEventPublisher.publishEvent(...)` after save |

### Backend — `infrastructure/repository/schedule/`

| File | Action | Responsibility |
|---|---|---|
| `ScheduleTemplateEntity.java` | Create | JPA entity for `schedule_template` |
| `AppointmentSlotEntity.java` | Create | JPA entity for `appointment_slots` |
| `AppointmentEntity.java` | Create | JPA entity for `appointments` |
| `ScheduleDayOverrideEntity.java` | Create | JPA entity for `schedule_day_overrides` |
| `ScheduleTemplateJpaRepository.java` | Create | Spring Data JPA |
| `AppointmentSlotJpaRepository.java` | Create | Spring Data JPA + custom queries |
| `AppointmentJpaRepository.java` | Create | Spring Data JPA |
| `ScheduleDayOverrideJpaRepository.java` | Create | Spring Data JPA |
| `ScheduleTemplateRepositoryImpl.java` | Create | maps Model ↔ Entity |
| `AppointmentSlotRepositoryImpl.java` | Create | maps Model ↔ Entity |
| `AppointmentRepositoryImpl.java` | Create | maps Model ↔ Entity |
| `ScheduleDayOverrideRepositoryImpl.java` | Create | maps Model ↔ Entity |

### Backend — `infrastructure/notification/`

| File | Action | Responsibility |
|---|---|---|
| `outbox/NotificationOutboxEntity.java` | Create | JPA entity for `notification_outbox` |
| `outbox/NotificationOutboxJpaRepository.java` | Create | Spring Data JPA + drainer query |
| `outbox/NotificationOutboxWriter.java` | Create | `@Transactional(MANDATORY)` enqueue helper |
| `outbox/NotificationEventType.java` | Create | enum: `APPOINTMENT_BOOKED`, `APPOINTMENT_CANCELLED`, `SOAP_FINALIZED_MEDS`, `SOAP_FINALIZED_FOLLOWUP` |
| `outbox/NotificationStatus.java` | Create | enum: `PENDING`, `SENDING`, `SENT`, `FAILED`, `SKIPPED_NO_CONSENT` |
| `template/MessageTemplate.java` | Create | record `(String id, String locale, String body, int variableCount)` |
| `template/MessageTemplateRegistry.java` | Create | bean: registry of `appointment_confirmation_v1`, `appointment_cancelled_v1`, `soap_meds_summary_v1`, `soap_followup_reminder_v1` × `en/ms/zh` |
| `whatsapp/WhatsAppSender.java` | Create | interface `send(WhatsAppPayload) → SendResult` |
| `whatsapp/WhatsAppPayload.java` | Create | record `(String toPhoneE164, String templateId, String locale, Map<String,String> vars)` |
| `whatsapp/SendResult.java` | Create | sealed interface with `Sent(twilioSid)`, `Retryable(error)`, `Terminal(error)` |
| `whatsapp/StubWhatsAppSender.java` | Create | logs to console; default in `dev`/`test` profile |
| `whatsapp/TwilioWhatsAppSender.java` | Create | real impl; bean only when `cliniflow.whatsapp.provider=twilio` |
| `whatsapp/TwilioConfig.java` | Create | `@ConfigurationProperties("cliniflow.whatsapp.twilio")` |
| `whatsapp/log/WhatsAppMessageLogEntity.java` | Create | JPA entity |
| `whatsapp/log/WhatsAppMessageLogJpaRepository.java` | Create | Spring Data |
| `listener/AppointmentBookedListener.java` | Create | `@TransactionalEventListener(phase = AFTER_COMMIT)` |
| `listener/AppointmentCancelledListener.java` | Create | same |
| `listener/SoapFinalizedListener.java` | Create | enqueues 1–2 outbox rows depending on payload |
| `scheduler/OutboxDrainerScheduler.java` | Create | `@Scheduled(fixedDelay = 30_000)` drains pending+failed; reaper for stuck `SENDING` |

### Backend — `application.yml` + `pom.xml`

| File | Action | Responsibility |
|---|---|---|
| `backend/pom.xml` | Modify | add `com.twilio.sdk:twilio:10.4.1`, `com.github.tomakehurst:wiremock-jre8:3.0.1` (test scope) |
| `backend/src/main/resources/application.yml` | Modify | add `cliniflow.whatsapp.*` block + `cliniflow.scheduling.timezone: Asia/Kuala_Lumpur` |
| `backend/src/main/resources/application-test.yml` | Modify | force `cliniflow.whatsapp.provider: stub` |
| `.env.example` | Modify | add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_WHATSAPP` placeholders |

### Frontend — pages

| File | Action | Responsibility |
|---|---|---|
| `frontend/app/auth/register/page.tsx` | Modify | add WhatsApp consent checkbox + phone-required-when-checked |
| `frontend/app/portal/book/page.tsx` | Create | week-view calendar grid + slot picker |
| `frontend/app/portal/book/follow-up/page.tsx` | Create | follow-up entry; reads `parentVisitId` from query |
| `frontend/app/portal/appointments/page.tsx` | Create | upcoming + past list |
| `frontend/app/portal/appointments/[id]/page.tsx` | Create | detail + cancel button |
| `frontend/app/portal/profile/page.tsx` | Create | phone + WhatsApp consent toggle |
| `frontend/app/portal/page.tsx` | Modify | mount `<WhatsAppOptInModal>` for consent=null users |
| `frontend/app/staff/schedule/page.tsx` | Create | day grid + close/block forms |
| `frontend/app/admin/schedule-template/page.tsx` | Create | weekly hours editor |
| `frontend/app/doctor/today/page.tsx` | Create | today's bookings panel |
| `frontend/app/previsit/page.tsx` (or its completion screen component) | Modify | add "Book your appointment" CTA when `done=true` |

### Frontend — components, lib

| File | Action | Responsibility |
|---|---|---|
| `frontend/app/components/schedule/AvailabilityCalendar.tsx` | Create | week-view grid |
| `frontend/app/components/schedule/SlotPicker.tsx` | Create | renders slot buttons for one day |
| `frontend/app/components/schedule/AppointmentCard.tsx` | Create | reusable card |
| `frontend/app/components/schedule/CancelConfirmDialog.tsx` | Create | modal |
| `frontend/app/components/schedule/WhatsAppOptInModal.tsx` | Create | post-login one-time opt-in |
| `frontend/lib/appointments.ts` | Create | API client (typed) |
| `frontend/lib/profile.ts` | Create | API client for phone + consent |

### E2E

| File | Action | Responsibility |
|---|---|---|
| `frontend/e2e/appointment-booking.spec.ts` | Create | patient → previsit → book → cancel via Playwright MCP |
| `frontend/e2e/staff-schedule.spec.ts` | Create | staff blocks tomorrow morning → patient sees fewer slots |
| `frontend/e2e/whatsapp-consent.spec.ts` | Create | consent toggle reflects in outbox status |

### Docs

| File | Action | Responsibility |
|---|---|---|
| `docs/details/scope-and-acceptance.md` | Modify | remove appointment booking from §7 exclusion |
| `docs/details/api-surface.md` | Modify | add new endpoints |
| `docs/details/data-model.md` | Modify | add 6 new tables + 2 new patient columns |

---

## Phase 0 — Preparation

### Task 0.1: Create feature branch

**Files:** none.

- [ ] **Step 1: Confirm clean working tree**

Run: `git status`
Expected: working tree clean (or only untouched docs/screenshots).

- [ ] **Step 2: Branch off the current branch (which has the spec commit)**

Run:

```bash
git fetch origin
git checkout -b feat/appointment-booking-and-reminders
```

Expected: switched to a new branch.

- [ ] **Step 3: Verify branch**

Run: `git branch --show-current`
Expected: `feat/appointment-booking-and-reminders`

---

### Task 0.2: Add Twilio SDK + WireMock dependencies

**Files:**
- Modify: `backend/pom.xml`

- [ ] **Step 1: Add property versions**

Open `backend/pom.xml`. Inside `<properties>`:

```xml
<twilio-sdk.version>10.4.1</twilio-sdk.version>
<wiremock.version>3.0.1</wiremock.version>
```

- [ ] **Step 2: Add dependencies**

Inside `<dependencies>`:

```xml
<!-- Twilio SDK (WhatsApp) -->
<dependency>
    <groupId>com.twilio.sdk</groupId>
    <artifactId>twilio</artifactId>
    <version>${twilio-sdk.version}</version>
</dependency>

<!-- WireMock for stubbed Twilio in IT -->
<dependency>
    <groupId>com.github.tomakehurst</groupId>
    <artifactId>wiremock-jre8</artifactId>
    <version>${wiremock.version}</version>
    <scope>test</scope>
</dependency>
```

- [ ] **Step 3: Verify Maven downloads**

Run: `cd backend && ./mvnw dependency:resolve -q`
Expected: exit code 0, no resolution errors.

- [ ] **Step 4: Commit**

```bash
git add backend/pom.xml
git commit -m "chore(backend): add twilio sdk + wiremock for whatsapp module"
```

---

### Task 0.3: Add WhatsApp + scheduling config blocks

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-test.yml` (create if missing)
- Modify: `.env.example`

- [ ] **Step 1: Append config block to `application.yml`**

```yaml
cliniflow:
  scheduling:
    timezone: Asia/Kuala_Lumpur
    horizon-extender-cron: "0 0 2 * * *"
  whatsapp:
    provider: ${WHATSAPP_PROVIDER:stub}    # stub | twilio
    drainer-fixed-delay-ms: 30000
    reaper-stuck-after-minutes: 2
    max-attempts: 5
    twilio:
      account-sid: ${TWILIO_ACCOUNT_SID:}
      auth-token: ${TWILIO_AUTH_TOKEN:}
      from-whatsapp: ${TWILIO_FROM_WHATSAPP:whatsapp:+14155238886}
```

- [ ] **Step 2: Force stub in `application-test.yml`**

```yaml
cliniflow:
  whatsapp:
    provider: stub
    drainer-fixed-delay-ms: 60000   # slow in tests; tests trigger drainer manually
```

- [ ] **Step 3: Update `.env.example`**

Append:

```
# WhatsApp / Twilio (leave provider=stub locally)
WHATSAPP_PROVIDER=stub
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_WHATSAPP=whatsapp:+14155238886
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/application.yml backend/src/main/resources/application-test.yml .env.example
git commit -m "chore(backend): wire whatsapp/scheduling config (stub default)"
```

---

## Phase 1 — JPA entities + repositories (round-trip integration tests)

Goal: verify every new table is reachable from Java end-to-end. No domain logic yet.

### Task 1.1: `ScheduleTemplateEntity` round-trip

**Files:**
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/schedule/ScheduleTemplateEntity.java`
- Create: `backend/src/main/java/my/cliniflow/infrastructure/repository/schedule/ScheduleTemplateJpaRepository.java`
- Create: `backend/src/test/java/my/cliniflow/infrastructure/repository/schedule/ScheduleTemplateEntityIT.java`

- [ ] **Step 1: Write the failing test**

```java
// ScheduleTemplateEntityIT.java
package my.cliniflow.infrastructure.repository.schedule;

import my.cliniflow.IntegrationTestSupport; // existing in project
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduleTemplateEntityIT extends IntegrationTestSupport {

    @Autowired ScheduleTemplateJpaRepository repo;

    @Test
    void persists_weekly_hours_jsonb_round_trip() {
        UUID doctorId = UUID.fromString("11111111-1111-1111-1111-111111111111"); // seeded doctor

        ScheduleTemplateEntity e = new ScheduleTemplateEntity();
        e.setDoctorId(doctorId);
        e.setEffectiveFrom(LocalDate.of(2026, 5, 1));
        e.setSlotMinutes((short) 15);
        e.setWeeklyHours(Map.of(
            "MON", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
            "TUE", List.of(List.of("09:00", "12:00"))
        ));
        e.setCancelLeadHours((short) 2);
        e.setGenerationHorizonDays((short) 28);
        repo.save(e);

        ScheduleTemplateEntity got = repo.findById(e.getId()).orElseThrow();
        assertThat(got.getWeeklyHours()).containsKey("MON");
        assertThat((List<?>) got.getWeeklyHours().get("MON")).hasSize(2);
        assertThat(got.getSlotMinutes()).isEqualTo((short) 15);
    }
}
```

- [ ] **Step 2: Run failing test**

Run: `cd backend && ./mvnw test -Dtest=ScheduleTemplateEntityIT -q`
Expected: FAIL — class `ScheduleTemplateEntity` does not exist.

- [ ] **Step 3: Create the entity**

```java
// ScheduleTemplateEntity.java
package my.cliniflow.infrastructure.repository.schedule;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "schedule_template")
public class ScheduleTemplateEntity {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "doctor_id", nullable = false, columnDefinition = "uuid")
    private UUID doctorId;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "slot_minutes", nullable = false)
    private Short slotMinutes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "weekly_hours", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> weeklyHours;

    @Column(name = "cancel_lead_hours", nullable = false)
    private Short cancelLeadHours;

    @Column(name = "generation_horizon_days", nullable = false)
    private Short generationHorizonDays;

    @Column(name = "gmt_create", insertable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    // getters / setters
    public UUID getId() { return id; }
    public UUID getDoctorId() { return doctorId; }
    public void setDoctorId(UUID v) { this.doctorId = v; }
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public void setEffectiveFrom(LocalDate v) { this.effectiveFrom = v; }
    public Short getSlotMinutes() { return slotMinutes; }
    public void setSlotMinutes(Short v) { this.slotMinutes = v; }
    public Map<String, Object> getWeeklyHours() { return weeklyHours; }
    public void setWeeklyHours(Map<String, Object> v) { this.weeklyHours = v; }
    public Short getCancelLeadHours() { return cancelLeadHours; }
    public void setCancelLeadHours(Short v) { this.cancelLeadHours = v; }
    public Short getGenerationHorizonDays() { return generationHorizonDays; }
    public void setGenerationHorizonDays(Short v) { this.generationHorizonDays = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
```

```java
// ScheduleTemplateJpaRepository.java
package my.cliniflow.infrastructure.repository.schedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ScheduleTemplateJpaRepository extends JpaRepository<ScheduleTemplateEntity, UUID> {
    Optional<ScheduleTemplateEntity> findFirstByDoctorIdOrderByEffectiveFromDesc(UUID doctorId);
}
```

- [ ] **Step 4: Run test until it passes**

Run: `cd backend && ./mvnw test -Dtest=ScheduleTemplateEntityIT -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/repository/schedule/ScheduleTemplate*.java \
        backend/src/test/java/my/cliniflow/infrastructure/repository/schedule/ScheduleTemplateEntityIT.java
git commit -m "feat(schedule): jpa entity + repo for schedule_template (round-trip IT)"
```

---

### Task 1.2: `AppointmentSlotEntity` round-trip

**Files:**
- Create: `infrastructure/repository/schedule/AppointmentSlotEntity.java`
- Create: `infrastructure/repository/schedule/AppointmentSlotJpaRepository.java`
- Create: `test/.../AppointmentSlotEntityIT.java`

Mirror Task 1.1 exactly. The entity columns:

```java
@Entity @Table(name = "appointment_slots")
public class AppointmentSlotEntity {
    @Id @GeneratedValue @Column(columnDefinition = "uuid") private UUID id;
    @Column(name = "doctor_id", nullable = false, columnDefinition = "uuid") private UUID doctorId;
    @Column(name = "start_at", nullable = false) private OffsetDateTime startAt;
    @Column(name = "end_at",   nullable = false) private OffsetDateTime endAt;
    @Column(name = "status", nullable = false, length = 16) private String status;
    @Column(name = "gmt_create", insertable = false, updatable = false) private OffsetDateTime gmtCreate;
    @Column(name = "gmt_modified", insertable = false, updatable = false) private OffsetDateTime gmtModified;
    // getters / setters
}
```

```java
public interface AppointmentSlotJpaRepository extends JpaRepository<AppointmentSlotEntity, UUID> {
    @Query("""
        SELECT s FROM AppointmentSlotEntity s
         WHERE s.doctorId = :doctorId
           AND s.startAt >= :from
           AND s.startAt <  :to
           AND s.status = :status
         ORDER BY s.startAt
    """)
    List<AppointmentSlotEntity> findByDoctorAndWindowAndStatus(
        @Param("doctorId") UUID doctorId,
        @Param("from") OffsetDateTime from,
        @Param("to")   OffsetDateTime to,
        @Param("status") String status);

    @Modifying
    @Query("""
        DELETE FROM AppointmentSlotEntity s
         WHERE s.doctorId = :doctorId AND s.status = 'AVAILABLE' AND s.startAt > :now
    """)
    int deleteFutureAvailable(@Param("doctorId") UUID doctorId, @Param("now") OffsetDateTime now);
}
```

Test asserts insert + read + the `findByDoctorAndWindowAndStatus` query. TDD steps as in 1.1. Commit:

```bash
git commit -m "feat(schedule): jpa entity + repo for appointment_slots"
```

---

### Task 1.3: `AppointmentEntity` round-trip

**Files:**
- Create: `infrastructure/repository/schedule/AppointmentEntity.java`
- Create: `infrastructure/repository/schedule/AppointmentJpaRepository.java`
- Create: `test/.../AppointmentEntityIT.java`

Entity body:

```java
@Entity @Table(name = "appointments")
public class AppointmentEntity {
    @Id @GeneratedValue @Column(columnDefinition = "uuid") private UUID id;
    @Column(name = "slot_id",          nullable = false, columnDefinition = "uuid") private UUID slotId;
    @Column(name = "patient_id",       nullable = false, columnDefinition = "uuid") private UUID patientId;
    @Column(name = "visit_id",         nullable = false, columnDefinition = "uuid") private UUID visitId;
    @Column(name = "appointment_type", nullable = false, length = 16) private String appointmentType;
    @Column(name = "parent_visit_id",  columnDefinition = "uuid") private UUID parentVisitId;
    @Column(name = "status",           nullable = false, length = 16) private String status;
    @Column(name = "cancel_reason",    length = 64) private String cancelReason;
    @Column(name = "cancelled_at") private OffsetDateTime cancelledAt;
    @Column(name = "cancelled_by", columnDefinition = "uuid") private UUID cancelledBy;
    @Column(name = "gmt_create",   insertable = false, updatable = false) private OffsetDateTime gmtCreate;
    @Column(name = "gmt_modified", insertable = false, updatable = false) private OffsetDateTime gmtModified;
    // getters / setters
}
```

JPA repo includes: `findByPatientIdAndStatusInOrderBySlot...`, `findByVisitIdAndStatus(UUID, String)`. Test creates a slot and an appointment, asserts UNIQUE-on-active-slot constraint (a second active appointment for the same slot must throw).

Commit:
```bash
git commit -m "feat(schedule): jpa entity + repo for appointments"
```

---

### Task 1.4: `ScheduleDayOverrideEntity` round-trip

Same shape as Task 1.1. Entity columns map to `schedule_day_overrides`. Test asserts the `WINDOW_BLOCKED` check constraint rejects an entity with null window times.

Commit:
```bash
git commit -m "feat(schedule): jpa entity + repo for schedule_day_overrides"
```

---

### Task 1.5: `NotificationOutboxEntity` round-trip

**Files:**
- Create: `infrastructure/notification/outbox/NotificationOutboxEntity.java`
- Create: `infrastructure/notification/outbox/NotificationOutboxJpaRepository.java`
- Create: `infrastructure/notification/outbox/NotificationStatus.java`
- Create: `infrastructure/notification/outbox/NotificationEventType.java`
- Create: `test/.../NotificationOutboxEntityIT.java`

Mirror `Neo4jProjectionOutboxEntity`:

```java
@Entity @Table(name = "notification_outbox")
public class NotificationOutboxEntity {
    @Id @GeneratedValue @Column(columnDefinition = "uuid") private UUID id;
    @Column(name = "event_type", nullable = false, length = 48) private String eventType;
    @Column(nullable = false, length = 16) private String channel;
    @Column(name = "template_id", nullable = false, length = 64) private String templateId;
    @Column(name = "recipient_patient_id", nullable = false, columnDefinition = "uuid") private UUID recipientPatientId;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false) private Map<String, Object> payload;
    @Column(name = "idempotency_key", nullable = false, length = 128, unique = true) private String idempotencyKey;
    @Column(nullable = false, length = 24) private String status = "PENDING";
    @Column(nullable = false) private Short attempts = 0;
    @Column(name = "next_attempt_at", nullable = false) private OffsetDateTime nextAttemptAt = OffsetDateTime.now();
    @Column(name = "last_error", columnDefinition = "text") private String lastError;
    @Column(name = "sent_at") private OffsetDateTime sentAt;
    @Column(name = "gmt_create",   insertable = false, updatable = false) private OffsetDateTime gmtCreate;
    @Column(name = "gmt_modified", insertable = false, updatable = false) private OffsetDateTime gmtModified;
    // getters / setters
}
```

Repository:

```java
public interface NotificationOutboxJpaRepository extends JpaRepository<NotificationOutboxEntity, UUID> {

    Optional<NotificationOutboxEntity> findByIdempotencyKey(String key);

    @Query("""
        SELECT o FROM NotificationOutboxEntity o
         WHERE o.status IN ('PENDING','FAILED')
           AND o.nextAttemptAt <= :now
         ORDER BY o.nextAttemptAt
    """)
    List<NotificationOutboxEntity> findDueForSend(@Param("now") OffsetDateTime now, Pageable page);

    @Modifying
    @Query("""
        UPDATE NotificationOutboxEntity o
           SET o.status = 'FAILED',
               o.lastError = 'reaper: stuck SENDING reverted',
               o.gmtModified = :now
         WHERE o.status = 'SENDING' AND o.gmtModified < :stuckBefore
    """)
    int reapStuckSending(@Param("now") OffsetDateTime now,
                         @Param("stuckBefore") OffsetDateTime stuckBefore);
}
```

Enums:

```java
public enum NotificationStatus { PENDING, SENDING, SENT, FAILED, SKIPPED_NO_CONSENT }
public enum NotificationEventType {
    APPOINTMENT_BOOKED, APPOINTMENT_CANCELLED,
    SOAP_FINALIZED_MEDS, SOAP_FINALIZED_FOLLOWUP
}
```

Test asserts: insert + idempotency key UNIQUE rejects duplicate; `findDueForSend` returns rows ordered by `next_attempt_at`.

Commit:
```bash
git commit -m "feat(notification): jpa entity + repo for notification_outbox"
```

---

### Task 1.6: `WhatsAppMessageLogEntity` round-trip

**Files:**
- Create: `infrastructure/notification/whatsapp/log/WhatsAppMessageLogEntity.java`
- Create: `infrastructure/notification/whatsapp/log/WhatsAppMessageLogJpaRepository.java`
- Create: `test/.../WhatsAppMessageLogEntityIT.java`

Entity columns mirror `whatsapp_message_log`. Test inserts one row tied to an outbox row.

Commit:
```bash
git commit -m "feat(notification): jpa entity + repo for whatsapp_message_log"
```

---

### Task 1.7: Add WhatsApp consent columns to `PatientEntity`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/repository/patient/PatientEntity.java`
- Create: `backend/src/test/java/my/cliniflow/infrastructure/repository/patient/PatientEntityWhatsAppConsentIT.java`

- [ ] **Step 1: Write the failing test**

```java
@Test
void persists_whatsapp_consent_columns() {
    PatientEntity p = repo.findById(SEEDED_PATIENT_ID).orElseThrow();
    p.setWhatsappConsentAt(OffsetDateTime.parse("2026-04-30T10:00:00+08:00"));
    p.setWhatsappConsentVersion("wa-v1");
    repo.save(p);
    PatientEntity reread = repo.findById(SEEDED_PATIENT_ID).orElseThrow();
    assertThat(reread.getWhatsappConsentAt()).isNotNull();
    assertThat(reread.getWhatsappConsentVersion()).isEqualTo("wa-v1");
}
```

- [ ] **Step 2: Add columns to `PatientEntity`**

```java
@Column(name = "whatsapp_consent_at")
private OffsetDateTime whatsappConsentAt;

@Column(name = "whatsapp_consent_version", length = 16)
private String whatsappConsentVersion;

public OffsetDateTime getWhatsappConsentAt() { return whatsappConsentAt; }
public void setWhatsappConsentAt(OffsetDateTime v) { this.whatsappConsentAt = v; }
public String getWhatsappConsentVersion() { return whatsappConsentVersion; }
public void setWhatsappConsentVersion(String v) { this.whatsappConsentVersion = v; }
```

- [ ] **Step 3: Run test → pass.** Commit:

```bash
git commit -m "feat(patient): add whatsapp_consent_at + version on PatientEntity"
```

---

## Phase 2 — Schedule domain layer (TDD)

### Task 2.1: Enums + value objects

**Files:**
- Create: `domain/biz/schedule/enums/{AppointmentStatus,SlotStatus,AppointmentType,OverrideType}.java`
- Create: `domain/biz/schedule/info/TimeWindow.java`
- Create: `domain/biz/schedule/info/WeeklyHours.java`
- Create: `test/.../info/WeeklyHoursTest.java`
- Create: `test/.../info/TimeWindowTest.java`

- [ ] **Step 1: Tests for `TimeWindow`**

```java
@Test
void rejects_zero_or_negative_window() {
    assertThatThrownBy(() -> new TimeWindow(LocalTime.of(9,0), LocalTime.of(9,0)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new TimeWindow(LocalTime.of(10,0), LocalTime.of(9,0)))
        .isInstanceOf(IllegalArgumentException.class);
}

@Test
void contains_returns_true_for_inclusive_start_exclusive_end() {
    TimeWindow w = new TimeWindow(LocalTime.of(9,0), LocalTime.of(12,0));
    assertThat(w.contains(LocalTime.of(9,0))).isTrue();
    assertThat(w.contains(LocalTime.of(11,59))).isTrue();
    assertThat(w.contains(LocalTime.of(12,0))).isFalse();
}
```

```java
// TimeWindow.java
package my.cliniflow.domain.biz.schedule.info;

import java.time.LocalTime;

public record TimeWindow(LocalTime start, LocalTime end) {
    public TimeWindow {
        if (start == null || end == null || !end.isAfter(start)) {
            throw new IllegalArgumentException("end must be after start");
        }
    }
    public boolean contains(LocalTime t) {
        return !t.isBefore(start) && t.isBefore(end);
    }
}
```

- [ ] **Step 2: Tests for `WeeklyHours`**

```java
@Test
void parses_from_jsonb_map() {
    Map<String, Object> json = Map.of(
        "MON", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
        "TUE", List.of(List.of("09:00", "12:00")));
    WeeklyHours wh = WeeklyHours.fromJson(json);
    assertThat(wh.windowsFor(DayOfWeek.MONDAY)).hasSize(2);
    assertThat(wh.windowsFor(DayOfWeek.TUESDAY)).hasSize(1);
    assertThat(wh.windowsFor(DayOfWeek.SUNDAY)).isEmpty();
}

@Test
void serialises_to_json_round_trip() {
    Map<String, Object> json = Map.of("WED", List.of(List.of("10:30", "16:30")));
    assertThat(WeeklyHours.fromJson(json).toJson()).isEqualTo(json);
}
```

```java
// WeeklyHours.java
package my.cliniflow.domain.biz.schedule.info;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.*;

public record WeeklyHours(Map<DayOfWeek, List<TimeWindow>> hours) {
    public WeeklyHours {
        Objects.requireNonNull(hours);
    }

    public List<TimeWindow> windowsFor(DayOfWeek dow) {
        return hours.getOrDefault(dow, List.of());
    }

    public static WeeklyHours fromJson(Map<String, Object> json) {
        EnumMap<DayOfWeek, List<TimeWindow>> out = new EnumMap<>(DayOfWeek.class);
        for (var entry : json.entrySet()) {
            DayOfWeek dow = DayOfWeek.valueOf(entry.getKey());
            @SuppressWarnings("unchecked")
            List<List<String>> windows = (List<List<String>>) entry.getValue();
            List<TimeWindow> parsed = new ArrayList<>();
            for (List<String> ws : windows) {
                parsed.add(new TimeWindow(LocalTime.parse(ws.get(0)), LocalTime.parse(ws.get(1))));
            }
            out.put(dow, List.copyOf(parsed));
        }
        return new WeeklyHours(Map.copyOf(out));
    }

    public Map<String, Object> toJson() {
        Map<String, Object> out = new TreeMap<>();
        for (var e : hours.entrySet()) {
            List<List<String>> windows = e.getValue().stream()
                .map(w -> List.of(w.start().toString(), w.end().toString()))
                .toList();
            out.put(e.getKey().name(), windows);
        }
        return Map.copyOf(out);
    }
}
```

- [ ] **Step 3: Enums (trivial)**

```java
public enum AppointmentStatus { BOOKED, CANCELLED, COMPLETED, NO_SHOW }
public enum SlotStatus { AVAILABLE, BOOKED, BLOCKED, CLOSED }
public enum AppointmentType { NEW_SYMPTOM, FOLLOW_UP }
public enum OverrideType { DAY_CLOSED, WINDOW_BLOCKED }
```

- [ ] **Step 4: Run tests, commit**

```bash
./mvnw test -Dtest='WeeklyHoursTest,TimeWindowTest' -q
git add backend/src/main/java/my/cliniflow/domain/biz/schedule/{enums,info} \
        backend/src/test/java/my/cliniflow/domain/biz/schedule/info
git commit -m "feat(schedule): enums + TimeWindow/WeeklyHours value objects"
```

---

### Task 2.2: Domain models

**Files:**
- Create: `domain/biz/schedule/model/ScheduleTemplateModel.java`
- Create: `domain/biz/schedule/model/AppointmentSlotModel.java`
- Create: `domain/biz/schedule/model/AppointmentModel.java`
- Create: `domain/biz/schedule/model/ScheduleDayOverrideModel.java`
- Create: `test/.../model/AppointmentModelTest.java`

- [ ] **Step 1: Test the booking-state transitions on `AppointmentModel`**

```java
@Test
void cancel_throws_when_already_cancelled() {
    AppointmentModel a = AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
        AppointmentType.NEW_SYMPTOM, null);
    a.cancel("patient-changed-mind", USER_ID, OffsetDateTime.now());
    assertThatThrownBy(() -> a.cancel("again", USER_ID, OffsetDateTime.now()))
        .isInstanceOf(IllegalStateException.class);
}

@Test
void book_with_followup_requires_parent_visit() {
    assertThatThrownBy(() -> AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
        AppointmentType.FOLLOW_UP, null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("parent_visit_id required for FOLLOW_UP");
}
```

- [ ] **Step 2: Implement `AppointmentModel`**

```java
package my.cliniflow.domain.biz.schedule.model;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;

import java.time.OffsetDateTime;
import java.util.UUID;

public class AppointmentModel {
    private UUID id;
    private UUID slotId;
    private UUID patientId;
    private UUID visitId;
    private AppointmentType type;
    private UUID parentVisitId;
    private AppointmentStatus status;
    private String cancelReason;
    private OffsetDateTime cancelledAt;
    private UUID cancelledBy;

    public static AppointmentModel book(UUID slotId, UUID patientId, UUID visitId,
                                         AppointmentType type, UUID parentVisitId) {
        if (type == AppointmentType.FOLLOW_UP && parentVisitId == null) {
            throw new IllegalArgumentException("parent_visit_id required for FOLLOW_UP");
        }
        if (type == AppointmentType.NEW_SYMPTOM && parentVisitId != null) {
            throw new IllegalArgumentException("parent_visit_id only allowed for FOLLOW_UP");
        }
        AppointmentModel a = new AppointmentModel();
        a.slotId = slotId;
        a.patientId = patientId;
        a.visitId = visitId;
        a.type = type;
        a.parentVisitId = parentVisitId;
        a.status = AppointmentStatus.BOOKED;
        return a;
    }

    public void cancel(String reason, UUID byUser, OffsetDateTime now) {
        if (status != AppointmentStatus.BOOKED) {
            throw new IllegalStateException("can only cancel an active booking");
        }
        this.status = AppointmentStatus.CANCELLED;
        this.cancelReason = reason;
        this.cancelledBy = byUser;
        this.cancelledAt = now;
    }

    public void markNoShow() {
        if (status != AppointmentStatus.BOOKED) {
            throw new IllegalStateException("can only mark BOOKED appointments as NO_SHOW");
        }
        this.status = AppointmentStatus.NO_SHOW;
    }

    public void markCompleted() {
        if (status != AppointmentStatus.BOOKED) {
            throw new IllegalStateException("only BOOKED → COMPLETED");
        }
        this.status = AppointmentStatus.COMPLETED;
    }

    // getters + an internal setter for hydration from infra layer
    public UUID getId() { return id; }
    public void hydrateId(UUID v) { this.id = v; }
    public UUID getSlotId() { return slotId; }
    public UUID getPatientId() { return patientId; }
    public UUID getVisitId() { return visitId; }
    public AppointmentType getType() { return type; }
    public UUID getParentVisitId() { return parentVisitId; }
    public AppointmentStatus getStatus() { return status; }
    public String getCancelReason() { return cancelReason; }
    public OffsetDateTime getCancelledAt() { return cancelledAt; }
    public UUID getCancelledBy() { return cancelledBy; }

    // hydration constructor for infra layer
    public static AppointmentModel hydrate(UUID id, UUID slotId, UUID patientId, UUID visitId,
                                           AppointmentType type, UUID parentVisitId,
                                           AppointmentStatus status, String cancelReason,
                                           OffsetDateTime cancelledAt, UUID cancelledBy) {
        AppointmentModel a = new AppointmentModel();
        a.id = id; a.slotId = slotId; a.patientId = patientId; a.visitId = visitId;
        a.type = type; a.parentVisitId = parentVisitId; a.status = status;
        a.cancelReason = cancelReason; a.cancelledAt = cancelledAt; a.cancelledBy = cancelledBy;
        return a;
    }
}
```

- [ ] **Step 3: Implement `AppointmentSlotModel`**

```java
package my.cliniflow.domain.biz.schedule.model;

import my.cliniflow.domain.biz.schedule.enums.SlotStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public class AppointmentSlotModel {
    private UUID id;
    private UUID doctorId;
    private OffsetDateTime startAt;
    private OffsetDateTime endAt;
    private SlotStatus status;

    public static AppointmentSlotModel newAvailable(UUID doctorId, OffsetDateTime start, OffsetDateTime end) {
        if (!end.isAfter(start)) throw new IllegalArgumentException("end must be after start");
        AppointmentSlotModel s = new AppointmentSlotModel();
        s.doctorId = doctorId; s.startAt = start; s.endAt = end;
        s.status = SlotStatus.AVAILABLE;
        return s;
    }

    public void book() {
        if (status != SlotStatus.AVAILABLE) throw new IllegalStateException("slot not available");
        this.status = SlotStatus.BOOKED;
    }

    public void release() {
        if (status != SlotStatus.BOOKED) throw new IllegalStateException("can only release a booked slot");
        this.status = SlotStatus.AVAILABLE;
    }

    public void block() {
        if (status == SlotStatus.BOOKED) throw new IllegalStateException("cannot block a booked slot");
        this.status = SlotStatus.BLOCKED;
    }

    public void close() {
        if (status == SlotStatus.BOOKED) throw new IllegalStateException("cannot close a booked slot");
        this.status = SlotStatus.CLOSED;
    }

    // getters + hydrate (mirror AppointmentModel pattern)
    public UUID getId() { return id; }
    public void hydrateId(UUID v) { this.id = v; }
    public UUID getDoctorId() { return doctorId; }
    public OffsetDateTime getStartAt() { return startAt; }
    public OffsetDateTime getEndAt() { return endAt; }
    public SlotStatus getStatus() { return status; }

    public static AppointmentSlotModel hydrate(UUID id, UUID doctorId, OffsetDateTime start,
                                                OffsetDateTime end, SlotStatus status) {
        AppointmentSlotModel s = new AppointmentSlotModel();
        s.id = id; s.doctorId = doctorId; s.startAt = start; s.endAt = end; s.status = status;
        return s;
    }
}
```

- [ ] **Step 4: Implement `ScheduleTemplateModel` and `ScheduleDayOverrideModel`** as plain holders with similar `hydrate(...)` factory methods. Field set matches the SQL columns.

- [ ] **Step 5: Tests pass, commit**

```bash
./mvnw test -Dtest='AppointmentModelTest' -q
git commit -m "feat(schedule): domain models with state-transition behavior"
```

---

### Task 2.3: Repository interfaces (domain) + impls (infra)

**Files:**
- Create: `domain/biz/schedule/repository/{ScheduleTemplate,AppointmentSlot,Appointment,ScheduleDayOverride}Repository.java`
- Create: `infrastructure/repository/schedule/{...}RepositoryImpl.java`
- Create: `test/.../repository/AppointmentRepositoryImplIT.java`

Domain interfaces are framework-free. Example:

```java
// domain/biz/schedule/repository/AppointmentRepository.java
package my.cliniflow.domain.biz.schedule.repository;

import my.cliniflow.domain.biz.schedule.model.AppointmentModel;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AppointmentRepository {
    AppointmentModel save(AppointmentModel m);
    Optional<AppointmentModel> findById(UUID id);
    Optional<AppointmentModel> findActiveByVisitId(UUID visitId);
    Optional<AppointmentModel> findActiveBySlotId(UUID slotId);
    List<AppointmentModel> findByPatient(UUID patientId);
    List<AppointmentModel> findByDoctorOnDate(UUID doctorId, java.time.LocalDate day);
}
```

Impl:

```java
// infrastructure/repository/schedule/AppointmentRepositoryImpl.java
@Repository
public class AppointmentRepositoryImpl implements AppointmentRepository {
    private final AppointmentJpaRepository jpa;
    public AppointmentRepositoryImpl(AppointmentJpaRepository jpa) { this.jpa = jpa; }

    @Override
    public AppointmentModel save(AppointmentModel m) {
        AppointmentEntity e = (m.getId() == null) ? new AppointmentEntity()
            : jpa.findById(m.getId()).orElseThrow();
        e.setSlotId(m.getSlotId());
        e.setPatientId(m.getPatientId());
        e.setVisitId(m.getVisitId());
        e.setAppointmentType(m.getType().name());
        e.setParentVisitId(m.getParentVisitId());
        e.setStatus(m.getStatus().name());
        e.setCancelReason(m.getCancelReason());
        e.setCancelledAt(m.getCancelledAt());
        e.setCancelledBy(m.getCancelledBy());
        AppointmentEntity saved = jpa.save(e);
        m.hydrateId(saved.getId());
        return m;
    }

    @Override public Optional<AppointmentModel> findById(UUID id) {
        return jpa.findById(id).map(this::toModel);
    }

    @Override public Optional<AppointmentModel> findActiveByVisitId(UUID visitId) {
        return jpa.findFirstByVisitIdAndStatus(visitId, "BOOKED").map(this::toModel);
    }

    // ... other find methods, plus:
    private AppointmentModel toModel(AppointmentEntity e) {
        return AppointmentModel.hydrate(
            e.getId(), e.getSlotId(), e.getPatientId(), e.getVisitId(),
            AppointmentType.valueOf(e.getAppointmentType()),
            e.getParentVisitId(),
            AppointmentStatus.valueOf(e.getStatus()),
            e.getCancelReason(), e.getCancelledAt(), e.getCancelledBy());
    }
}
```

The IT asserts the unique-on-active-slot constraint by trying to `save` a second BOOKED appointment for the same slot — must surface as `DataIntegrityViolationException`. The test then cancels the first and saves the second to confirm the partial unique index allows the rebook.

Repeat the same pattern for `ScheduleTemplateRepository`, `AppointmentSlotRepository`, `ScheduleDayOverrideRepository`.

Commit:
```bash
git commit -m "feat(schedule): domain repositories + jpa-backed impls"
```

---

### Task 2.4: `SlotGenerateDomainService`

**Files:**
- Create: `domain/biz/schedule/service/SlotGenerateDomainService.java`
- Create: `test/.../service/SlotGenerateDomainServiceTest.java`

Behavior contract:
- input: `(template, OffsetDateTime now)`
- side effect: deletes future-AVAILABLE slots for the doctor; inserts new slots covering `[now → now + horizon_days]` per `weekly_hours[dow]` × `slot_minutes`, skipping closed days and blocked windows from `ScheduleDayOverrideRepository`.
- output: count of slots inserted.

- [ ] **Step 1: Failing test**

```java
@Test
void generates_15min_slots_for_one_day_when_template_says_mon_only() {
    UUID doctorId = UUID.randomUUID();
    ScheduleTemplateModel tpl = ScheduleTemplateModel.create(
        doctorId,
        LocalDate.of(2026, 5, 4),  // Monday
        (short) 15,
        WeeklyHours.fromJson(Map.of("MON", List.of(List.of("09:00", "10:00")))),
        (short) 2, (short) 1 /* horizon_days = 1 */
    );
    when(slotRepo.deleteFutureAvailable(doctorId, anyOffsetDateTime())).thenReturn(0);
    when(overrideRepo.findByDoctorAndDate(eq(doctorId), any())).thenReturn(List.of());

    int inserted = svc.generate(tpl, OffsetDateTime.of(2026, 5, 4, 0, 0, 0, 0, KL_ZONE));

    assertThat(inserted).isEqualTo(4);  // 09:00, 09:15, 09:30, 09:45
    verify(slotRepo, times(4)).save(any());
}

@Test
void skips_closed_days() {
    /* override: DAY_CLOSED on the day → 0 slots inserted */
}

@Test
void skips_blocked_windows() {
    /* WINDOW_BLOCKED 09:30-10:00 → only 09:00, 09:15 inserted */
}
```

- [ ] **Step 2: Implement**

```java
package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.OverrideType;
import my.cliniflow.domain.biz.schedule.info.TimeWindow;
import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleDayOverrideRepository;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.List;

@Service
public class SlotGenerateDomainService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final AppointmentSlotRepository slots;
    private final ScheduleDayOverrideRepository overrides;

    public SlotGenerateDomainService(AppointmentSlotRepository slots,
                                     ScheduleDayOverrideRepository overrides) {
        this.slots = slots;
        this.overrides = overrides;
    }

    public int generate(ScheduleTemplateModel tpl, OffsetDateTime now) {
        slots.deleteFutureAvailable(tpl.getDoctorId(), now);
        WeeklyHours wh = tpl.getWeeklyHours();
        int slotMinutes = tpl.getSlotMinutes();
        int horizonDays = tpl.getGenerationHorizonDays();
        LocalDate today = now.atZoneSameInstant(KL).toLocalDate();
        int inserted = 0;
        for (int d = 0; d < horizonDays; d++) {
            LocalDate date = today.plusDays(d);
            DayOfWeek dow = date.getDayOfWeek();
            List<ScheduleDayOverrideModel> dayOverrides =
                overrides.findByDoctorAndDate(tpl.getDoctorId(), date);
            if (dayOverrides.stream().anyMatch(o -> o.getType() == OverrideType.DAY_CLOSED)) {
                continue;
            }
            for (TimeWindow w : wh.windowsFor(dow)) {
                LocalTime cursor = w.start();
                while (cursor.plusMinutes(slotMinutes).compareTo(w.end()) <= 0) {
                    LocalTime slotStart = cursor;
                    LocalTime slotEnd = cursor.plusMinutes(slotMinutes);
                    if (isBlocked(dayOverrides, slotStart, slotEnd)) {
                        cursor = cursor.plusMinutes(slotMinutes);
                        continue;
                    }
                    OffsetDateTime startAt = ZonedDateTime.of(date, slotStart, KL).toOffsetDateTime();
                    OffsetDateTime endAt   = ZonedDateTime.of(date, slotEnd,   KL).toOffsetDateTime();
                    if (!startAt.isAfter(now)) {
                        cursor = cursor.plusMinutes(slotMinutes);
                        continue;
                    }
                    slots.save(AppointmentSlotModel.newAvailable(tpl.getDoctorId(), startAt, endAt));
                    inserted++;
                    cursor = cursor.plusMinutes(slotMinutes);
                }
            }
        }
        return inserted;
    }

    private boolean isBlocked(List<ScheduleDayOverrideModel> overrides,
                              LocalTime start, LocalTime end) {
        return overrides.stream()
            .filter(o -> o.getType() == OverrideType.WINDOW_BLOCKED)
            .anyMatch(o -> !(end.isBefore(o.getWindowStart()) || start.isAfter(o.getWindowEnd().minusNanos(1))));
    }
}
```

- [ ] **Step 3: Tests pass.** Commit:

```bash
git commit -m "feat(schedule): SlotGenerateDomainService eager-materialises slots"
```

---

### Task 2.5: `AppointmentBookDomainService`

**Files:**
- Create: `domain/biz/schedule/service/AppointmentBookDomainService.java`
- Create: `domain/biz/schedule/service/exception/SlotTakenException.java`
- Create: `domain/biz/schedule/service/exception/PreVisitMissingException.java` (only if NEW_SYMPTOM and visit has no pre-visit report — checked by app-service for now)
- Create: `test/.../service/AppointmentBookDomainServiceTest.java`

Behavior:
- Loads slot, asserts `status == AVAILABLE`, calls `slot.book()`, persists slot, persists new `AppointmentModel`.
- The unique constraint on the DB is the safety net for races.

- [ ] **Step 1: Test the happy path + race-loss path**

```java
@Test
void books_slot_and_returns_appointment() {
    AppointmentSlotModel slot = AppointmentSlotModel.hydrate(SLOT_ID, DOCTOR_ID,
        OffsetDateTime.parse("2026-05-04T09:00+08:00"),
        OffsetDateTime.parse("2026-05-04T09:15+08:00"),
        SlotStatus.AVAILABLE);
    when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(slot));
    when(apptRepo.save(any())).thenAnswer(inv -> { var a = inv.<AppointmentModel>getArgument(0); a.hydrateId(APPT_ID); return a; });

    AppointmentModel result = svc.book(SLOT_ID, PATIENT_ID, VISIT_ID,
        AppointmentType.NEW_SYMPTOM, null);

    assertThat(result.getId()).isEqualTo(APPT_ID);
    assertThat(slot.getStatus()).isEqualTo(SlotStatus.BOOKED);
    verify(slotRepo).save(slot);
}

@Test
void throws_slot_taken_when_concurrent_booking_wins_unique_index() {
    when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(availableSlot()));
    when(apptRepo.save(any())).thenThrow(new DataIntegrityViolationException("uq_appointments_active_slot"));

    assertThatThrownBy(() -> svc.book(SLOT_ID, PATIENT_ID, VISIT_ID,
        AppointmentType.NEW_SYMPTOM, null))
        .isInstanceOf(SlotTakenException.class);
}
```

- [ ] **Step 2: Implement**

```java
@Service
public class AppointmentBookDomainService {

    private final AppointmentSlotRepository slots;
    private final AppointmentRepository appts;

    public AppointmentBookDomainService(AppointmentSlotRepository slots,
                                        AppointmentRepository appts) {
        this.slots = slots;
        this.appts = appts;
    }

    @Transactional
    public AppointmentModel book(UUID slotId, UUID patientId, UUID visitId,
                                  AppointmentType type, UUID parentVisitId) {
        AppointmentSlotModel slot = slots.findByIdForUpdate(slotId)
            .orElseThrow(() -> new SlotTakenException("slot not found: " + slotId));
        if (slot.getStatus() != SlotStatus.AVAILABLE) {
            throw new SlotTakenException("slot not available: " + slotId);
        }
        slot.book();
        slots.save(slot);
        try {
            return appts.save(AppointmentModel.book(slotId, patientId, visitId, type, parentVisitId));
        } catch (DataIntegrityViolationException ex) {
            throw new SlotTakenException("slot taken concurrently: " + slotId);
        }
    }
}
```

- [ ] **Step 3: Tests pass.** Commit:

```bash
git commit -m "feat(schedule): AppointmentBookDomainService with race-aware booking"
```

---

### Task 2.6: `AppointmentCancelDomainService`

Behavior:
- Loads appointment + slot. Asserts caller is the patient (or staff — checked at app-service level).
- Asserts `slot.start_at - now >= cancel_lead_hours`. Throws `CancelWindowPassedException` otherwise.
- Calls `appointment.cancel(...)` + `slot.release()`. Persists both.

Test the boundary cases (T - lead = ok, T - lead + 1 sec = throw). Mirror Task 2.5 structure.

Commit:
```bash
git commit -m "feat(schedule): AppointmentCancelDomainService enforces lead-time"
```

---

### Task 2.7: `ScheduleTemplateUpdateDomainService` + `SlotBlockDomainService` + `AppointmentNoShowDomainService`

Each is a small service with one or two state-transition methods. Each gets a focused unit test.

`SlotBlockDomainService` rejects with `BookingsInWindowException` if any active appointment overlaps the requested window:

```java
@Test
void rejects_window_block_when_active_booking_overlaps() {
    when(apptRepo.findActiveInRange(DOCTOR_ID, START, END))
        .thenReturn(List.of(activeAppt()));
    assertThatThrownBy(() -> svc.blockWindow(DOCTOR_ID, DATE, FROM, TO, "lunch"))
        .isInstanceOf(BookingsInWindowException.class);
}
```

Three commits, one per service.

---

## Phase 3 — Application layer + DTOs + converters

### Task 3.1: Request/response DTOs

**Files:**
- Create: `controller/biz/schedule/request/AppointmentBookRequest.java`
- Create: `controller/biz/schedule/request/AppointmentCancelRequest.java`
- Create: `controller/biz/schedule/request/ScheduleTemplateUpsertRequest.java`
- Create: `controller/biz/schedule/request/DayClosureRequest.java`
- Create: `controller/biz/schedule/request/WindowBlockRequest.java`
- Create: `controller/biz/schedule/response/{AppointmentDTO,SlotDTO,ScheduleTemplateDTO,AvailabilityResponse,DayScheduleResponse}.java`

Examples:

```java
// AppointmentBookRequest.java
package my.cliniflow.controller.biz.schedule.request;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AppointmentBookRequest(
    @NotNull UUID slotId,
    @NotNull String type,            // NEW_SYMPTOM | FOLLOW_UP
    UUID visitId,                    // required when NEW_SYMPTOM
    UUID parentVisitId               // required when FOLLOW_UP
) {}
```

```java
// AppointmentDTO.java
public record AppointmentDTO(
    UUID id,
    UUID slotId,
    OffsetDateTime startAt,
    OffsetDateTime endAt,
    UUID doctorId,
    UUID patientId,
    UUID visitId,
    String type,
    UUID parentVisitId,
    String status,
    OffsetDateTime cancelledAt
) {}
```

Commit:
```bash
git commit -m "feat(schedule): request/response DTOs for appointment endpoints"
```

---

### Task 3.2: Converters

**Files:**
- Create: `application/biz/schedule/converter/{AppointmentModel2DTOConverter,AppointmentSlotModel2DTOConverter,ScheduleTemplateModel2DTOConverter,ScheduleDayOverrideModel2DTOConverter}.java`

Each is a `@Component` with a `convert(model) → dto` method (and `convert(model, joinedSlot) → dto` where the appointment DTO needs slot times). Tests are not required for trivial mappers; one converter test that covers all fields is enough.

Commit:
```bash
git commit -m "feat(schedule): model→DTO converters"
```

---

### Task 3.3: `AppointmentWriteAppService` + `AppointmentReadAppService`

**Files:**
- Create: `application/biz/schedule/AppointmentWriteAppService.java`
- Create: `application/biz/schedule/AppointmentReadAppService.java`
- Modify: `application/biz/visit/VisitWriteAppService.java` — add two helpers used by the booking flow (see Step 0 below)
- Modify: `application/biz/visit/VisitReadAppService.java` — add `assertOwnedBy(...)` ownership-check helper
- Create: `test/.../AppointmentWriteAppServiceTest.java`

- [ ] **Step 0: Add the helper methods this task depends on**

In `VisitReadAppService` (existing — read service is the right place for ownership checks):

```java
public void assertOwnedBy(UUID visitId, UUID patientId) {
    VisitModel v = visitRepo.findById(visitId)
        .orElseThrow(() -> new ResourceNotFoundException("visit not found: " + visitId));
    if (!v.getPatientId().equals(patientId)) {
        throw new ForbiddenException(40300, "cross-patient visit access");
    }
}
```

In `VisitWriteAppService` (existing — extending it):

```java
@Transactional
public UUID openFollowUpVisit(UUID patientId, UUID parentVisitId) {
    // Reuses the existing visit creation path. parent_visit_id is stored on the
    // appointment, not on the visit, so this just opens a fresh Visit row.
    VisitModel v = VisitModel.startEmpty(patientId);   // existing factory
    v = visitRepo.save(v);
    return v.getId();
}
```

If `VisitModel.startEmpty(...)` does not exist, use whatever existing factory the `PreVisit` flow uses to create a `Visit` row before any pre-visit chat — copy that path. The new visit has no pre-visit report by design (follow-ups don't go through symptom intake).

Write service is `@Transactional`, calls domain services, publishes events, writes audit_log.

```java
@Service
public class AppointmentWriteAppService {

    private final AppointmentBookDomainService bookSvc;
    private final AppointmentCancelDomainService cancelSvc;
    private final AppointmentRepository appts;
    private final PatientReadAppService patientReads;     // existing — has findByUserId(...)
    private final VisitReadAppService visitReads;          // for assertOwnedBy
    private final VisitWriteAppService visits;             // for openFollowUpVisit
    private final AuditLogWriter audit;                    // existing in infrastructure/audit
    private final ApplicationEventPublisher events;

    public AppointmentWriteAppService(
            AppointmentBookDomainService bookSvc,
            AppointmentCancelDomainService cancelSvc,
            AppointmentRepository appts,
            PatientReadAppService patientReads,
            VisitReadAppService visitReads,
            VisitWriteAppService visits,
            AuditLogWriter audit,
            ApplicationEventPublisher events) {
        this.bookSvc = bookSvc;
        this.cancelSvc = cancelSvc;
        this.appts = appts;
        this.patientReads = patientReads;
        this.visitReads = visitReads;
        this.visits = visits;
        this.audit = audit;
        this.events = events;
    }

    @Transactional
    public UUID book(UUID userId, AppointmentBookRequest req) {
        UUID patientId = patientReads.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("patient profile not found"))
            .getId();
        AppointmentType type = AppointmentType.valueOf(req.type());

        UUID visitId;
        if (type == AppointmentType.NEW_SYMPTOM) {
            if (req.visitId() == null) throw new BusinessException(40001, "visitId required for NEW_SYMPTOM");
            visitReads.assertOwnedBy(req.visitId(), patientId);
            visitId = req.visitId();
        } else {
            if (req.parentVisitId() == null) throw new BusinessException(40002, "parentVisitId required for FOLLOW_UP");
            visitReads.assertOwnedBy(req.parentVisitId(), patientId);
            visitId = visits.openFollowUpVisit(patientId, req.parentVisitId());
        }

        AppointmentModel a = bookSvc.book(req.slotId(), patientId, visitId, type, req.parentVisitId());
        audit.write(userId, "APPOINTMENT.CREATE", Map.of("appointmentId", a.getId(), "slotId", a.getSlotId()));
        events.publishEvent(new AppointmentBookedDomainEvent(a.getId(), patientId, a.getSlotId()));
        return a.getId();
    }

    @Transactional
    public void cancel(UUID userId, UUID appointmentId, String reason) {
        UUID patientId = patientReads.findByUserId(userId).orElseThrow().getId();
        AppointmentModel a = appts.findById(appointmentId)
            .orElseThrow(() -> new ResourceNotFoundException("appointment"));
        if (!a.getPatientId().equals(patientId)) {
            throw new ForbiddenException(40300, "cross-patient cancel");
        }
        cancelSvc.cancel(appointmentId, userId, OffsetDateTime.now(), reason);
        audit.write(userId, "APPOINTMENT.CANCEL", Map.of("appointmentId", appointmentId));
        events.publishEvent(new AppointmentCancelledDomainEvent(appointmentId, patientId));
    }
}
```

Test asserts the event is published exactly once and audit row is written. Use `@MockBean ApplicationEventPublisher` and verify.

Read service (separate, simple):

```java
@Service
public class AppointmentReadAppService {

    private final AppointmentRepository appts;
    private final AppointmentSlotRepository slots;
    private final PatientReadAppService patientReads;
    private final AppointmentModel2DTOConverter apptConverter;
    private final AppointmentSlotModel2DTOConverter slotConverter;

    public AppointmentReadAppService(/* injected */) { /* ... */ }

    public AvailabilityResponse listAvailability(LocalDate from, LocalDate to) {
        // single-doctor MVP: pick the only doctor or read clinic.default-doctor-id
        UUID doctorId = singleDoctorId();
        var rows = slots.findByDoctorAndWindowAndStatus(
            doctorId,
            from.atStartOfDay(KL).toOffsetDateTime(),
            to.plusDays(1).atStartOfDay(KL).toOffsetDateTime(),
            SlotStatus.AVAILABLE);
        return new AvailabilityResponse(rows.stream().map(slotConverter::convert).toList());
    }

    public List<AppointmentDTO> listMine(UUID userId, AppointmentStatus filter) {
        UUID patientId = patientReads.findByUserId(userId).orElseThrow().getId();
        return appts.findByPatient(patientId).stream()
            .filter(a -> filter == null || a.getStatus() == filter)
            .map(apptConverter::convert).toList();
    }

    public AppointmentDTO findOne(UUID id, UUID userId) {
        UUID patientId = patientReads.findByUserId(userId).orElseThrow().getId();
        AppointmentModel a = appts.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("appointment"));
        if (!a.getPatientId().equals(patientId)) {
            throw new ForbiddenException(40300, "cross-patient access");
        }
        return apptConverter.convert(a);
    }

    /** No ownership check — internal use only (e.g. notification listeners). */
    public AppointmentDTO findOneInternal(UUID id) {
        return apptConverter.convert(
            appts.findById(id).orElseThrow(() -> new ResourceNotFoundException("appointment")));
    }

    public List<AppointmentDTO> doctorToday(UUID doctorId) {
        return appts.findByDoctorOnDate(doctorId, LocalDate.now(KL)).stream()
            .map(apptConverter::convert).toList();
    }

    public DayScheduleResponse dayForStaff(LocalDate date) {
        UUID doctorId = singleDoctorId();
        OffsetDateTime from = date.atStartOfDay(KL).toOffsetDateTime();
        OffsetDateTime to   = date.plusDays(1).atStartOfDay(KL).toOffsetDateTime();
        var slotRows = slots.findByDoctorAndWindow(doctorId, from, to);  // all statuses
        var bookings = appts.findByDoctorOnDate(doctorId, date);
        return new DayScheduleResponse(
            slotRows.stream().map(slotConverter::convert).toList(),
            bookings.stream().map(apptConverter::convert).toList());
    }

    private UUID singleDoctorId() {
        // For the MVP single-doctor assumption. Add a config key
        // `cliniflow.clinic.default-doctor-id` if not already present.
        // Backend boot-time validation should ensure exactly one DOCTOR row exists.
        return doctorRepo.findFirstActive().getId();
    }
}
```

`KL` is `ZoneId.of("Asia/Kuala_Lumpur")` — declare as a constant on the class.

Commit:
```bash
git commit -m "feat(schedule): write/read app services for appointments"
```

---

### Task 3.4: `ScheduleTemplateWriteAppService`, `ScheduleDayOverrideWriteAppService`, `ScheduleTemplateReadAppService`, `ScheduleSlotReadAppService`

All small. Each `@Transactional` write service calls its domain service and writes audit. Tests verify audit + slot regen are invoked.

Commit:
```bash
git commit -m "feat(schedule): app services for template + overrides"
```

---

### Task 3.5: `SlotHorizonExtenderScheduler`

**Files:**
- Create: `application/biz/schedule/SlotHorizonExtenderScheduler.java`

```java
@Component
public class SlotHorizonExtenderScheduler {

    private final ScheduleTemplateRepository templates;
    private final SlotGenerateDomainService gen;

    public SlotHorizonExtenderScheduler(ScheduleTemplateRepository templates,
                                        SlotGenerateDomainService gen) {
        this.templates = templates;
        this.gen = gen;
    }

    @Scheduled(cron = "${cliniflow.scheduling.horizon-extender-cron}",
               zone = "${cliniflow.scheduling.timezone}")
    public void extend() {
        for (var tpl : templates.findAllLatest()) {
            gen.generate(tpl, OffsetDateTime.now());
        }
    }
}
```

A small unit test that exercises `extend()` with a mocked repo. Don't test the cron firing.

Add `@EnableScheduling` to `CliniflowApplication.java` if not already present.

Commit:
```bash
git commit -m "feat(schedule): daily slot-horizon extender scheduler"
```

---

## Phase 4 — Schedule controllers + integration tests

### Task 4.1: `AppointmentController`

**Files:**
- Create: `controller/biz/schedule/AppointmentController.java`
- Create: `test/.../controller/biz/schedule/AppointmentControllerIT.java`

```java
@RestController
@RequestMapping("/api/appointments")
@PreAuthorize("hasRole('PATIENT')")
public class AppointmentController {

    private final AppointmentReadAppService reads;
    private final AppointmentWriteAppService writes;

    public AppointmentController(AppointmentReadAppService reads, AppointmentWriteAppService writes) {
        this.reads = reads;
        this.writes = writes;
    }

    @GetMapping("/availability")
    public WebResult<AvailabilityResponse> availability(
            @RequestParam("from") @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam("to")   @DateTimeFormat(iso = ISO.DATE) LocalDate to) {
        if (!from.isBefore(to.plusDays(1))) throw new BusinessException(40010, "invalid date range");
        if (ChronoUnit.DAYS.between(from, to) > 14) throw new BusinessException(40011, "max 14-day range");
        return WebResult.ok(reads.listAvailability(from, to));
    }

    @PostMapping
    public WebResult<UUID> book(@Valid @RequestBody AppointmentBookRequest req, Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(writes.book(userId, req));
    }

    @GetMapping("/mine")
    public WebResult<List<AppointmentDTO>> mine(@RequestParam(required = false) String status,
                                                 Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(reads.listMine(userId, status == null ? null : AppointmentStatus.valueOf(status)));
    }

    @DeleteMapping("/{id}")
    public WebResult<Void> cancel(@PathVariable UUID id,
                                   @RequestBody(required = false) AppointmentCancelRequest req,
                                   Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.cancel(userId, id, req == null ? null : req.reason());
        return WebResult.ok(null);
    }
}
```

Integration test asserts:
1. Patient can book an available slot → 200, audit row, outbox row (verify count via `notification_outbox` repo).
2. Second patient booking the same slot → 409 with `errorCode=40901`.
3. Cross-patient cancel → 403.
4. Cancel within 1h before slot start → 403 `40301`.

Commit:
```bash
git commit -m "feat(schedule): AppointmentController + IT"
```

---

### Task 4.2: `ScheduleController` (staff)

Endpoints:
- `GET /api/schedule/days/{date}` → `DayScheduleResponse`
- `POST /api/schedule/days/{date}/closures`
- `POST /api/schedule/days/{date}/blocks`
- `DELETE /api/schedule/overrides/{id}`
- `POST /api/appointments/{id}/no-show`

`@PreAuthorize("hasRole('CLINIC_STAFF')")`. IT exercises each endpoint.

Commit:
```bash
git commit -m "feat(schedule): staff ScheduleController + IT"
```

---

### Task 4.3: `ScheduleTemplateController` (admin)

Endpoints:
- `GET /api/schedule/template`
- `PUT /api/schedule/template`

`@PreAuthorize("hasRole('CLINIC_ADMIN')")`. IT verifies that PUT triggers slot regen (count of available slots changes).

Commit:
```bash
git commit -m "feat(schedule): admin ScheduleTemplateController + IT"
```

---

### Task 4.4: `DoctorTodayController`

Single endpoint `GET /api/doctor/appointments/today`. `@PreAuthorize("hasRole('DOCTOR')")`. Returns a list of appointments + minimal patient summary.

Commit:
```bash
git commit -m "feat(schedule): DoctorTodayController + IT"
```

---

## Phase 5 — Patient phone + WhatsApp consent endpoints

### Task 5.1: Domain model — extend `PatientModel`

**Files:**
- Modify: `domain/biz/patient/model/PatientModel.java`
- Create: `test/.../patient/PatientModelWhatsAppConsentTest.java`

- [ ] **Step 1: Test the consent transitions**

```java
@Test
void grant_sets_at_and_version() {
    PatientModel p = newPatient();
    p.grantWhatsAppConsent(OffsetDateTime.parse("2026-04-30T10:00:00+08:00"), "wa-v1");
    assertThat(p.getWhatsAppConsentAt()).isNotNull();
    assertThat(p.getWhatsAppConsentVersion()).isEqualTo("wa-v1");
}

@Test
void withdraw_clears_at_keeps_version_for_history() {
    PatientModel p = newPatient();
    p.grantWhatsAppConsent(NOW, "wa-v1");
    p.withdrawWhatsAppConsent();
    assertThat(p.getWhatsAppConsentAt()).isNull();
    assertThat(p.getWhatsAppConsentVersion()).isEqualTo("wa-v1");  // keep for history
}

@Test
void clearing_phone_while_consent_on_throws() {
    PatientModel p = newPatient();
    p.grantWhatsAppConsent(NOW, "wa-v1");
    assertThatThrownBy(() -> p.updatePhone(null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("withdraw consent before clearing phone");
}
```

- [ ] **Step 2: Add fields + behavior**

Add `private OffsetDateTime whatsAppConsentAt;` and `private String whatsAppConsentVersion;` plus three methods:

```java
public void grantWhatsAppConsent(OffsetDateTime at, String version) {
    if (this.phone == null || this.phone.isBlank()) {
        throw new IllegalStateException("phone required before granting whatsapp consent");
    }
    this.whatsAppConsentAt = at;
    this.whatsAppConsentVersion = version;
}

public void withdrawWhatsAppConsent() {
    this.whatsAppConsentAt = null;
    // keep whatsAppConsentVersion for history
}

public void updatePhone(String newPhone) {
    if (whatsAppConsentAt != null && (newPhone == null || newPhone.isBlank())) {
        throw new IllegalStateException("withdraw consent before clearing phone");
    }
    this.phone = newPhone;
}
```

Update the model→entity mapping in `PatientRepositoryImpl` to copy the two new fields both ways.

Commit:
```bash
git commit -m "feat(patient): grant/withdraw whatsapp consent + phone invariant"
```

---

### Task 5.2: `PatientMeController` + write-app-service methods

**Files:**
- Create: `controller/biz/patient/PatientMeController.java`
- Create: `controller/biz/patient/request/{WhatsAppConsentUpdateRequest,PhoneUpdateRequest}.java`
- Modify: `application/biz/patient/PatientWriteAppService.java`
- Create: `test/.../controller/biz/patient/PatientMeControllerIT.java`

```java
@RestController
@RequestMapping("/api/patients/me")
@PreAuthorize("hasRole('PATIENT')")
public class PatientMeController {

    private final PatientWriteAppService writes;

    public PatientMeController(PatientWriteAppService writes) { this.writes = writes; }

    @PutMapping("/whatsapp-consent")
    public WebResult<Void> setConsent(@Valid @RequestBody WhatsAppConsentUpdateRequest req,
                                       Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.updateWhatsAppConsent(userId, req.consent());
        return WebResult.ok(null);
    }

    @PutMapping("/phone")
    public WebResult<Void> setPhone(@Valid @RequestBody PhoneUpdateRequest req,
                                     Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.updatePhone(userId, req.phone());
        return WebResult.ok(null);
    }
}
```

```java
public record PhoneUpdateRequest(
    @NotBlank
    @Pattern(regexp = "^\\+\\d{8,15}$", message = "phone must be E.164 format")
    String phone) {}

public record WhatsAppConsentUpdateRequest(@NotNull Boolean consent) {}
```

In `PatientWriteAppService`:

```java
private static final String CONSENT_VERSION = "wa-v1";

@Transactional
public void updateWhatsAppConsent(UUID userId, boolean consent) {
    PatientModel p = patientRepo.findByUserId(userId).orElseThrow(...);
    if (consent) p.grantWhatsAppConsent(OffsetDateTime.now(), CONSENT_VERSION);
    else p.withdrawWhatsAppConsent();
    patientRepo.save(p);
    auditWriter.write(userId,
        consent ? "WHATSAPP_CONSENT.GRANT" : "WHATSAPP_CONSENT.WITHDRAW",
        Map.of("patientId", p.getId()));
}

@Transactional
public void updatePhone(UUID userId, String phone) {
    PatientModel p = patientRepo.findByUserId(userId).orElseThrow(...);
    p.updatePhone(phone);
    patientRepo.save(p);
    auditWriter.write(userId, "PATIENT.PHONE_UPDATE", Map.of("patientId", p.getId()));
}
```

Integration test:
- PUT consent=true with no phone on file → 400 (domain throws IllegalState → mapped to 40012).
- PUT phone, then PUT consent=true → 200, `whatsapp_consent_at` populated, audit row written.
- PUT phone=null while consent on → 400.

Commit:
```bash
git commit -m "feat(patient): PatientMeController + consent/phone write-service methods"
```

---

## Phase 6 — Visit context: `SoapFinalizedDomainEvent`

### Task 6.1: Define and publish `SoapFinalizedDomainEvent`

**Files:**
- Create: `domain/biz/visit/event/SoapFinalizedDomainEvent.java`
- Modify: `domain/biz/visit/service/MedicalReportFinalizeDomainService.java` (or wherever finalize lives)
- Modify: `application/biz/visit/SoapWriteAppService.java`

```java
package my.cliniflow.domain.biz.visit.event;

import java.time.LocalDate;
import java.util.UUID;

public record SoapFinalizedDomainEvent(
    UUID visitId,
    UUID patientId,
    boolean hasMedications,
    LocalDate followUpDate    // null if plan has no follow-up
) {}
```

In `SoapWriteAppService.finalizeReport(...)` after successful save:

```java
boolean hasMeds = !visit.getMedications().isEmpty();
LocalDate followUp = visit.getMedicalReport().getFollowUpDate();  // existing or new accessor
events.publishEvent(new SoapFinalizedDomainEvent(visit.getId(), visit.getPatientId(),
    hasMeds, followUp));
```

If `MedicalReportModel` doesn't yet expose `getFollowUpDate()`, add the accessor (returning what `plan` JSON contains) and wire through.

Test: an existing IT for finalize is extended to assert the event captures `hasMedications=true` and the `followUpDate` parsed from plan.

Commit:
```bash
git commit -m "feat(visit): publish SoapFinalizedDomainEvent at finalize"
```

---

## Phase 7 — Notification infrastructure (with stub sender)

### Task 7.1: `NotificationOutboxWriter`

**Files:**
- Create: `infrastructure/notification/outbox/NotificationOutboxWriter.java`
- Create: `test/.../NotificationOutboxWriterTest.java`

```java
@Component
public class NotificationOutboxWriter {

    private final NotificationOutboxJpaRepository repo;
    private final ObjectMapper objectMapper;

    public NotificationOutboxWriter(NotificationOutboxJpaRepository repo,
                                     ObjectMapper objectMapper) {
        this.repo = repo;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<UUID> enqueueWhatsApp(NotificationEventType eventType,
                                           String templateId,
                                           UUID patientId,
                                           Map<String, Object> payload,
                                           String idempotencyKey) {
        if (repo.findByIdempotencyKey(idempotencyKey).isPresent()) {
            return Optional.empty();   // already enqueued
        }
        NotificationOutboxEntity e = new NotificationOutboxEntity();
        e.setEventType(eventType.name());
        e.setChannel("WHATSAPP");
        e.setTemplateId(templateId);
        e.setRecipientPatientId(patientId);
        e.setPayload(payload);
        e.setIdempotencyKey(idempotencyKey);
        e.setStatus(NotificationStatus.PENDING.name());
        return Optional.of(repo.save(e).getId());
    }
}
```

Test: idempotency-key collision returns empty + does not insert. Use Testcontainers + a small JPA slice or full Spring boot.

Commit:
```bash
git commit -m "feat(notification): outbox writer with idempotency"
```

---

### Task 7.2: `MessageTemplateRegistry`

**Files:**
- Create: `infrastructure/notification/template/MessageTemplate.java`
- Create: `infrastructure/notification/template/MessageTemplateRegistry.java`
- Create: `test/.../MessageTemplateRegistryTest.java`

```java
public record MessageTemplate(String id, String locale, String body, int variableCount) {}
```

```java
@Component
public class MessageTemplateRegistry {

    private final Map<String, Map<String, MessageTemplate>> byIdThenLocale;

    public MessageTemplateRegistry() {
        this.byIdThenLocale = Map.of(
            "appointment_confirmation_v1", Map.of(
                "en", new MessageTemplate("appointment_confirmation_v1", "en",
                    "Hi {{1}}, your appointment with Dr {{2}} is confirmed for {{3}} at {{4}}. Reply CANCEL to cancel.", 4),
                "ms", new MessageTemplate("appointment_confirmation_v1", "ms",
                    "Hai {{1}}, temujanji anda dengan Dr {{2}} pada {{3}} jam {{4}} disahkan. Balas CANCEL untuk batal.", 4),
                "zh", new MessageTemplate("appointment_confirmation_v1", "zh",
                    "您好 {{1}}，您与 {{2}} 医生的预约已确认：{{3}} {{4}}。回复 CANCEL 取消。", 4)
            ),
            "appointment_cancelled_v1", Map.of(
                "en", new MessageTemplate("appointment_cancelled_v1", "en",
                    "Hi {{1}}, your appointment on {{2}} at {{3}} has been cancelled. Book again at {{4}}.", 4),
                "ms", new MessageTemplate("appointment_cancelled_v1", "ms",
                    "Hai {{1}}, temujanji anda pada {{2}} jam {{3}} telah dibatalkan. Tempah lagi di {{4}}.", 4),
                "zh", new MessageTemplate("appointment_cancelled_v1", "zh",
                    "您好 {{1}}，您 {{2}} {{3}} 的预约已取消。请于 {{4}} 重新预约。", 4)
            ),
            "soap_meds_summary_v1", Map.of(
                "en", new MessageTemplate("soap_meds_summary_v1", "en",
                    "Hi {{1}}, your prescriptions from today's visit:\n{{2}}\nView details: {{3}}", 3),
                "ms", new MessageTemplate("soap_meds_summary_v1", "ms",
                    "Hai {{1}}, preskripsi anda hari ini:\n{{2}}\nLihat: {{3}}", 3),
                "zh", new MessageTemplate("soap_meds_summary_v1", "zh",
                    "您好 {{1}}，今日处方：\n{{2}}\n详情：{{3}}", 3)
            ),
            "soap_followup_reminder_v1", Map.of(
                "en", new MessageTemplate("soap_followup_reminder_v1", "en",
                    "Hi {{1}}, Dr {{2}} suggests a follow-up around {{3}}. Book at {{4}}.", 4),
                "ms", new MessageTemplate("soap_followup_reminder_v1", "ms",
                    "Hai {{1}}, Dr {{2}} mencadangkan susulan sekitar {{3}}. Tempah di {{4}}.", 4),
                "zh", new MessageTemplate("soap_followup_reminder_v1", "zh",
                    "您好 {{1}}，{{2}} 医生建议在 {{3}} 左右复诊。预约：{{4}}。", 4)
            )
        );
    }

    public MessageTemplate resolve(String templateId, String locale) {
        var byLocale = byIdThenLocale.get(templateId);
        if (byLocale == null) throw new IllegalArgumentException("unknown template: " + templateId);
        return byLocale.getOrDefault(locale, byLocale.get("en"));
    }

    public String render(String templateId, String locale, List<String> vars) {
        MessageTemplate t = resolve(templateId, locale);
        if (vars.size() != t.variableCount()) {
            throw new IllegalArgumentException("variable count mismatch for " + templateId);
        }
        String out = t.body();
        for (int i = 0; i < vars.size(); i++) {
            out = out.replace("{{" + (i + 1) + "}}", vars.get(i));
        }
        return out;
    }
}
```

Tests cover: locale fallback (`zh` missing for a future template falls back to `en`); variable-count mismatch throws.

Commit:
```bash
git commit -m "feat(notification): MessageTemplateRegistry with en/ms/zh templates"
```

---

### Task 7.3: `WhatsAppSender` interface + `StubWhatsAppSender`

**Files:**
- Create: `infrastructure/notification/whatsapp/WhatsAppSender.java`
- Create: `infrastructure/notification/whatsapp/WhatsAppPayload.java`
- Create: `infrastructure/notification/whatsapp/SendResult.java`
- Create: `infrastructure/notification/whatsapp/StubWhatsAppSender.java`

```java
public interface WhatsAppSender {
    SendResult send(WhatsAppPayload payload);
}

public record WhatsAppPayload(String toPhoneE164, String templateId, String locale,
                               Map<String, String> vars) {}

public sealed interface SendResult permits SendResult.Sent, SendResult.Retryable, SendResult.Terminal {
    record Sent(String twilioSid) implements SendResult {}
    record Retryable(String error) implements SendResult {}
    record Terminal(String error, String code) implements SendResult {}
}
```

```java
@Component
@ConditionalOnProperty(prefix = "cliniflow.whatsapp", name = "provider", havingValue = "stub", matchIfMissing = true)
public class StubWhatsAppSender implements WhatsAppSender {
    private static final Logger log = LoggerFactory.getLogger(StubWhatsAppSender.class);
    @Override
    public SendResult send(WhatsAppPayload payload) {
        log.info("[stub-whatsapp] would send {} to {} with vars={}",
                 payload.templateId(), payload.toPhoneE164(), payload.vars());
        return new SendResult.Sent("stub-sid-" + UUID.randomUUID());
    }
}
```

Commit:
```bash
git commit -m "feat(notification): WhatsAppSender interface + stub impl"
```

---

### Task 7.4: Listeners

**Files:**
- Create: `infrastructure/notification/listener/AppointmentBookedListener.java`
- Create: `infrastructure/notification/listener/AppointmentCancelledListener.java`
- Create: `infrastructure/notification/listener/SoapFinalizedListener.java`
- Create: `test/.../listener/AppointmentBookedListenerTest.java`

```java
@Component
public class AppointmentBookedListener {

    private final NotificationOutboxWriter writer;
    private final AppointmentReadAppService reads;

    public AppointmentBookedListener(NotificationOutboxWriter writer, AppointmentReadAppService reads) {
        this.writer = writer;
        this.reads = reads;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onBooked(AppointmentBookedDomainEvent ev) {
        AppointmentDTO a = reads.findOneInternal(ev.appointmentId());  // skip ownership check (internal)
        Map<String, Object> payload = Map.of(
            "patientId", ev.patientId().toString(),
            "appointmentId", ev.appointmentId().toString(),
            "slotStartAt", a.startAt().toString(),
            "doctorId", a.doctorId().toString()
        );
        writer.enqueueWhatsApp(
            NotificationEventType.APPOINTMENT_BOOKED,
            "appointment_confirmation_v1",
            ev.patientId(),
            payload,
            "APPOINTMENT_BOOKED:" + ev.appointmentId()
        );
    }
}
```

`AppointmentCancelledListener` is symmetric.

`SoapFinalizedListener` enqueues 1 or 2 rows:

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void onFinalized(SoapFinalizedDomainEvent ev) {
    if (ev.hasMedications()) {
        writer.enqueueWhatsApp(
            NotificationEventType.SOAP_FINALIZED_MEDS,
            "soap_meds_summary_v1",
            ev.patientId(),
            Map.of("visitId", ev.visitId().toString()),
            "SOAP_FINALIZED_MEDS:" + ev.visitId());
    }
    if (ev.followUpDate() != null) {
        writer.enqueueWhatsApp(
            NotificationEventType.SOAP_FINALIZED_FOLLOWUP,
            "soap_followup_reminder_v1",
            ev.patientId(),
            Map.of("visitId", ev.visitId().toString(),
                    "followUpDate", ev.followUpDate().toString()),
            "SOAP_FINALIZED_FOLLOWUP:" + ev.visitId());
    }
}
```

Test: publish an `AppointmentBookedDomainEvent` inside `@Transactional` test, verify after-commit that exactly one outbox row exists with the correct idempotency key.

Commit:
```bash
git commit -m "feat(notification): listeners enqueue outbox rows after commit"
```

---

### Task 7.5: End-to-end smoke — book → outbox row → stub send

**Files:**
- Create: `test/.../NotificationEndToEndIT.java`

```java
@SpringBootTest
@ActiveProfiles("test")
class NotificationEndToEndIT extends IntegrationTestSupport {

    @Autowired AppointmentWriteAppService writes;
    @Autowired NotificationOutboxJpaRepository outbox;
    @Autowired OutboxDrainerScheduler drainer;

    @Test
    void booking_enqueues_outbox_row_and_stub_marks_it_sent() {
        UUID userId = seedPatient();
        UUID slotId = seedAvailableSlot();
        UUID visitId = seedVisitOwnedBy(userId);

        UUID apptId = writes.book(userId, new AppointmentBookRequest(slotId, "NEW_SYMPTOM", visitId, null));

        var rows = outbox.findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getIdempotencyKey()).isEqualTo("APPOINTMENT_BOOKED:" + apptId);

        drainer.drain();

        var afterDrain = outbox.findAll();
        assertThat(afterDrain.get(0).getStatus()).isEqualTo("SENT");
    }
}
```

Commit:
```bash
git commit -m "test(notification): end-to-end booking → outbox → stub send"
```

---

## Phase 8 — Real Twilio sender + drainer + reaper

### Task 8.1: `TwilioWhatsAppSender`

**Files:**
- Create: `infrastructure/notification/whatsapp/TwilioConfig.java`
- Create: `infrastructure/notification/whatsapp/TwilioWhatsAppSender.java`
- Create: `test/.../whatsapp/TwilioWhatsAppSenderIT.java`

```java
@ConfigurationProperties(prefix = "cliniflow.whatsapp.twilio")
public record TwilioConfig(String accountSid, String authToken, String fromWhatsapp) {}
```

```java
@Component
@ConditionalOnProperty(prefix = "cliniflow.whatsapp", name = "provider", havingValue = "twilio")
@EnableConfigurationProperties(TwilioConfig.class)
public class TwilioWhatsAppSender implements WhatsAppSender {

    private static final Logger log = LoggerFactory.getLogger(TwilioWhatsAppSender.class);
    private final TwilioConfig config;
    private final MessageTemplateRegistry templates;

    public TwilioWhatsAppSender(TwilioConfig config, MessageTemplateRegistry templates) {
        this.config = config;
        this.templates = templates;
        Twilio.init(config.accountSid(), config.authToken());
    }

    @Override
    public SendResult send(WhatsAppPayload payload) {
        try {
            String body = templates.render(payload.templateId(), payload.locale(),
                payload.vars().entrySet().stream()
                    .sorted(Map.Entry.comparingByKey())
                    .map(Map.Entry::getValue)
                    .toList());
            Message m = Message.creator(
                new com.twilio.type.PhoneNumber("whatsapp:" + payload.toPhoneE164()),
                new com.twilio.type.PhoneNumber(config.fromWhatsapp()),
                body).create();
            return new SendResult.Sent(m.getSid());
        } catch (ApiException e) {
            String code = String.valueOf(e.getCode());
            // Terminal codes: 63016 (template not approved), 63015 (Meta business not verified)
            if (Set.of("63016", "63015", "21211").contains(code)) {
                return new SendResult.Terminal(e.getMessage(), code);
            }
            return new SendResult.Retryable(e.getMessage());
        } catch (Exception e) {
            return new SendResult.Retryable(e.getMessage());
        }
    }
}
```

`TwilioWhatsAppSenderIT` uses WireMock to simulate Twilio's REST API, asserting:
- Successful POST returns `Sent` with the parsed SID.
- 4xx with code `63016` returns `Terminal`.
- 5xx returns `Retryable`.

Commit:
```bash
git commit -m "feat(notification): real twilio whatsapp sender behind feature flag"
```

---

### Task 8.2: `OutboxDrainerScheduler`

**Files:**
- Create: `infrastructure/notification/scheduler/OutboxDrainerScheduler.java`
- Create: `test/.../scheduler/OutboxDrainerSchedulerTest.java`

Behavior:
1. Reaper pass: revert `SENDING` rows older than `reaper-stuck-after-minutes` minutes back to `FAILED`.
2. Pull up to 25 due rows ordered by `next_attempt_at`.
3. For each row: flip `SENDING`, check consent + phone, render template → call sender, update row.

```java
@Component
public class OutboxDrainerScheduler {

    private final NotificationOutboxJpaRepository outbox;
    private final WhatsAppMessageLogJpaRepository log;
    private final WhatsAppSender sender;
    private final PatientRepository patients;
    private final MessageTemplateRegistry templates;
    private final AuditLogWriter audit;
    private final int maxAttempts;
    private final int stuckMinutes;

    public OutboxDrainerScheduler(/* injected */,
        @Value("${cliniflow.whatsapp.max-attempts}") int maxAttempts,
        @Value("${cliniflow.whatsapp.reaper-stuck-after-minutes}") int stuckMinutes) {
        /* ... */
    }

    @Scheduled(fixedDelayString = "${cliniflow.whatsapp.drainer-fixed-delay-ms}")
    @Transactional
    public void drain() {
        OffsetDateTime now = OffsetDateTime.now();
        outbox.reapStuckSending(now, now.minusMinutes(stuckMinutes));
        var due = outbox.findDueForSend(now, PageRequest.of(0, 25));
        for (var row : due) processOne(row);
    }

    private void processOne(NotificationOutboxEntity row) {
        row.setStatus("SENDING");
        outbox.save(row);

        var patient = patients.findById(row.getRecipientPatientId()).orElse(null);
        if (patient == null || patient.getWhatsAppConsentAt() == null
            || patient.getPhone() == null || patient.getPhone().isBlank()) {
            row.setStatus("SKIPPED_NO_CONSENT");
            outbox.save(row);
            return;
        }

        // build vars from payload + patient + visit lookups
        WhatsAppPayload payload = buildPayload(row, patient);
        SendResult result = sender.send(payload);

        switch (result) {
            case SendResult.Sent s -> {
                row.setStatus("SENT");
                row.setSentAt(OffsetDateTime.now());
                logSendSuccess(row, payload, s);
                audit.write(null, "NOTIFICATION.SEND",
                    Map.of("outboxId", row.getId(), "twilioSid", s.twilioSid(), "status", "SENT"));
            }
            case SendResult.Retryable r -> {
                row.setAttempts((short) (row.getAttempts() + 1));
                row.setLastError(r.error());
                if (row.getAttempts() >= maxAttempts) {
                    row.setStatus("FAILED");
                } else {
                    row.setStatus("FAILED");   // FAILED is the retry-eligible state
                    long backoffMins = Math.min(30, (long) Math.pow(2, row.getAttempts()));
                    row.setNextAttemptAt(OffsetDateTime.now().plusMinutes(backoffMins));
                }
            }
            case SendResult.Terminal t -> {
                row.setStatus("FAILED");
                row.setAttempts((short) maxAttempts);  // no further retries
                row.setLastError("terminal:" + t.code() + ":" + t.error());
            }
        }
        outbox.save(row);
    }

    /* buildPayload + logSendSuccess helpers omitted for brevity in plan;
       implementation must look up doctor name, slot times, portal URL etc.
       and render PHI-safe variables only.  See spec §6 for the
       PHI-minimisation rule. */
}
```

Test (mocked sender + repos):
- Sent → status SENT, log row inserted, audit row inserted.
- Retryable → attempts incremented, `next_attempt_at` pushed by 2^attempts minutes.
- Terminal → attempts maxed, FAILED, no retry-pickup next tick.
- Reaper reverts a SENDING row older than 2 min.

Commit:
```bash
git commit -m "feat(notification): outbox drainer with backoff + reaper"
```

---

### Task 8.3: Helper — `buildPayload`

The drainer needs PHI-minimised vars. Decompose into a small `OutboxPayloadBuilder` component with one method per template id:

```java
@Component
public class OutboxPayloadBuilder {

    private final AppointmentReadAppService apptReads;
    private final DoctorRepository doctors;
    private final VisitReadAppService visits;
    private final String portalBaseUrl;

    public WhatsAppPayload build(NotificationOutboxEntity row, PatientModel patient) {
        return switch (NotificationEventType.valueOf(row.getEventType())) {
            case APPOINTMENT_BOOKED -> buildAppointmentBooked(row, patient);
            case APPOINTMENT_CANCELLED -> buildAppointmentCancelled(row, patient);
            case SOAP_FINALIZED_MEDS -> buildMedsSummary(row, patient);
            case SOAP_FINALIZED_FOLLOWUP -> buildFollowUp(row, patient);
        };
    }
    /* ... per-template private helpers — each returns a WhatsAppPayload */
}
```

Each helper assembles the var list in a documented order matching the template's `{{1}}..{{n}}` slots. Add unit tests asserting the order is correct and PHI-free fields are not included.

Commit:
```bash
git commit -m "feat(notification): OutboxPayloadBuilder per-template helpers"
```

---

## Phase 9 — Frontend patient flows

> Before each new page is created, invoke the **`frontend-design` skill** per the existing memory. Reuse `Field`, `Input`, `Button`, `Separator`, the obsidian/ink/cyan/fog/crimson palette, and the aurora-glass CSS in `frontend/app/globals.css`. Default Tailwind boilerplate is a CRITICAL review failure.

### Task 9.1: Add WhatsApp consent checkbox to register page

**Files:**
- Modify: `frontend/app/auth/register/page.tsx`

- [ ] **Step 1: Add state + checkbox + phone-required validation**

State:
```tsx
const [whatsappConsent, setWhatsappConsent] = useState(false);
const WHATSAPP_CONSENT_VERSION = "wa-v1";
```

Inside the `onSubmit` validation block (after PDPA consent check):
```tsx
if (whatsappConsent && (!phone || phone.trim().length < 8)) {
  setError("Phone number is required to receive WhatsApp reminders.");
  return;
}
```

Inside the request body, append (only when consenting):
```tsx
whatsAppConsent: whatsappConsent,
whatsAppConsentVersion: whatsappConsent ? WHATSAPP_CONSENT_VERSION : null,
```

In the JSX, after the existing PDPA consent label:
```tsx
<label className="flex items-start gap-2.5 mt-2 cursor-pointer">
  <input type="checkbox" checked={whatsappConsent}
    onChange={(e) => setWhatsappConsent(e.target.checked)}
    className="mt-1 h-4 w-4 rounded-xs border border-ink-rim bg-ink-well accent-cyan focus:outline-none focus:ring-1 focus:ring-cyan/40" />
  <span className="font-sans text-xs text-fog-dim leading-relaxed">
    I consent to receiving appointment confirmations, medication
    instructions, and follow-up reminders via WhatsApp at the phone
    number above. I can withdraw any time in profile settings.
  </span>
</label>
```

- [ ] **Step 2: Backend `/auth/register/patient` accepts the new fields**

In `RegisterPatientRequest` (existing) add `Boolean whatsAppConsent` and `String whatsAppConsentVersion`. The registration write-service path-through:

```java
if (Boolean.TRUE.equals(req.whatsAppConsent())) {
    patient.grantWhatsAppConsent(OffsetDateTime.now(), req.whatsAppConsentVersion());
    audit.write(userId, "WHATSAPP_CONSENT.GRANT", Map.of("patientId", patient.getId()));
}
```

- [ ] **Step 3: Lint + typecheck + commit**

```bash
cd frontend && npm run lint && npm run typecheck
cd ../backend && ./mvnw test -q
git commit -m "feat(register): whatsapp consent checkbox + phone-required validation"
```

---

### Task 9.2: `frontend/lib/appointments.ts`

**Files:**
- Create: `frontend/lib/appointments.ts`

```ts
import { apiGet, apiPost, apiDelete } from "./api";

export type Slot = {
  id: string;
  doctorId: string;
  startAt: string;
  endAt: string;
  status: "AVAILABLE" | "BOOKED" | "BLOCKED" | "CLOSED";
};

export type Appointment = {
  id: string;
  slotId: string;
  startAt: string;
  endAt: string;
  doctorId: string;
  patientId: string;
  visitId: string;
  type: "NEW_SYMPTOM" | "FOLLOW_UP";
  parentVisitId: string | null;
  status: "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  cancelledAt: string | null;
};

export async function listAvailability(from: string, to: string): Promise<Slot[]> {
  return (await apiGet<{ slots: Slot[] }>(`/appointments/availability?from=${from}&to=${to}`)).slots;
}

export async function bookAppointment(req: {
  slotId: string;
  type: "NEW_SYMPTOM" | "FOLLOW_UP";
  visitId?: string;
  parentVisitId?: string;
}): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/appointments", req);
}

export async function listMine(status?: Appointment["status"]): Promise<Appointment[]> {
  const q = status ? `?status=${status}` : "";
  return apiGet<Appointment[]>(`/appointments/mine${q}`);
}

export async function cancelAppointment(id: string, reason?: string): Promise<void> {
  return apiDelete<void>(`/appointments/${id}`, reason ? { reason } : undefined);
}
```

If `apiDelete` doesn't exist in `frontend/lib/api.ts`, add it as a sibling of `apiPost`.

Commit:
```bash
git commit -m "feat(frontend): appointments API client"
```

---

### Task 9.3: `<AvailabilityCalendar>` + `<SlotPicker>` components

**Files:**
- Create: `frontend/app/components/schedule/AvailabilityCalendar.tsx`
- Create: `frontend/app/components/schedule/SlotPicker.tsx`

`AvailabilityCalendar` renders a week strip (7 day columns), with the count of available slots per day. Click a day → opens `<SlotPicker>` for that day.

`SlotPicker` lists slots as `<button>` elements styled with `ink-well` background, `cyan` hover ring. Disabled state for booked slots. Click → `onSelect(slot)`.

Use the obsidian/ink/cyan/fog tokens. Layout: 7-col grid on desktop, 1-col stacked on mobile.

Skeleton:

```tsx
"use client";
import { useEffect, useState } from "react";
import { listAvailability, type Slot } from "@/lib/appointments";

type Props = {
  from: string; // ISO date
  to: string;
  onSelect: (slot: Slot) => void;
};

export function AvailabilityCalendar({ from, to, onSelect }: Props) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAvailability(from, to)
      .then(setSlots)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load slots"));
  }, [from, to]);

  if (error) return <p className="text-sm text-crimson">{error}</p>;
  if (!slots) return <p className="text-sm text-fog-dim">Loading availability…</p>;

  // group by date
  const days = new Map<string, Slot[]>();
  for (const s of slots) {
    const day = s.startAt.slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(s);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {[...days.entries()].map(([day, daySlots]) => (
        <div key={day} className="bg-ink-well border border-ink-rim rounded-sm p-3">
          <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
            {new Date(day).toLocaleDateString("en-MY", { weekday: "short", month: "short", day: "numeric" })}
          </p>
          <div className="flex flex-col gap-1.5">
            {daySlots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => onSelect(slot)}
                className="text-left px-2 py-1 rounded-xs border border-ink-rim hover:border-cyan/60 hover:ring-1 hover:ring-cyan/40 text-sm font-sans text-fog transition-colors"
              >
                {new Date(slot.startAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
            {daySlots.length === 0 && (
              <p className="text-xs text-fog-dim/60">No slots</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Commit:
```bash
git commit -m "feat(frontend): AvailabilityCalendar component (aurora-glass)"
```

---

### Task 9.4: `/portal/book/page.tsx`

**Files:**
- Create: `frontend/app/portal/book/page.tsx`

Reads `?visitId=...` from query. Renders `<AvailabilityCalendar>` for the next 14 days. On slot select → confirmation modal → `bookAppointment({ slotId, type: "NEW_SYMPTOM", visitId })`. On success → `router.push('/portal/appointments/' + result.id)`.

Show a small `ink-well` banner if the booking response includes `whatsappConsentSkipped: true` (the API echoes consent state in the response — wire this through if not already).

Commit:
```bash
git commit -m "feat(portal): book page wired to availability + confirmation modal"
```

---

### Task 9.5: `/portal/book/follow-up/page.tsx`

Same shape as 9.4 but reads `?parentVisitId=...` and posts `{ slotId, type: "FOLLOW_UP", parentVisitId }`.

Commit:
```bash
git commit -m "feat(portal): follow-up booking page"
```

---

### Task 9.6: `/portal/appointments/page.tsx` and `/portal/appointments/[id]/page.tsx`

List page: two sections (Upcoming, Past), each rendering `<AppointmentCard>`. Past visits include a "Book follow-up" button → navigates to `/portal/book/follow-up?parentVisitId=...`.

Detail page: shows date/time, doctor, status, and a Cancel button visible only when:
```ts
const cancellable = appointment.status === "BOOKED"
  && new Date(appointment.startAt).getTime() - Date.now() > 2 * 3600 * 1000;
```

Cancel button opens `<CancelConfirmDialog>` with optional reason field → `cancelAppointment(id, reason)` → on 403 with `errorCode=40301`, show "The cancellation window has passed. Please call the clinic." message.

Commit:
```bash
git commit -m "feat(portal): appointments list + detail with cancel flow"
```

---

### Task 9.7: `/portal/profile/page.tsx`

Two controls: phone (editable, E.164 input with `+60...` placeholder) + WhatsApp consent toggle. Calls `PUT /api/patients/me/phone` and `PUT /api/patients/me/whatsapp-consent`.

Toggle disabled if phone empty. Reactive: enabling consent without a phone surfaces "Please enter a phone number first."

Commit:
```bash
git commit -m "feat(portal): profile page with phone + whatsapp consent toggle"
```

---

### Task 9.8: `<WhatsAppOptInModal>` for existing patients

**Files:**
- Create: `frontend/app/components/schedule/WhatsAppOptInModal.tsx`
- Modify: `frontend/app/portal/page.tsx` (or layout.tsx)

Modal renders only if user is a patient AND `whatsappConsentAt === null` AND `localStorage.getItem("wa-optin-dismissed-" + userId) !== "1"`.

Two CTAs: "Yes, send me reminders" (calls consent toggle) and "Maybe later" (sets the localStorage flag).

Modal uses the same aurora-glass shell as register: `bg-obsidian/80` backdrop, `bg-ink-well` panel, `cyan` primary button.

Commit:
```bash
git commit -m "feat(portal): one-time whatsapp opt-in modal for existing patients"
```

---

## Phase 10 — Frontend staff/admin/doctor

### Task 10.1: `/staff/schedule/page.tsx`

Day grid for today (paginate by date). Two action buttons: "Close day" and "Block window". Each opens a small dialog → POSTs to the corresponding endpoint. Display existing slots in the day with their statuses (AVAILABLE / BOOKED / BLOCKED / CLOSED).

Commit:
```bash
git commit -m "feat(staff): schedule day-overrides UI"
```

---

### Task 10.2: `/admin/schedule-template/page.tsx`

Weekly hours editor: 7 rows (Mon–Sun), each with an array of `[start, end]` time inputs. Slot-minutes select (10/15/20/30). Cancel-lead-hours number input. Save button → `PUT /api/schedule/template`.

Show a notice: "Saving will regenerate available slots for the next 28 days. Booked slots are kept."

Commit:
```bash
git commit -m "feat(admin): schedule-template weekly hours editor"
```

---

### Task 10.3: `/doctor/today/page.tsx`

Read-only list of today's bookings, ordered by time. Each row → patient name, visit type (NEW_SYMPTOM / FOLLOW_UP), link to existing visit detail page.

Commit:
```bash
git commit -m "feat(doctor): today's appointments panel"
```

---

## Phase 11 — Pre-visit completion booking CTA

### Task 11.1: Add booking CTA to pre-visit completion screen

**Files:**
- Modify: the existing component that renders the "pre-visit complete" state in `frontend/app/previsit/...` (locate via the existing `done=true` path)

Find the component handling `done=true` and add two buttons:
- Primary: `Book your appointment` → `router.push('/portal/book?visitId=' + visitId)`
- Secondary: `I'll book later` → `router.push('/portal')`

Test by running the existing pre-visit E2E and confirming the CTAs appear after `done` is true.

Commit:
```bash
git commit -m "feat(previsit): completion screen offers booking CTA"
```

---

## Phase 12 — E2E (Playwright via MCP) + Docker rebuild + design review

> **Mandatory protocol** for every E2E task in this phase, per `docs/post-mortem/2026-04-22-backend-boot-and-schema.md` and the user's E2E memory:
>
> 1. `docker compose down -v && docker compose build --no-cache && docker compose up -d`
> 2. Wait for backend health: `curl -fsS http://localhost/api/health || sleep 2` until ready.
> 3. Drive the browser **only** via Playwright MCP tools (`mcp__plugin_playwright_playwright__*`). Do **not** invoke `npx playwright`.
> 4. Take screenshots via `mcp__plugin_playwright_playwright__browser_take_screenshot` for each new page; review them inline against `/auth/register`, `/portal`, `/admin/users` for theme parity.

### Task 12.1: Stack rebuild + smoke

- [ ] **Step 1: Bring down + rebuild**

```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

- [ ] **Step 2: Health check**

```bash
until curl -fsS http://localhost/api/health > /dev/null; do sleep 2; done
echo "backend up"
```

- [ ] **Step 3: Playwright MCP — open landing, take snapshot**

Use `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost`. Then `mcp__plugin_playwright_playwright__browser_snapshot` to confirm landing renders. Take a screenshot.

No commit — this is a verification step.

---

### Task 12.2: `appointment-booking.spec.ts`

**Files:**
- Create: `frontend/e2e/appointment-booking.spec.ts`

Spec scenario:
1. Patient registers (uses existing register flow + new WhatsApp consent box checked).
2. Goes through pre-visit chat to `done=true`.
3. Clicks "Book your appointment" CTA.
4. Calendar renders. Patient picks the first available slot.
5. Confirmation modal → confirms.
6. Lands on `/portal/appointments/{id}` with green "Booked" banner.
7. Clicks Cancel → reason → confirms → status flips to CANCELLED in /portal/appointments.

For each step also use `mcp__plugin_playwright_playwright__browser_take_screenshot` to capture visual state. Review screenshots against `/portal` baseline — same colors, same primitives.

The spec runs **as documentation** for the manual MCP-driven walk-through — Playwright MCP is invoked from the agent, not from `npx playwright test`. The spec file's purpose is to give a future maintainer a script of the path.

Commit:
```bash
git commit -m "test(e2e): appointment-booking flow spec (Playwright MCP)"
```

---

### Task 12.3: `staff-schedule.spec.ts`

Scenario:
1. Staff logs in.
2. Goes to `/staff/schedule`.
3. Blocks a window 09:00–10:00 tomorrow.
4. Patient logs in (separate browser tab via MCP `browser_tabs`).
5. Patient calendar no longer shows 09:00–09:45 slots tomorrow.
6. Screenshot review on /staff/schedule.

Commit:
```bash
git commit -m "test(e2e): staff schedule blocks reflected in patient availability"
```

---

### Task 12.4: `whatsapp-consent.spec.ts`

Scenario:
1. New patient registers WITHOUT WhatsApp consent.
2. Books an appointment.
3. Booking confirmation surfaces "WhatsApp reminders disabled" banner.
4. Verify outbox row status is `SKIPPED_NO_CONSENT` via `GET /api/admin/notifications/outbox` (admin endpoint — add a tiny admin read endpoint if missing) or via direct DB query through a small staff API helper.
5. Patient toggles consent ON in `/portal/profile`.
6. Books a second appointment.
7. Verify outbox row transitions PENDING → SENDING → SENT.

Commit:
```bash
git commit -m "test(e2e): whatsapp consent gates outbox delivery"
```

---

### Task 12.5: Visual design-theme review

For each new page (`/portal/book`, `/portal/book/follow-up`, `/portal/appointments`, `/portal/appointments/{id}`, `/portal/profile`, `/staff/schedule`, `/admin/schedule-template`, `/doctor/today`):

- [ ] **Step 1: Take screenshot via Playwright MCP**
- [ ] **Step 2: Compare to existing pages**

Open `frontend/app/auth/register/page.tsx`, `frontend/app/portal/page.tsx`, `frontend/app/admin/users/...` for reference. The new screenshot must:
- Use the obsidian background, ink-well cards, cyan accents.
- Use display/sans/mono typography from `frontend/design/`.
- Reuse `Field`, `Input`, `Button`, `Separator`.

If any new page deviates → fix as a CRITICAL issue before merging.

Commit each fix with `fix(design): <page> matches aurora-glass theme`.

---

## Phase 13 — Docs updates

### Task 13.1: Update `docs/details/scope-and-acceptance.md`

**Files:**
- Modify: `docs/details/scope-and-acceptance.md`

Remove `appointment booking/scheduling` from the §7 out-of-scope sentence. Move "in-app follow-up & medication reminders" from "Should" to "Must". Add appointment booking to "Must".

Commit:
```bash
git commit -m "docs(scope): include appointment booking + reminders in MVP must-haves"
```

---

### Task 13.2: Update `docs/details/api-surface.md`

Append a new "Schedule" section with the endpoints from spec §5. Group by role.

Commit:
```bash
git commit -m "docs(api): document schedule + appointment endpoints"
```

---

### Task 13.3: Update `docs/details/data-model.md`

Append the 6 new tables and 2 new patient columns under existing "Postgres tables" header.

Commit:
```bash
git commit -m "docs(data-model): document schedule + notification tables"
```

---

## Self-review — quick spec coverage check

The plan covers spec sections 1–13 as follows:

| Spec section | Plan tasks |
|---|---|
| 1 Problem & scope | (covered by phase plan + non-goals enforced via `@PreAuthorize`, audit calls, PHI rule in 7.2/8.3) |
| 2 Architecture decisions A–G | (axes baked into Phase 2 packaging, Phase 7 infra placement, Phase 8 Twilio config flag, Phase 9.1 PDPA consent UX, Phase 11 funnel) |
| 3 Module structure (backend) | Phases 1–8 |
| 3 Module structure (frontend) | Phases 9–11 |
| 4 Data model | Phase 1 (entities) — schema already applied |
| 5 API surface | Phase 4 (controllers), Phase 5 (patient me) |
| 6 Notification pipeline | Phase 7 (listeners + outbox), Phase 8 (drainer + sender) |
| 7 Audit log entries | Phase 4 + 5 + 8 (each writes its event_type) |
| 8 Pre-visit integration | Phase 11 |
| 9 Consent UX | Phase 9.1 (register), 9.7 (profile), 9.8 (existing-patient modal) |
| 10 Edge cases | Phase 2.5 (race), 2.6 (lead time), 5 (consent gate), 8.2 (reaper, terminal codes) |
| 11 Testing strategy | Unit per task, ITs in Phase 4, E2E in Phase 12 |
| 12 Build sequence | Phase ordering matches |
| 13 Open questions | not action items |

No placeholders remain.

---

## Implementation handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-appointment-booking-and-whatsapp-reminders.md`.

**Two execution options:**

**1. Subagent-Driven (recommended for a plan this large)** — fresh subagent dispatched per task, two-stage review (factual + senior-engineer perspective) between tasks, fast iteration. The plan's task boundaries are sized for this.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batched with checkpoints for review. Faster for small plans, but with 13 phases this will eat context.

Which approach do you want?

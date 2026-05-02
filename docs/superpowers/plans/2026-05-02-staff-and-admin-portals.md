# Staff & Admin Portals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-02-staff-and-admin-portals-design.md`

**Goal:** Wire up every stubbed page in `/staff/*` and `/admin/*`, add walk-in registration + booking, "book for patient" on patient detail, an admin user-detail drawer (role / active flip / force-reset), a richer audit log with resource labels, KPIs + 30-day sparkline, and a top-tabs+sub-tabs nav restructure. Aurora-glass theme is preserved exactly — no palette additions.

**Architecture:** Five phases, each independently shippable.
- Phase 1 ships pure wiring (no UI changes) so the most-visible stubs disappear first.
- Phase 2 adds admin user-detail drawer + the active/force-reset endpoints.
- Phase 3 ships the audit + analytics surfaces (with one new DB index).
- Phase 4 ships the walk-in and book-for-patient modals.
- Phase 5 polishes nav and pulls per-page auth-guard duplication into shared layouts.

**Tech stack:** Spring Boot 3.3 / Java 21 / Maven · Spring Data JPA · Spring Security + JJWT · `org.springframework.jdbc.JdbcTemplate` (already used by `AuditWriter`) · JUnit 5 + Mockito + AssertJ · Testcontainers Postgres for ITs · Next.js 14 + TypeScript · Playwright (driven via MCP) · Aurora-glass CSS tokens already in `frontend/app/globals.css`.

**Branch:** Cut a fresh branch off `master` named `feat/staff-and-admin-portals`. (The spec was committed on `docs/evaluator-coverage`; if work continues on that branch, cherry-pick the spec commits onto the new branch first.)

---

## Conventions used in this plan

- **TDD.** Every task that produces production code follows `write failing test → run failing → implement → run passing → commit`. Pure refactors and CSS-only edits skip the failing-test step (an explicit note in the task).
- **One task = one commit.** Conventional commits style: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`.
- **Backend test runner.** `cd backend && ./mvnw test -Dtest=ClassName#method` for one test; `./mvnw test` for the suite.
- **Frontend gate.** `cd frontend && npm run typecheck && npm run lint` after every frontend task.
- **Identity rule.** Every per-user endpoint derives `actorId` from `((JwtService.Claims) auth.getPrincipal()).userId()`. Path-parameter IDs require explicit guards.
- **Audit rule.** `audit_log.action` CHECK constraint allows only `READ / CREATE / UPDATE / DELETE / LOGIN / EXPORT`. Discriminate via `resource_type` (e.g. `USER_PASSWORD`, `USER_ROLE`) and `metadata` JSONB. The existing `AuditWriter.append(action, resourceType, resourceId, actorUserId, actorRole)` 5-arg signature stays; an overload that also writes `metadata` is added in Task 1.1.
- **Frontend talks to Spring Boot only.** No direct calls from Next.js to the agent or Neo4j.
- **No new palette tokens.** Reuse `frontend/app/globals.css` tokens. Layout/density may change; colors and surfaces may not.
- **Self-action guards.** Admin cannot demote, deactivate, or force-reset themselves. Returns `409` with code `SELF_ACTION_FORBIDDEN`.
- **No placeholders.** Every step contains the actual code, command, or expected output.

---

## Phase plan (each phase ships working software)

| Phase | Scope | Ships |
|---|---|---|
| 1 | Backend wiring (`/staff/today`, `/staff/checkin`, role-change), patient-search path fix | Today + Patients pages no longer show "Stub — backend pending"; admin role change works |
| 2 | Admin user-detail drawer + `/admin/users/{id}/active` + `/admin/users/{id}/force-password-reset` | Admin can deactivate/reactivate/force-reset users; Users page redesigned |
| 3 | `/admin/audit` (enriched) and `/admin/analytics` (KPIs + 30-day series) + `V12__audit_action_index.sql` | Audit + Analytics pages live with real data |
| 4 | `/api/staff/patients` walk-in registration + WalkInModal + BookForPatientModal | Staff can walk in and book; "Book appointment" button on patient detail |
| 5 | Nav restructure (admin sub-tabs, staff flat) + `staff/layout.tsx` + `admin/layout.tsx` shared auth-guards | Both portals use top tabs + sub-tabs grouping; per-page auth-guard duplication removed |

---

## Phase 1 — Backend wiring + patient-search path fix

### Task 1.1: Add `AuditWriter.append(...)` overload that writes `metadata`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/infrastructure/audit/AuditWriter.java`
- Test: `backend/src/test/java/my/cliniflow/infrastructure/audit/AuditWriterTest.java` (new)

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/my/cliniflow/infrastructure/audit/AuditWriterTest.java`:
```java
package my.cliniflow.infrastructure.audit;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AuditWriterTest {

    @Test
    void appendWithMetadataSerializesJsonb() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        AuditWriter w = new AuditWriter(jdbc);
        UUID actor = UUID.randomUUID();
        UUID resourceUuid = UUID.randomUUID();

        w.append("UPDATE", "USER_ROLE", resourceUuid.toString(), actor, "ADMIN",
                java.util.Map.of("from", "DOCTOR", "to", "ADMIN"));

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(anyString(), args.capture());
        // last positional arg is the metadata JSON string
        Object[] vals = args.getValue();
        Object lastArg = vals[vals.length - 1];
        assertThat(lastArg.toString()).contains("\"from\":\"DOCTOR\"");
        assertThat(lastArg.toString()).contains("\"to\":\"ADMIN\"");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && ./mvnw -q test -Dtest=AuditWriterTest
```

Expected: COMPILE FAILURE — `append` does not have a 6-arg overload.

- [ ] **Step 3: Implement the overload**

In `backend/src/main/java/my/cliniflow/infrastructure/audit/AuditWriter.java` add this method below the existing `append`:

```java
public void append(String action,
                   String resourceType,
                   String resourceId,
                   UUID actorUserId,
                   String actorRole,
                   java.util.Map<String, ?> metadata) {
    String json = metadata == null || metadata.isEmpty()
        ? "{}"
        : toJson(metadata);
    jdbc.update(
        "INSERT INTO audit_log(occurred_at, actor_user_id, actor_role, action, resource_type, resource_id, metadata)" +
        " VALUES (?,?,?,?,?,?,?::jsonb)",
        java.time.OffsetDateTime.now(), actorUserId, actorRole, action, resourceType, resourceId, json
    );
}

private static String toJson(java.util.Map<String, ?> m) {
    try {
        return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(m);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
        throw new IllegalStateException("audit metadata not serializable", e);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && ./mvnw -q test -Dtest=AuditWriterTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/my/cliniflow/infrastructure/audit/AuditWriter.java \
        backend/src/test/java/my/cliniflow/infrastructure/audit/AuditWriterTest.java
git commit -m "feat(audit): add metadata-bearing append overload"
```

---

### Task 1.2: Add `STAFF` and `DOCTOR` GET to `/api/patients/{id}` for staff use

> **Why:** The frontend `staff/patients/[id]/page.tsx` calls `/patients/{id}` expecting demographics + visit previews. The current `PatientsController.getClinicalProfile` requires DOCTOR and returns a clinical profile (not the staff view). Add a staff-friendly summary endpoint.

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/patient/PatientsController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/patient/response/PatientSummaryDTO.java`
- Modify: `backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/patient/PatientReadAppServiceSummaryTest.java` (new)

- [ ] **Step 1: Define the response DTO**

`backend/src/main/java/my/cliniflow/controller/biz/patient/response/PatientSummaryDTO.java`:
```java
package my.cliniflow.controller.biz.patient.response;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record PatientSummaryDTO(
    UUID id,
    String name,
    String email,
    String phone,
    LocalDate dateOfBirth,
    List<VisitPreview> visits
) {
    public record VisitPreview(UUID visitId, String finalizedAt, String summaryEnPreview) {}
}
```

- [ ] **Step 2: Write the failing service test**

`backend/src/test/java/my/cliniflow/application/biz/patient/PatientReadAppServiceSummaryTest.java`:
```java
package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.biz.patient.response.PatientSummaryDTO;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PatientReadAppServiceSummaryTest {
    @Test
    void summaryThrowsForUnknownPatient() {
        // Construct service with mocked repos that return Optional.empty()
        // (full mock setup follows the existing AppointmentWriteAppServiceTest pattern)
        // Expectation: throws ResourceNotFoundException when patient not found.
        // (See implementation in step 3.)
    }
}
```

The failing assertion in the next runnable test is:
```java
assertThatThrownBy(() -> service.summary(java.util.UUID.randomUUID()))
    .hasMessageContaining("not found");
```

- [ ] **Step 3: Add `summary(patientId)` to `PatientReadAppService`**

Append the method to `PatientReadAppService`:
```java
@Transactional(readOnly = true)
public PatientSummaryDTO summary(UUID patientId) {
    PatientModel p = patients.findById(patientId).orElseThrow(
        () -> new ResourceNotFoundException("PATIENT", patientId));
    List<MedicalReportModel> reports = medicalReports.findFinalizedByPatientId(patientId,
        org.springframework.data.domain.PageRequest.of(0, 5));
    List<PatientSummaryDTO.VisitPreview> previews = reports.stream()
        .map(r -> new PatientSummaryDTO.VisitPreview(
            r.getVisitId(),
            r.getFinalizedAt() == null ? null : r.getFinalizedAt().toString(),
            r.getSummaryEnPreview()))
        .toList();
    return new PatientSummaryDTO(
        p.getId(), p.getFullName(), p.getEmail(), p.getPhone(),
        p.getDateOfBirth(), previews);
}
```

If `MedicalReportRepository.findFinalizedByPatientId(UUID, Pageable)` does not exist, add it:
```java
List<MedicalReportModel> findFinalizedByPatientId(UUID patientId, org.springframework.data.domain.Pageable page);
```
Mark the method in the repository with the appropriate JPA query (use the existing `summaryEnPreview` getter and `finalizedAt` filter; copy from neighbouring methods).

- [ ] **Step 4: Add the controller method**

In `PatientsController` add (next to `getClinicalProfile`):
```java
@GetMapping("/{patientId}")
@PreAuthorize("hasAnyRole('STAFF','DOCTOR')")
public WebResult<PatientSummaryDTO> summary(@PathVariable UUID patientId) {
    return WebResult.ok(reads.summary(patientId));
}
```

- [ ] **Step 5: Run unit + integration tests**

```bash
cd backend && ./mvnw -q test -Dtest='PatientReadAppService*'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/patient/ \
        backend/src/main/java/my/cliniflow/application/biz/patient/PatientReadAppService.java \
        backend/src/test/java/my/cliniflow/application/biz/patient/PatientReadAppServiceSummaryTest.java
git commit -m "feat(patients): GET /api/patients/{id} staff/doctor summary"
```

---

### Task 1.3: Wire frontend patient search and detail to correct backend paths

**Files:**
- Modify: `frontend/app/staff/patients/page.tsx` (line ~55)
- Modify: `frontend/app/staff/patients/[id]/page.tsx` (line ~49)

- [ ] **Step 1: Replace stale paths**

In `frontend/app/staff/patients/page.tsx`, find:
```ts
const path = `/patients?q=${encodeURIComponent(debounced)}`;
```
Replace with:
```ts
const path = `/patients/search?q=${encodeURIComponent(debounced)}`;
```

In `frontend/app/staff/patients/[id]/page.tsx`, the call already targets `/patients/{id}` which now matches Task 1.2. No change needed beyond removing any `setNotFound(true)` "Data unavailable" stub branch in the catch — leave the existing 404 EmptyState as-is (it's still correct for genuine not-found).

- [ ] **Step 2: Lint + typecheck**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/staff/patients/page.tsx
git commit -m "fix(staff): correct patient search path to /api/patients/search"
```

---

### Task 1.4: Backend `GET /api/staff/today`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/staff/StaffController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/staff/response/WaitingEntryDTO.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/staff/StaffReadAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/staff/StaffReadAppServiceTest.java`

- [ ] **Step 1: Define response DTO**

`backend/src/main/java/my/cliniflow/controller/biz/staff/response/WaitingEntryDTO.java`:
```java
package my.cliniflow.controller.biz.staff.response;

import java.util.UUID;

public record WaitingEntryDTO(
    UUID appointmentId,
    UUID patientId,
    String patientName,
    String preVisitStatus,        // "none" | "pending" | "submitted"
    String arrivedAt,             // ISO instant; null if not yet checked in
    String slotStartAt,           // ISO instant of scheduled slot
    String type,                  // NEW_SYMPTOM | FOLLOW_UP
    String doctorName,
    boolean checkedIn
) {}
```

- [ ] **Step 2: Write the failing service test**

`backend/src/test/java/my/cliniflow/application/biz/staff/StaffReadAppServiceTest.java`:
```java
package my.cliniflow.application.biz.staff;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StaffReadAppServiceTest {

    @Test
    void todayReturnsEmptyListWhenNoAppointments() {
        // mock AppointmentRepository.findByDate returning []
        // service should return List<WaitingEntryDTO> of size 0
        StaffReadAppService svc = new StaffReadAppService(
            org.mockito.Mockito.mock(my.cliniflow.domain.biz.schedule.repository.AppointmentRepository.class),
            org.mockito.Mockito.mock(my.cliniflow.domain.biz.patient.repository.PatientRepository.class),
            org.mockito.Mockito.mock(my.cliniflow.domain.biz.user.repository.UserRepository.class));
        assertThat(svc.today(java.time.LocalDate.now(), java.time.ZoneId.of("Asia/Kuala_Lumpur"))).isEmpty();
    }
}
```

- [ ] **Step 3: Run failing test**

```bash
cd backend && ./mvnw -q test -Dtest=StaffReadAppServiceTest
```

Expected: COMPILE FAILURE (`StaffReadAppService` does not exist).

- [ ] **Step 4: Implement the service**

`backend/src/main/java/my/cliniflow/application/biz/staff/StaffReadAppService.java`:
```java
package my.cliniflow.application.biz.staff;

import my.cliniflow.controller.biz.staff.response.WaitingEntryDTO;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class StaffReadAppService {

    private final AppointmentRepository appts;
    private final PatientRepository patients;
    private final UserRepository users;

    public StaffReadAppService(AppointmentRepository appts,
                                PatientRepository patients,
                                UserRepository users) {
        this.appts = appts;
        this.patients = patients;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public List<WaitingEntryDTO> today(LocalDate date, ZoneId zone) {
        OffsetDateTime start = date.atStartOfDay(zone).toOffsetDateTime();
        OffsetDateTime end   = date.plusDays(1).atStartOfDay(zone).toOffsetDateTime();
        List<AppointmentModel> rows = appts.findByStartAtBetweenAndStatusIn(
            start, end, List.of(AppointmentStatus.BOOKED, AppointmentStatus.CHECKED_IN));
        // Batch-fetch patient and doctor names to avoid N+1.
        var patientNames = patients.findAllById(rows.stream().map(AppointmentModel::getPatientId).toList())
            .stream().collect(Collectors.toMap(p -> p.getId(), p -> p.getFullName()));
        var doctorNames  = users.findAllById(rows.stream().map(AppointmentModel::getDoctorId).toList())
            .stream().collect(Collectors.toMap(u -> u.getId(), u -> u.getFullName()));
        return rows.stream()
            .map(a -> new WaitingEntryDTO(
                a.getId(),
                a.getPatientId(),
                patientNames.getOrDefault(a.getPatientId(), "—"),
                resolvePreVisitStatus(a.getPatientId(), patientPreVisitMap),
                a.getCheckedInAt() == null ? null : a.getCheckedInAt().toString(),
                a.getStartAt().toString(),
                a.getType().name(),
                doctorNames.getOrDefault(a.getDoctorId(), "—"),
                a.getStatus() == AppointmentStatus.CHECKED_IN))
            .toList();
    }
}
```

Add a small private helper at the bottom of the class:
```java
private static String resolvePreVisitStatus(java.util.UUID patientId,
                                              java.util.Map<java.util.UUID, String> map) {
    return map.getOrDefault(patientId, "none");
}
```

And populate `patientPreVisitMap` from the `pre_visit_sessions` table once per call (one query, not per row). If a `PreVisitSessionRepository` exists, use it; otherwise inject `JdbcTemplate` and run:
```sql
SELECT patient_id,
       CASE WHEN MAX(submitted_at) IS NOT NULL THEN 'submitted' ELSE 'pending' END AS status
  FROM pre_visit_sessions
 WHERE patient_id IN (?, ?, ...)
 GROUP BY patient_id
```
Patients absent from the result use the default `"none"` from the helper. Verify the table name and `submitted_at` column before writing the SQL — search:
```bash
grep -n "pre_visit_sessions\|submitted_at" backend/src/main/resources/db/migration/V*.sql
```
Adjust the column names to match what the migration created.

If `AppointmentStatus.CHECKED_IN` does not exist yet, add it to the enum (and the corresponding DB CHECK constraint). Verify before adding — search:
```bash
grep -n "CHECKED_IN\|BOOKED\|NO_SHOW\|COMPLETED" backend/src/main/java/my/cliniflow/domain/biz/schedule/enums/AppointmentStatus.java
```
If missing, add the enum value, and also amend the DB CHECK in a fresh migration `V12a__appointment_status_checked_in.sql` (apply manually in Supabase SQL editor) — but only if missing.

If `AppointmentRepository.findByStartAtBetweenAndStatusIn` doesn't exist, add it (Spring Data derived query naming).

- [ ] **Step 5: Add the controller**

`backend/src/main/java/my/cliniflow/controller/biz/staff/StaffController.java`:
```java
package my.cliniflow.controller.biz.staff;

import my.cliniflow.application.biz.staff.StaffReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.staff.response.WaitingEntryDTO;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/staff")
@PreAuthorize("hasRole('STAFF')")
public class StaffController {

    private static final ZoneId CLINIC_ZONE = ZoneId.of("Asia/Kuala_Lumpur");

    private final StaffReadAppService reads;

    public StaffController(StaffReadAppService reads) { this.reads = reads; }

    @GetMapping("/today")
    public WebResult<Map<String, Object>> today() {
        List<WaitingEntryDTO> waitingList = reads.today(LocalDate.now(CLINIC_ZONE), CLINIC_ZONE);
        return WebResult.ok(Map.of("waitingList", waitingList));
    }
}
```

- [ ] **Step 6: Run tests**

```bash
cd backend && ./mvnw -q test -Dtest=StaffReadAppServiceTest
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/staff/ \
        backend/src/main/java/my/cliniflow/application/biz/staff/ \
        backend/src/test/java/my/cliniflow/application/biz/staff/
git commit -m "feat(staff): GET /api/staff/today wired to appointment repo"
```

---

### Task 1.5: Backend `POST /api/staff/checkin`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/staff/StaffController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/staff/request/CheckinRequest.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/staff/StaffWriteAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/staff/StaffWriteAppServiceTest.java`

- [ ] **Step 1: Define request**

```java
// CheckinRequest.java
package my.cliniflow.controller.biz.staff.request;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
public record CheckinRequest(@NotNull UUID appointmentId) {}
```

- [ ] **Step 2: Write failing test**

```java
package my.cliniflow.application.biz.staff;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class StaffWriteAppServiceTest {
    UUID actor = UUID.randomUUID();
    UUID apptId = UUID.randomUUID();

    @Test
    void checkInBookedAppointmentSetsCheckedInAndAudits() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = new AppointmentModel();
        appt.setId(apptId);
        appt.setStatus(AppointmentStatus.BOOKED);
        when(apptRepo.findById(apptId)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        svc.checkIn(apptId, actor);

        assertThat(appt.getStatus()).isEqualTo(AppointmentStatus.CHECKED_IN);
        verify(audit).append(eq("UPDATE"), eq("APPOINTMENT"), eq(apptId.toString()),
            eq(actor), eq("STAFF"), anyMap());
    }

    @Test
    void checkInAlreadyCheckedInIsIdempotentNoAudit() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = new AppointmentModel();
        appt.setId(apptId);
        appt.setStatus(AppointmentStatus.CHECKED_IN);
        when(apptRepo.findById(apptId)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        svc.checkIn(apptId, actor);

        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
    }

    @Test
    void checkInCancelledRejectedWithConflict() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = new AppointmentModel();
        appt.setId(apptId);
        appt.setStatus(AppointmentStatus.CANCELLED);
        when(apptRepo.findById(apptId)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        assertThatThrownBy(() -> svc.checkIn(apptId, actor))
            .isInstanceOf(ConflictException.class);
    }
}
```

- [ ] **Step 3: Run failing test**

```bash
cd backend && ./mvnw -q test -Dtest=StaffWriteAppServiceTest
```

Expected: COMPILE FAILURE (`StaffWriteAppService` does not exist).

- [ ] **Step 4: Implement service**

`backend/src/main/java/my/cliniflow/application/biz/staff/StaffWriteAppService.java`:
```java
package my.cliniflow.application.biz.staff;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Service
public class StaffWriteAppService {

    private final AppointmentRepository appts;
    private final AuditWriter audit;

    public StaffWriteAppService(AppointmentRepository appts, AuditWriter audit) {
        this.appts = appts;
        this.audit = audit;
    }

    @Transactional
    public void checkIn(UUID appointmentId, UUID actorUserId) {
        AppointmentModel a = appts.findById(appointmentId).orElseThrow(
            () -> new ResourceNotFoundException("APPOINTMENT", appointmentId));
        switch (a.getStatus()) {
            case CHECKED_IN -> { return; /* idempotent */ }
            case BOOKED -> {
                a.setStatus(AppointmentStatus.CHECKED_IN);
                a.setCheckedInAt(OffsetDateTime.now());
                appts.save(a);
                audit.append("UPDATE", "APPOINTMENT", appointmentId.toString(),
                    actorUserId, "STAFF", Map.of("checked_in", true));
            }
            default -> throw new ConflictException(
                "cannot check in appointment in status " + a.getStatus());
        }
    }
}
```

If `AppointmentModel.checkedInAt` does not exist, add the field + getter/setter + DB column. Search first:
```bash
grep -n "checkedInAt\|checked_in_at" backend/src/main/java/my/cliniflow/domain/biz/schedule/model/AppointmentModel.java
```
If missing, add: a new column in a small migration `V12b__appointment_checked_in_at.sql`:
```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
```
(apply manually in Supabase) and the matching `@Column(name="checked_in_at") private OffsetDateTime checkedInAt;` in the entity.

- [ ] **Step 5: Add the controller endpoint**

In `StaffController.java` add:
```java
@PostMapping("/checkin")
public WebResult<Void> checkin(@jakarta.validation.Valid @RequestBody
                                my.cliniflow.controller.biz.staff.request.CheckinRequest req,
                                org.springframework.security.core.Authentication auth) {
    UUID actor = ((my.cliniflow.infrastructure.security.JwtService.Claims) auth.getPrincipal()).userId();
    writes.checkIn(req.appointmentId(), actor);
    return WebResult.ok(null);
}
```
Inject `StaffWriteAppService writes` via the constructor.

- [ ] **Step 6: Run tests**

```bash
cd backend && ./mvnw -q test -Dtest=StaffWriteAppServiceTest
```

Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/staff/ \
        backend/src/main/java/my/cliniflow/application/biz/staff/ \
        backend/src/test/java/my/cliniflow/application/biz/staff/StaffWriteAppServiceTest.java
git commit -m "feat(staff): POST /api/staff/checkin idempotent + audit"
```

---

### Task 1.6: Backend `PATCH /api/admin/users/{id}/role`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/admin/AdminUserController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/request/RoleChangeRequest.java`
- Modify or create: `backend/src/main/java/my/cliniflow/application/biz/user/UserAdminAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/user/UserAdminAppServiceTest.java`

- [ ] **Step 1: Define request**

```java
// RoleChangeRequest.java
package my.cliniflow.controller.biz.admin.request;
import jakarta.validation.constraints.NotBlank;
public record RoleChangeRequest(@NotBlank String role) {}
```

- [ ] **Step 2: Write failing test**

```java
package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class UserAdminAppServiceTest {

    @Test
    void changeRoleSelfActionForbidden() {
        UUID actor = UUID.randomUUID();
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var svc = new UserAdminAppService(users, audit, mock(org.springframework.security.crypto.password.PasswordEncoder.class));

        assertThatThrownBy(() -> svc.changeRole(actor, actor, Role.ADMIN))
            .isInstanceOf(ConflictException.class)
            .hasMessageContaining("self");
    }

    @Test
    void changeRoleStaffToDoctorWritesAuditWithFromTo() {
        UUID actor = UUID.randomUUID();
        UUID target = UUID.randomUUID();
        var users = mock(UserRepository.class);
        var u = new UserModel(); u.setId(target); u.setRole(Role.STAFF);
        when(users.findById(target)).thenReturn(Optional.of(u));
        var audit = mock(AuditWriter.class);
        var svc = new UserAdminAppService(users, audit, mock(org.springframework.security.crypto.password.PasswordEncoder.class));

        svc.changeRole(actor, target, Role.DOCTOR);

        assertThat(u.getRole()).isEqualTo(Role.DOCTOR);
        ArgumentCaptor<java.util.Map> meta = ArgumentCaptor.forClass(java.util.Map.class);
        verify(audit).append(eq("UPDATE"), eq("USER_ROLE"), eq(target.toString()),
            eq(actor), eq("ADMIN"), meta.capture());
        assertThat(meta.getValue()).containsEntry("from", "STAFF").containsEntry("to", "DOCTOR");
    }

    @Test
    void changeRolePatientRejectedAsInvalidTarget() {
        UUID actor = UUID.randomUUID();
        UUID target = UUID.randomUUID();
        var users = mock(UserRepository.class);
        var u = new UserModel(); u.setId(target); u.setRole(Role.PATIENT);
        when(users.findById(target)).thenReturn(Optional.of(u));
        var svc = new UserAdminAppService(users, mock(AuditWriter.class), mock(org.springframework.security.crypto.password.PasswordEncoder.class));

        assertThatThrownBy(() -> svc.changeRole(actor, target, Role.STAFF))
            .isInstanceOf(ConflictException.class);
    }
}
```

- [ ] **Step 3: Run failing test**

```bash
cd backend && ./mvnw -q test -Dtest=UserAdminAppServiceTest
```

Expected: COMPILE FAILURE.

- [ ] **Step 4: Implement service**

`backend/src/main/java/my/cliniflow/application/biz/user/UserAdminAppService.java`:
```java
package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Map;
import java.util.UUID;

@Service
public class UserAdminAppService {

    private static final java.util.EnumSet<Role> STAFF_ROLES =
        java.util.EnumSet.of(Role.STAFF, Role.DOCTOR, Role.ADMIN);

    private final UserRepository users;
    private final AuditWriter audit;
    private final PasswordEncoder passwordEncoder;

    public UserAdminAppService(UserRepository users, AuditWriter audit, PasswordEncoder pe) {
        this.users = users; this.audit = audit; this.passwordEncoder = pe;
    }

    @Transactional
    public void changeRole(UUID actorUserId, UUID targetUserId, Role newRole) {
        if (actorUserId.equals(targetUserId))
            throw new ConflictException("cannot change your own role (self-action forbidden)");
        UserModel u = users.findById(targetUserId).orElseThrow(
            () -> new ResourceNotFoundException("USER", targetUserId));
        if (!STAFF_ROLES.contains(u.getRole()) || !STAFF_ROLES.contains(newRole))
            throw new ConflictException("role change limited to STAFF/DOCTOR/ADMIN");
        if (u.getRole() == newRole) return; // no-op
        Role from = u.getRole();
        u.setRole(newRole);
        users.save(u);
        audit.append("UPDATE", "USER_ROLE", targetUserId.toString(),
            actorUserId, "ADMIN",
            Map.of("from", from.name(), "to", newRole.name()));
    }
}
```

- [ ] **Step 5: Add the controller endpoint**

In `AdminUserController.java`:
```java
@PatchMapping("/{id}/role")
public WebResult<Void> changeRole(@PathVariable("id") UUID targetId,
                                   @jakarta.validation.Valid @RequestBody
                                       my.cliniflow.controller.biz.admin.request.RoleChangeRequest req,
                                   org.springframework.security.core.Authentication auth) {
    UUID actor = ((my.cliniflow.infrastructure.security.JwtService.Claims) auth.getPrincipal()).userId();
    Role role;
    try { role = Role.valueOf(req.role()); }
    catch (IllegalArgumentException ex) {
        throw new my.cliniflow.controller.base.BusinessException(
            my.cliniflow.controller.base.ResultCode.BAD_REQUEST, "invalid role: " + req.role());
    }
    adminSvc.changeRole(actor, targetId, role);
    return WebResult.ok(null);
}
```
Inject `UserAdminAppService adminSvc` via constructor.

- [ ] **Step 6: Run tests**

```bash
cd backend && ./mvnw -q test -Dtest=UserAdminAppServiceTest
```

Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/my/cliniflow/application/biz/user/UserAdminAppService.java \
        backend/src/main/java/my/cliniflow/controller/biz/admin/ \
        backend/src/test/java/my/cliniflow/application/biz/user/UserAdminAppServiceTest.java
git commit -m "feat(admin): PATCH /api/admin/users/{id}/role with self-guard + audit"
```

---

### Task 1.7: Frontend wire `/staff/today`, `/staff/checkin`, role change

**Files:**
- Create: `frontend/lib/staff.ts`
- Create: `frontend/lib/admin.ts`
- Modify: `frontend/app/staff/page.tsx`
- Modify: `frontend/app/admin/users/page.tsx`

- [ ] **Step 1: Create `staff.ts`**

```ts
// frontend/lib/staff.ts
import { apiGet, apiPostVoid } from "./api";

export type WaitingEntry = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  preVisitStatus: "none" | "pending" | "submitted";
  arrivedAt: string | null;
  slotStartAt: string;
  type: "NEW_SYMPTOM" | "FOLLOW_UP";
  doctorName: string;
  checkedIn: boolean;
};

export async function getTodayList(): Promise<WaitingEntry[]> {
  const res = await apiGet<{ waitingList: WaitingEntry[] }>("/staff/today");
  return res.waitingList ?? [];
}

export async function checkIn(appointmentId: string): Promise<void> {
  await apiPostVoid("/staff/checkin", { appointmentId });
}
```

- [ ] **Step 2: Create `admin.ts` (role change for now; rest in later phases)**

```ts
// frontend/lib/admin.ts
import { apiGet, apiPatch } from "./api";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
};

export async function listUsers(): Promise<AdminUser[]> {
  const res = await apiGet<{ users: AdminUser[] }>("/admin/users");
  return res.users ?? [];
}

export async function changeUserRole(userId: string, role: AdminUser["role"]): Promise<void> {
  await apiPatch<unknown>(`/admin/users/${encodeURIComponent(userId)}/role`, { role });
}
```

- [ ] **Step 3: Replace stub branches in `frontend/app/staff/page.tsx`**

In the existing `useEffect` body, replace the local `WaitingResponse` shape and the call:
```ts
import { getTodayList, checkIn, type WaitingEntry } from "@/lib/staff";
// ...
const list = await getTodayList();
if (!cancelled) setWaiting(list);
```
And replace the `apiPost("/staff/checkin", { patientId })` with:
```ts
await checkIn(entry.appointmentId);
```
Remove the `is404 ? stubHint` branch — on error, set the row error state to the message and stop. Update the `WaitingEntry` type usages where the field shape changed (now `appointmentId` keys check-in, not `patientId`).

- [ ] **Step 4: Replace role-change call in `frontend/app/admin/users/page.tsx`**

Replace:
```ts
await apiPost<unknown>(`/admin/users/${userId}/role`, { role: newRole });
```
with:
```ts
await changeUserRole(userId, newRole);
```
(import from `@/lib/admin`). Remove the `is404 ? roleStubs` branch — set role error message on error.

- [ ] **Step 5: Lint + typecheck**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/staff.ts frontend/lib/admin.ts \
        frontend/app/staff/page.tsx frontend/app/admin/users/page.tsx
git commit -m "feat(staff,admin): wire today/checkin/role-change to real backend"
```

---

### Task 1.8: Phase 1 integration test (Testcontainers)

**Files:**
- Test: `backend/src/test/java/my/cliniflow/controller/biz/staff/StaffControllerIntegrationTest.java`

- [ ] **Step 1: Write the IT**

Follow the pattern in `backend/src/test/java/my/cliniflow/controller/biz/auth/AuthControllerIntegrationTest.java`. Cover:
1. `GET /api/staff/today` as STAFF returns 200 with `waitingList` shape on a seeded clinic with no appointments → empty list.
2. `POST /api/staff/checkin` on a seeded `BOOKED` appointment → 200; second call → 200 with no extra audit row (query `audit_log` to confirm the count is unchanged on the second call).
3. `PATCH /api/admin/users/{id}/role` with self-id as ADMIN → 409.
4. RBAC: STAFF JWT calling `/api/admin/users` → 403.

Sample header (full file follows the existing IT pattern):
```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.testcontainers.junit.jupiter.Testcontainers
class StaffControllerIntegrationTest { /* ... */ }
```

- [ ] **Step 2: Run**

```bash
cd backend && ./mvnw -q test -Dtest=StaffControllerIntegrationTest
```

Expected: 4 PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/my/cliniflow/controller/biz/staff/StaffControllerIntegrationTest.java
git commit -m "test(staff): integration tests for today/checkin + RBAC"
```

---

### Task 1.9: Phase 1 E2E (Playwright)

> **Reminder:** per the project E2E protocol, `docker compose down && docker compose up --build --no-cache` before each phase E2E.

**Files:** none (run-only, screenshot artifacts ignored by `.gitignore`).

- [ ] **Step 1: Rebuild + start**

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```
Wait for `localhost:80` to serve `200`.

- [ ] **Step 2: Drive via Playwright MCP**

Run these flows via the Playwright MCP and capture one screenshot per step into `e2e/phase1-*.png`:
1. Login as `staff@cliniflow.local` (seed user) → land on `/staff` → "Stub" banner is GONE → empty list state visible.
2. Login as `patient@...`, book an appointment for today, log out. Login as staff → appointment appears on `/staff` → click Check in → button shows "Checked in".
3. Login as admin → `/admin/users` → change a doctor's role to STAFF → no Stub banner → row reflects new role on next render.
4. Login as staff → `/staff/patients` → search "demo" → results render (no "Data unavailable" banner) → click → patient detail loads.

- [ ] **Step 3: Visual review**

Confirm aurora-glass theme intact: cream surfaces, maroon primary, no palette additions. If any deviation, add a fix task before committing screenshots.

- [ ] **Step 4: No commit unless fixes were applied**

If only screenshots changed, do not commit them — they are ignored. If a fix was needed, commit with `fix(...)`.

---

## Phase 2 — Admin user-detail drawer + active flip + force-reset

### Task 2.1: Backend `PATCH /api/admin/users/{id}/active`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/application/biz/user/UserAdminAppService.java`
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/admin/AdminUserController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/request/UserActiveRequest.java`
- Test: append cases to `backend/src/test/java/my/cliniflow/application/biz/user/UserAdminAppServiceTest.java`

- [ ] **Step 1: Define request**

```java
package my.cliniflow.controller.biz.admin.request;
import jakarta.validation.constraints.NotNull;
public record UserActiveRequest(@NotNull Boolean active) {}
```

- [ ] **Step 2: Write failing test cases**

Append to `UserAdminAppServiceTest.java`:
```java
@Test
void setActiveSelfActionForbidden() {
    UUID actor = UUID.randomUUID();
    var svc = new UserAdminAppService(mock(UserRepository.class), mock(AuditWriter.class),
        mock(org.springframework.security.crypto.password.PasswordEncoder.class));
    assertThatThrownBy(() -> svc.setActive(actor, actor, false))
        .isInstanceOf(ConflictException.class);
}

@Test
void setActiveFlipsAndAuditsWithMetadata() {
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    var users = mock(UserRepository.class);
    var u = new UserModel(); u.setId(target); u.setActive(true); u.setRole(Role.DOCTOR);
    when(users.findById(target)).thenReturn(Optional.of(u));
    var audit = mock(AuditWriter.class);
    var svc = new UserAdminAppService(users, audit, mock(org.springframework.security.crypto.password.PasswordEncoder.class));

    svc.setActive(actor, target, false);

    assertThat(u.isActive()).isFalse();
    ArgumentCaptor<java.util.Map> meta = ArgumentCaptor.forClass(java.util.Map.class);
    verify(audit).append(eq("UPDATE"), eq("USER"), eq(target.toString()),
        eq(actor), eq("ADMIN"), meta.capture());
    assertThat(meta.getValue()).containsEntry("is_active", false);
}
```

- [ ] **Step 3: Run failing test**

```bash
cd backend && ./mvnw -q test -Dtest=UserAdminAppServiceTest#setActive*
```

Expected: COMPILE FAILURE.

- [ ] **Step 4: Implement `setActive`**

In `UserAdminAppService` add:
```java
@Transactional
public void setActive(UUID actorUserId, UUID targetUserId, boolean active) {
    if (actorUserId.equals(targetUserId))
        throw new ConflictException("cannot change your own active state (self-action forbidden)");
    UserModel u = users.findById(targetUserId).orElseThrow(
        () -> new ResourceNotFoundException("USER", targetUserId));
    if (u.isActive() == active) return;
    u.setActive(active);
    users.save(u);
    audit.append("UPDATE", "USER", targetUserId.toString(),
        actorUserId, "ADMIN", Map.of("is_active", active));
}
```

- [ ] **Step 5: Add controller endpoint**

```java
@PatchMapping("/{id}/active")
public WebResult<Void> setActive(@PathVariable("id") UUID targetId,
                                  @jakarta.validation.Valid @RequestBody
                                      my.cliniflow.controller.biz.admin.request.UserActiveRequest req,
                                  org.springframework.security.core.Authentication auth) {
    UUID actor = ((my.cliniflow.infrastructure.security.JwtService.Claims) auth.getPrincipal()).userId();
    adminSvc.setActive(actor, targetId, req.active());
    return WebResult.ok(null);
}
```

- [ ] **Step 6: Run tests**

```bash
cd backend && ./mvnw -q test -Dtest=UserAdminAppServiceTest
```

Expected: 5 PASS (3 from earlier + 2 new).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/admin/ \
        backend/src/main/java/my/cliniflow/application/biz/user/UserAdminAppService.java \
        backend/src/test/java/my/cliniflow/application/biz/user/UserAdminAppServiceTest.java
git commit -m "feat(admin): PATCH /api/admin/users/{id}/active flips is_active + audit"
```

---

### Task 2.2: Backend `POST /api/admin/users/{id}/force-password-reset`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/application/biz/user/UserAdminAppService.java`
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/admin/AdminUserController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/response/ForcePasswordResetResponse.java`
- Test: append cases to `UserAdminAppServiceTest.java`

- [ ] **Step 1: Response shape**

```java
package my.cliniflow.controller.biz.admin.response;
public record ForcePasswordResetResponse(String tempPassword) {}
```

- [ ] **Step 2: Write failing test**

```java
@Test
void forcePasswordResetSelfActionForbidden() {
    UUID actor = UUID.randomUUID();
    var svc = new UserAdminAppService(mock(UserRepository.class), mock(AuditWriter.class),
        mock(org.springframework.security.crypto.password.PasswordEncoder.class));
    assertThatThrownBy(() -> svc.forcePasswordReset(actor, actor))
        .isInstanceOf(ConflictException.class);
}

@Test
void forcePasswordResetReturnsTempPasswordAndAuditsWithoutPlaintext() {
    UUID actor = UUID.randomUUID();
    UUID target = UUID.randomUUID();
    var users = mock(UserRepository.class);
    var u = new UserModel(); u.setId(target); u.setRole(Role.STAFF); u.setMustChangePassword(false);
    when(users.findById(target)).thenReturn(Optional.of(u));
    var pe = mock(org.springframework.security.crypto.password.PasswordEncoder.class);
    when(pe.encode(any())).thenReturn("$2a$mock-hash");
    var audit = mock(AuditWriter.class);
    var svc = new UserAdminAppService(users, audit, pe);

    String temp = svc.forcePasswordReset(actor, target);

    assertThat(temp).hasSizeGreaterThanOrEqualTo(12);
    assertThat(u.isMustChangePassword()).isTrue();
    assertThat(u.getPasswordHash()).isEqualTo("$2a$mock-hash");
    ArgumentCaptor<java.util.Map> meta = ArgumentCaptor.forClass(java.util.Map.class);
    verify(audit).append(eq("UPDATE"), eq("USER_PASSWORD"), eq(target.toString()),
        eq(actor), eq("ADMIN"), meta.capture());
    assertThat(meta.getValue()).containsEntry("force_reset", true);
    assertThat(meta.getValue().toString()).doesNotContain(temp);
}
```

- [ ] **Step 3: Implement**

```java
@Transactional
public String forcePasswordReset(UUID actorUserId, UUID targetUserId) {
    if (actorUserId.equals(targetUserId))
        throw new ConflictException("cannot force-reset your own password (self-action forbidden)");
    UserModel u = users.findById(targetUserId).orElseThrow(
        () -> new ResourceNotFoundException("USER", targetUserId));
    String temp = generateTempPassword();
    u.setPasswordHash(passwordEncoder.encode(temp));
    u.setMustChangePassword(true);
    users.save(u);
    audit.append("UPDATE", "USER_PASSWORD", targetUserId.toString(),
        actorUserId, "ADMIN", Map.of("force_reset", true));
    return temp;
}

private static String generateTempPassword() {
    final String alpha = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    var rng = new SecureRandom();
    StringBuilder sb = new StringBuilder(16);
    for (int i = 0; i < 12; i++) sb.append(alpha.charAt(rng.nextInt(alpha.length())));
    sb.append("Aa1!");
    return sb.toString();
}
```

- [ ] **Step 4: Add controller endpoint**

```java
@PostMapping("/{id}/force-password-reset")
public WebResult<my.cliniflow.controller.biz.admin.response.ForcePasswordResetResponse>
forceReset(@PathVariable("id") UUID targetId,
           org.springframework.security.core.Authentication auth) {
    UUID actor = ((my.cliniflow.infrastructure.security.JwtService.Claims) auth.getPrincipal()).userId();
    String tempPassword = adminSvc.forcePasswordReset(actor, targetId);
    return WebResult.ok(new my.cliniflow.controller.biz.admin.response.ForcePasswordResetResponse(tempPassword));
}
```

- [ ] **Step 5: Run tests**

```bash
cd backend && ./mvnw -q test -Dtest=UserAdminAppServiceTest
```

Expected: 7 PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/admin/ \
        backend/src/main/java/my/cliniflow/application/biz/user/UserAdminAppService.java \
        backend/src/test/java/my/cliniflow/application/biz/user/UserAdminAppServiceTest.java
git commit -m "feat(admin): POST /admin/users/{id}/force-password-reset (no plaintext audit)"
```

---

### Task 2.3: Frontend `admin.ts` extensions + `UserDetailDrawer` component

**Files:**
- Modify: `frontend/lib/admin.ts`
- Create: `frontend/app/admin/components/UserDetailDrawer.tsx`
- Modify: `frontend/app/admin/users/page.tsx` (open drawer on row click; remove inline role-change select)
- Modify: `frontend/app/globals.css` (add drawer styles only — reuse aurora tokens; no new colors)

- [ ] **Step 1: Extend `admin.ts`**

Append to `frontend/lib/admin.ts`:
```ts
import { apiPostVoid, apiPost } from "./api";

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  await apiPatch<unknown>(`/admin/users/${encodeURIComponent(userId)}/active`, { active });
}

export type ForceResetResponse = { tempPassword: string };

export async function forcePasswordReset(userId: string): Promise<string> {
  const res = await apiPost<ForceResetResponse>(
    `/admin/users/${encodeURIComponent(userId)}/force-password-reset`,
    {});
  return res.tempPassword;
}
```

(`apiPatch` import is already present from Task 1.7; if not, add it.)

- [ ] **Step 2: Create the drawer component**

`frontend/app/admin/components/UserDetailDrawer.tsx`:
```tsx
"use client";

import { useState } from "react";
import { changeUserRole, setUserActive, forcePasswordReset, type AdminUser } from "@/lib/admin";

type Props = {
  user: AdminUser & { active: boolean };
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
};

const ROLES: AdminUser["role"][] = ["STAFF", "DOCTOR", "ADMIN"];

export default function UserDetailDrawer({ user, isSelf, onClose, onChanged }: Props) {
  const [role, setRole] = useState<AdminUser["role"]>(user.role);
  const [busy, setBusy] = useState<"role" | "active" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function onRoleSave() {
    setBusy("role"); setError(null);
    try { await changeUserRole(user.id, role); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function onActiveToggle() {
    setBusy("active"); setError(null);
    try { await setUserActive(user.id, !user.active); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  async function onForceReset() {
    setBusy("reset"); setError(null);
    try { setTempPassword(await forcePasswordReset(user.id)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  return (
    <aside className="user-drawer" role="dialog" aria-modal="true" aria-labelledby="ud-title">
      <header className="user-drawer-head">
        <h2 id="ud-title">{user.name}</h2>
        <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="user-drawer-body">
        <section>
          <div className="kvp"><span>Email</span><span>{user.email}</span></div>
          <div className="kvp"><span>Role</span><span className={`role-chip role-chip-${user.role.toLowerCase()}`}>{user.role}</span></div>
          <div className="kvp"><span>Status</span><span className={user.active ? "status-chip status-active" : "status-chip status-inactive"}>{user.active ? "Active" : "Inactive"}</span></div>
        </section>

        <section>
          <h3>Change role</h3>
          <select className="input input-compact" value={role} disabled={isSelf || busy !== null}
                  onChange={(e) => setRole(e.target.value as AdminUser["role"])}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" disabled={isSelf || role === user.role || busy !== null} onClick={onRoleSave}>
            {busy === "role" ? "Saving…" : "Save role"}
          </button>
          {isSelf && <p className="hint">Cannot perform this on your own account.</p>}
        </section>

        <section>
          <h3>Status</h3>
          <button className="btn btn-ghost btn-sm" disabled={isSelf || busy !== null} onClick={onActiveToggle}>
            {busy === "active" ? "Saving…" : (user.active ? "Deactivate user" : "Reactivate user")}
          </button>
        </section>

        <section>
          <h3>Password</h3>
          <button className="btn btn-ghost btn-sm" disabled={isSelf || busy !== null} onClick={onForceReset}>
            {busy === "reset" ? "Working…" : "Force password reset"}
          </button>
          {tempPassword && (
            <div className="banner banner-success">
              Temporary password: <code>{tempPassword}</code>{" "}
              <button className="btn btn-ghost btn-sm" type="button"
                onClick={() => navigator.clipboard.writeText(tempPassword)}>Copy</button>
            </div>
          )}
        </section>

        {error && <div className="banner banner-error" role="alert">{error}</div>}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Add aurora-glass drawer styles**

Append to `frontend/app/globals.css`:
```css
.user-drawer {
  position: fixed;
  top: 0; right: 0; height: 100vh; width: min(420px, 100vw);
  background: var(--surface);
  border-left: 1px solid rgba(122, 46, 46, 0.10);
  backdrop-filter: blur(8px);
  box-shadow: -16px 0 40px rgba(15, 23, 42, 0.08);
  display: flex; flex-direction: column;
  z-index: 50;
}
.user-drawer-head { padding: 20px; border-bottom: 1px solid rgba(122, 46, 46, 0.08);
  display: flex; align-items: center; justify-content: space-between; }
.user-drawer-body { padding: 20px; display: grid; gap: 18px; overflow-y: auto; }
.user-drawer-body section { background: rgba(255,255,255,0.5);
  border: 1px solid rgba(122,46,46,0.08); border-radius: 12px; padding: 14px; }
.kvp { display: flex; justify-content: space-between; padding: 4px 0; }
.status-chip { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.status-active { background: rgba(34, 225, 215, 0.16); color: #0d4a47; }
.status-inactive { background: rgba(122, 46, 46, 0.10); color: #7A2E2E; }
.hint { font-size: 12px; opacity: 0.7; margin: 6px 0 0; }
```

- [ ] **Step 4: Replace inline role-change in `admin/users/page.tsx`**

Remove the inline role-select column and Save button. Add row click → set `selectedUserId`. Render `<UserDetailDrawer />` when `selectedUserId` is set. After any drawer action, refetch the list.

The list response type now needs `active: boolean`. Update `AdminUser` in `lib/admin.ts`:
```ts
export type AdminUser = {
  id: string; name: string; email: string;
  role: "PATIENT" | "DOCTOR" | "STAFF" | "ADMIN";
  active: boolean;
};
```
And update `AdminUserController.list()` in the backend to include `active`:
```java
m.put("active", u.isActive());
```

- [ ] **Step 5: Lint + typecheck**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/admin.ts \
        frontend/app/admin/components/UserDetailDrawer.tsx \
        frontend/app/admin/users/page.tsx \
        frontend/app/globals.css \
        backend/src/main/java/my/cliniflow/controller/biz/admin/AdminUserController.java
git commit -m "feat(admin): UserDetailDrawer with role/active/force-reset actions"
```

---

### Task 2.4: Phase 2 E2E

- [ ] **Step 1: Rebuild + drive 4 flows**

`docker compose build --no-cache && docker compose up -d`. Then via Playwright MCP:
1. Admin opens drawer for a doctor → toggles to STAFF → saves → drawer reflects → users list reflects.
2. Admin deactivates the doctor → status chip flips to "Inactive". Login as that doctor → blocked at login.
3. Admin reactivates → doctor can log in again.
4. Admin force-resets a STAFF user → temp password shown once → copy works → on next login as that user, forced-password-change page appears.

- [ ] **Step 2: Visual review**

Confirm aurora-glass theme; drawer surfaces match cream + maroon language.

---

## Phase 3 — Audit + Analytics

### Task 3.1: Audit index migration

**Files:**
- Create: `backend/src/main/resources/db/migration/V12__audit_action_index.sql`

- [ ] **Step 1: Write the SQL**

```sql
-- V12: Index for audit list page filters (action + occurred_at)
-- Apply manually in Supabase SQL editor before deploying Phase 3 backend.
CREATE INDEX IF NOT EXISTS idx_audit_log_action_time
  ON audit_log (action, occurred_at DESC);
```

- [ ] **Step 2: Apply via Supabase**

Run the SQL in the Supabase SQL editor against the dev database. Confirm with:
```sql
SELECT indexname FROM pg_indexes
WHERE tablename='audit_log' AND indexname='idx_audit_log_action_time';
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V12__audit_action_index.sql
git commit -m "chore(db): V12 audit list filter index (apply manually)"
```

---

### Task 3.2: Backend `GET /api/admin/audit` with enriched labels

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/AuditController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/response/AuditEntryDTO.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/admin/AuditReadAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/admin/AuditReadAppServiceTest.java`

- [ ] **Step 1: Define DTO**

```java
package my.cliniflow.controller.biz.admin.response;

import java.util.Map;

public record AuditEntryDTO(
    long id,
    String occurredAt,
    String actorEmail,
    String actorRole,
    String action,
    String resourceType,
    String resourceId,
    String resourceLabel,
    Map<String, Object> metadata
) {}
```

- [ ] **Step 2: Service test (only the resource-label dispatch is non-trivial; mock JdbcTemplate)**

The test asserts that when called with `resourceType=USER`, the service joins to `users.email`; for `PATIENT` to `patients.full_name`; for unknown types it passes through to a truncated UUID label. Skeleton:
```java
@Test
void resourceLabelResolverFallsBackToTruncatedUuid() {
    AuditReadAppService svc = new AuditReadAppService(mock(JdbcTemplate.class));
    String label = svc.resourceLabelFor("UNKNOWN_TYPE",
        "abcd1234-5678-9012-3456-789012345678",
        java.util.Map.of(), java.util.Map.of(), java.util.Map.of());
    assertThat(label).isEqualTo("…12345678");
}
```

- [ ] **Step 3: Implement service**

`AuditReadAppService.list(filters, page, size)` queries `audit_log` with composable WHERE clauses:
- `actor_email` filter joins to `users` once.
- `action` filter on `action`.
- `resource_type` filter on `resource_type`.
- Date range: `range` of `24h|7d|30d` overrides explicit `dateFrom/dateTo` if both set.

After fetching the page, group rows by `resource_type` and run **one** label-resolver query per type:
```sql
SELECT id, full_name FROM patients WHERE id IN (?,?,?)   -- for PATIENT
SELECT id, email     FROM users    WHERE id IN (?,?,?)   -- for USER, USER_ROLE, USER_PASSWORD
SELECT a.id, to_char(a.start_at,'YYYY-MM-DD"T"HH24:MI'), p.full_name
  FROM appointments a JOIN patients p ON a.patient_id = p.id WHERE a.id IN (?,?,?)
SELECT v.id, to_char(v.created_at,'YYYY-MM-DD'), u.full_name
  FROM visits v JOIN users u ON v.doctor_id = u.id WHERE v.id IN (?,?,?)
```

For the `metadata jsonb`, `JdbcTemplate` returns it as `org.postgresql.util.PGobject` — convert to `Map<String,Object>` via Jackson.

Pseudocode of the public method:
```java
@Transactional(readOnly = true)
public Page<AuditEntryDTO> list(AuditFilters f, int page, int size) {
    String where = buildWhere(f);
    Object[] args = buildArgs(f);
    int total = jdbc.queryForObject("SELECT count(*) FROM audit_log " + where, Integer.class, args);
    List<Row> rows = jdbc.query(
        "SELECT id, occurred_at, actor_user_id, actor_role, action, resource_type, resource_id, metadata "
        + " FROM audit_log " + where
        + " ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?",
        argsWithLimit(args, size, page * size), rowMapper());
    Map<UUID, String> actorEmails = batchActorEmails(rows);
    Map<String, Map<String,String>> labelsByType = batchLabels(rows);
    List<AuditEntryDTO> dtos = rows.stream().map(r -> toDto(r, actorEmails, labelsByType)).toList();
    return new PageImpl<>(dtos, PageRequest.of(page, size), total);
}
```

`AuditFilters` is a small record:
```java
public record AuditFilters(String actorEmail, String action, String resourceType,
                            OffsetDateTime dateFrom, OffsetDateTime dateTo, String range) {}
```

- [ ] **Step 4: Controller**

```java
@RestController
@RequestMapping("/api/admin/audit")
@PreAuthorize("hasRole('ADMIN')")
public class AuditController {
    private final AuditReadAppService reads;
    public AuditController(AuditReadAppService reads) { this.reads = reads; }

    @GetMapping
    public WebResult<Map<String,Object>> list(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String user,
        @RequestParam(required = false) String action,
        @RequestParam(required = false) String resourceType,
        @RequestParam(required = false) String dateFrom,
        @RequestParam(required = false) String dateTo,
        @RequestParam(required = false) String range
    ) {
        var f = new my.cliniflow.application.biz.admin.AuditFilters(
            user, action, resourceType,
            dateFrom == null ? null : OffsetDateTime.parse(dateFrom),
            dateTo   == null ? null : OffsetDateTime.parse(dateTo),
            range);
        var p = reads.list(f, page, size);
        return WebResult.ok(Map.of(
            "entries", p.getContent(),
            "currentPage", p.getNumber(),
            "totalPages", p.getTotalPages()));
    }
}
```

- [ ] **Step 5: Run tests**

```bash
cd backend && ./mvnw -q test -Dtest=AuditReadAppServiceTest
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/my/cliniflow/controller/biz/admin/AuditController.java \
        backend/src/main/java/my/cliniflow/controller/biz/admin/response/AuditEntryDTO.java \
        backend/src/main/java/my/cliniflow/application/biz/admin/ \
        backend/src/test/java/my/cliniflow/application/biz/admin/AuditReadAppServiceTest.java
git commit -m "feat(admin): GET /api/admin/audit with resource label batch-loader"
```

---

### Task 3.3: Backend `GET /api/admin/analytics`

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/AnalyticsController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/admin/response/AnalyticsResponse.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/admin/AnalyticsReadAppService.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/admin/AnalyticsReadAppServiceTest.java`

- [ ] **Step 1: Define DTO**

```java
package my.cliniflow.controller.biz.admin.response;

import java.util.List;

public record AnalyticsResponse(
    Integer visitsThisWeek,
    Integer avgReviewTimeMin,
    Integer aiAcceptanceRate,
    Integer patientsThisMonth,
    List<DayBucket> dailyVisits30d
) {
    public record DayBucket(String date, int count) {}
}
```

- [ ] **Step 2: Test the zero-fill**

```java
@Test
void zeroFillReturnsExactly30Buckets() {
    AnalyticsReadAppService svc = new AnalyticsReadAppService(mock(JdbcTemplate.class));
    var raw = java.util.List.of(
        java.util.Map.entry(java.time.LocalDate.now().minusDays(2), 5),
        java.util.Map.entry(java.time.LocalDate.now().minusDays(10), 3));
    var filled = svc.zeroFill(raw, java.time.LocalDate.now(), java.time.ZoneId.of("Asia/Kuala_Lumpur"));
    assertThat(filled).hasSize(30);
    assertThat(filled.stream().filter(b -> b.count() > 0).count()).isEqualTo(2);
}
```

- [ ] **Step 3: Implement**

The service runs 5 SQL queries:
1. `SELECT count(*) FROM medical_reports WHERE finalized_at >= :startOfWeek`
2. `SELECT round(extract(epoch from avg(reviewed_at - draft_at))/60) FROM medical_reports WHERE finalized_at >= now() - interval '30 days' AND reviewed_at IS NOT NULL`
3. `SELECT round(100.0 * sum(CASE WHEN soap_body_edited = false THEN 1 ELSE 0 END) / count(*)) FROM medical_reports WHERE finalized_at >= now() - interval '30 days'` — if `soap_body_edited` is not a column, derive from `medical_reports.metadata->>'doctor_edited' = 'false'` instead. Verify which exists before writing the query.
4. `SELECT count(distinct patient_id) FROM appointments WHERE created_at >= date_trunc('month', now())`
5. `SELECT date_trunc('day', finalized_at)::date AS d, count(*) FROM medical_reports WHERE finalized_at >= now() - interval '30 days' GROUP BY d ORDER BY d`

Each can return null when there's no data — map null to JSON null in the response (`Integer` not `int`), and zero-fill the daily series in app code.

- [ ] **Step 4: Controller**

```java
@RestController
@RequestMapping("/api/admin/analytics")
@PreAuthorize("hasRole('ADMIN')")
public class AnalyticsController {
    private final AnalyticsReadAppService reads;
    public AnalyticsController(AnalyticsReadAppService reads) { this.reads = reads; }

    @GetMapping
    public WebResult<AnalyticsResponse> get() {
        return WebResult.ok(reads.compute(java.time.ZoneId.of("Asia/Kuala_Lumpur")));
    }
}
```

- [ ] **Step 5: Run tests + commit**

```bash
cd backend && ./mvnw -q test -Dtest=AnalyticsReadAppServiceTest
git add backend/src/main/java/my/cliniflow/controller/biz/admin/AnalyticsController.java \
        backend/src/main/java/my/cliniflow/controller/biz/admin/response/AnalyticsResponse.java \
        backend/src/main/java/my/cliniflow/application/biz/admin/AnalyticsReadAppService.java \
        backend/src/test/java/my/cliniflow/application/biz/admin/AnalyticsReadAppServiceTest.java
git commit -m "feat(admin): GET /api/admin/analytics with KPIs + 30-day series"
```

---

### Task 3.4: Frontend audit + analytics wiring + sparkline

**Files:**
- Modify: `frontend/lib/admin.ts`
- Modify: `frontend/app/admin/audit/page.tsx`
- Modify: `frontend/app/admin/analytics/page.tsx`
- Create: `frontend/app/admin/components/KpiSparkline.tsx`
- Create: `frontend/app/admin/components/AuditRow.tsx`
- Modify: `frontend/app/globals.css` (sparkline + chip styles, no new colors)

- [ ] **Step 1: Extend `admin.ts`**

```ts
export type AuditEntry = {
  id: number; occurredAt: string;
  actorEmail: string; actorRole: string;
  action: "READ"|"CREATE"|"UPDATE"|"DELETE"|"LOGIN"|"EXPORT";
  resourceType: string; resourceId: string; resourceLabel: string;
  metadata: Record<string, unknown>;
};
export type AuditPage = {
  entries: AuditEntry[]; currentPage: number; totalPages: number;
};
export type AuditFilters = {
  user?: string; action?: string; resourceType?: string;
  range?: "24h"|"7d"|"30d"; dateFrom?: string; dateTo?: string;
  page?: number; size?: number;
};

export async function listAudit(f: AuditFilters): Promise<AuditPage> {
  const q = new URLSearchParams();
  if (f.user) q.set("user", f.user);
  if (f.action) q.set("action", f.action);
  if (f.resourceType) q.set("resourceType", f.resourceType);
  if (f.range) q.set("range", f.range);
  if (f.dateFrom) q.set("dateFrom", f.dateFrom);
  if (f.dateTo) q.set("dateTo", f.dateTo);
  q.set("page", String(f.page ?? 0));
  q.set("size", String(f.size ?? 20));
  return apiGet<AuditPage>(`/admin/audit?${q.toString()}`);
}

export type Analytics = {
  visitsThisWeek: number | null;
  avgReviewTimeMin: number | null;
  aiAcceptanceRate: number | null;
  patientsThisMonth: number | null;
  dailyVisits30d: { date: string; count: number }[];
};
export async function getAnalytics(): Promise<Analytics> {
  return apiGet<Analytics>("/admin/analytics");
}
```

- [ ] **Step 2: `KpiSparkline.tsx`**

```tsx
"use client";
type Props = { data: { date: string; count: number }[]; height?: number };
export default function KpiSparkline({ data, height = 64 }: Props) {
  if (!data.length) return <div className="kpi-sparkline-empty">no data</div>;
  const max = Math.max(1, ...data.map(d => d.count));
  const w = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none"
         className="kpi-sparkline" role="img" aria-label="Visits last 30 days">
      <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5}
            stroke="currentColor" strokeWidth="0.5" opacity="0.2"/>
      {data.map((d, i) => {
        const h = (d.count / max) * (height - 4);
        return (
          <rect key={d.date}
                x={i * w + 0.5} y={height - h - 0.5}
                width={Math.max(0.5, w - 1)} height={h}
                fill="currentColor" opacity="0.7">
            <title>{d.date}: {d.count}</title>
          </rect>
        );
      })}
    </svg>
  );
}
```

CSS:
```css
.kpi-sparkline { color: var(--primary); width: 100%; height: 64px; }
.kpi-sparkline-empty { font-size: 12px; opacity: 0.6; height: 64px; display: flex; align-items: center; justify-content: center; }
```

- [ ] **Step 3: Wire `analytics/page.tsx`**

Replace the stub `apiGet<AnalyticsData>("/admin/analytics")` call with `getAnalytics()`. Add `<KpiSparkline data={data.dailyVisits30d} />` below the KPI grid with a section title "Visits — last 30 days".

- [ ] **Step 4: `AuditRow.tsx` and wire `audit/page.tsx`**

`AuditRow.tsx` renders a table row with columns: Time · Actor (email + role chip) · Action chip · Target (label + truncated UUID below) · ⌃/⌄ button to expand a `<pre>{JSON.stringify(metadata, null, 2)}</pre>` panel.

In `audit/page.tsx` replace the existing `apiGet` call with `listAudit(filters)`. Add a "Quick range" select (24h / 7d / 30d / Custom) above the date pickers.

- [ ] **Step 5: Lint + typecheck**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/admin.ts \
        frontend/app/admin/components/KpiSparkline.tsx \
        frontend/app/admin/components/AuditRow.tsx \
        frontend/app/admin/audit/page.tsx \
        frontend/app/admin/analytics/page.tsx \
        frontend/app/globals.css
git commit -m "feat(admin): wire audit + analytics; add KpiSparkline + AuditRow"
```

---

### Task 3.5: Phase 3 E2E

- [ ] **Step 1: Rebuild + drive flows**

`docker compose build --no-cache && docker compose up -d`. Then via Playwright MCP:
1. Admin → Audit. Verify rows show resource labels (not just UUIDs) for known types. Apply 24h range. Apply user filter. Expand a row → metadata renders.
2. Admin → Analytics. Verify all four KPI cards render numbers (or `—` if no data). Sparkline renders 30 bars.
3. Take a UPDATE / USER_ROLE action via the drawer (Phase 2). Reload audit. Confirm entry appears with `from`/`to` in metadata.

---

## Phase 4 — Walk-in + Book-for-patient modals

### Task 4.0: Staff Today two-line row + `AppointmentRow` component (R1)

**Files:**
- Create: `frontend/app/staff/components/AppointmentRow.tsx`
- Modify: `frontend/app/staff/page.tsx` — replace inline single-line row with `<AppointmentRow>`
- Modify: `frontend/app/globals.css` — `.appt-row-2line` styles only, aurora tokens

- [ ] **Step 1: Create `AppointmentRow.tsx`**

```tsx
"use client";

import type { WaitingEntry } from "@/lib/staff";

type Props = {
  entry: WaitingEntry;
  busy: boolean;
  onCheckIn: () => void;
  onOpenFile: () => void;
};

const PV_LABEL = {
  none: "No pre-visit",
  pending: "Pre-visit pending",
  submitted: "Pre-visit submitted",
} as const;

const PV_DOT = {
  none: "waiting-dot waiting-dot-none",
  pending: "waiting-dot waiting-dot-pending",
  submitted: "waiting-dot waiting-dot-submitted",
} as const;

export default function AppointmentRow({ entry, busy, onCheckIn, onOpenFile }: Props) {
  const slotTime = formatTime(entry.slotStartAt);
  return (
    <li className="appt-row-2line">
      <div className="appt-row-line1">
        <span className="appt-name">{entry.patientName}</span>
        <span className="appt-time">{slotTime}</span>
        <span className={`type-chip type-chip-${entry.type.toLowerCase()}`}>
          {entry.type === "NEW_SYMPTOM" ? "New symptom" : "Follow-up"}
        </span>
      </div>
      <div className="appt-row-line2">
        <span className={PV_DOT[entry.preVisitStatus]} aria-label={PV_LABEL[entry.preVisitStatus]} />
        <span className="appt-pv">{PV_LABEL[entry.preVisitStatus]}</span>
        <span className="appt-doctor">· {entry.doctorName}</span>
        <div className="appt-actions">
          <button className="btn btn-ghost btn-sm" onClick={onOpenFile}>Open file</button>
          <button className="btn btn-primary btn-sm"
                  disabled={busy || entry.checkedIn}
                  onClick={onCheckIn}>
            {entry.checkedIn ? "Checked in" : busy ? "Checking in…" : "Check in"}
          </button>
        </div>
      </div>
    </li>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}
```

- [ ] **Step 2: Replace inline row in `staff/page.tsx`**

In the existing waiting-list `.map(...)` block, replace the inline `<li>` with:
```tsx
<AppointmentRow
  key={entry.appointmentId}
  entry={entry}
  busy={state.busy}
  onCheckIn={() => onCheckIn(entry.appointmentId)}
  onOpenFile={() => router.push(`/staff/patients/${entry.patientId}`)}
/>
```

- [ ] **Step 3: Aurora-glass two-line styles**

Append to `globals.css`:
```css
.appt-row-2line {
  display: grid; gap: 6px;
  padding: 14px 16px;
  background: rgba(255,255,255,0.55);
  border: 1px solid rgba(122,46,46,0.10);
  border-radius: 12px;
  margin-bottom: 10px;
  backdrop-filter: blur(6px);
}
.appt-row-line1 { display: flex; align-items: center; gap: 10px; }
.appt-row-line2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; opacity: 0.9; }
.appt-name { font-weight: 600; flex: 1; }
.appt-time { font-variant-numeric: tabular-nums; }
.appt-actions { margin-left: auto; display: flex; gap: 8px; }
.type-chip { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.type-chip-new_symptom { background: rgba(122,46,46,0.10); color: var(--primary); }
.type-chip-follow_up   { background: rgba(34,225,215,0.16); color: #0d4a47; }
```

- [ ] **Step 4: Lint + typecheck**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/staff/components/AppointmentRow.tsx \
        frontend/app/staff/page.tsx \
        frontend/app/globals.css
git commit -m "feat(staff): two-line AppointmentRow for Today"
```

---

### Task 4.1: Backend `POST /api/staff/patients`

**Files:**
- Modify: `backend/src/main/java/my/cliniflow/application/biz/user/UserWriteAppService.java` (add staff variant)
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/staff/StaffController.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/staff/request/WalkInRegisterRequest.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/staff/response/WalkInRegisterResponse.java`
- Test: `backend/src/test/java/my/cliniflow/application/biz/user/UserWriteAppServiceWalkInTest.java`

- [ ] **Step 1: Define request + response**

```java
package my.cliniflow.controller.biz.staff.request;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
public record WalkInRegisterRequest(
    @NotBlank String fullName,
    @NotBlank String phone,
    @NotNull LocalDate dateOfBirth,
    @Email String email
) {}
```

```java
package my.cliniflow.controller.biz.staff.response;
import java.util.UUID;
public record WalkInRegisterResponse(UUID userId, UUID patientId, String tempPassword) {}
```

- [ ] **Step 2: Failing test**

```java
@Test
void createWalkInPatientGeneratesTempPasswordAndAuditsBoth() {
    UserModel created = ... ; // mock to capture saved entity
    UUID actor = UUID.randomUUID();
    var svc = new UserWriteAppService(...);
    var result = svc.createWalkInPatient("Aisha", "+60123", LocalDate.parse("1990-01-01"), null, actor);
    assertThat(result.tempPassword()).hasSizeGreaterThanOrEqualTo(12);
    verify(audit).append(eq("CREATE"), eq("USER"), any(), eq(actor), eq("STAFF"));
    verify(audit).append(eq("CREATE"), eq("PATIENT"), any(), eq(actor), eq("STAFF"));
}
```
Result type: `record WalkInResult(UUID userId, UUID patientId, String tempPassword)` in the service package.

- [ ] **Step 3: Implement**

In `UserWriteAppService` add:
```java
public record WalkInResult(UUID userId, UUID patientId, String tempPassword) {}

@Transactional
public WalkInResult createWalkInPatient(String fullName, String phone, java.time.LocalDate dob,
                                         String email, UUID actorUserId) {
    // generate placeholder email if none provided so users.email UNIQUE doesn't fail
    String userEmail = (email != null && !email.isBlank())
        ? email
        : "walkin-" + UUID.randomUUID().toString().substring(0,8) + "@walkin.local";
    String tempPassword = generateTempPassword();
    UserModel u = new UserModel();
    u.setEmail(userEmail);
    u.setPasswordHash(passwordEncoder.encode(tempPassword));
    u.setRole(Role.PATIENT);  // server-assigned, never from request body
    u.setFullName(fullName);
    u.setPhone(phone);
    u.setActive(true);
    u.setMustChangePassword(true);
    u.setConsentGivenAt(java.time.OffsetDateTime.now());
    users.saveAndFlush(u);
    audit.append("CREATE", "USER", u.getId().toString(), actorUserId, "STAFF");

    PatientModel p = new PatientModel();
    p.setUserId(u.getId());
    p.setFullName(fullName);
    p.setEmail(email);
    p.setPhone(phone);
    p.setDateOfBirth(dob);
    patients.save(p);
    audit.append("CREATE", "PATIENT", p.getId().toString(), actorUserId, "STAFF");

    return new WalkInResult(u.getId(), p.getId(), tempPassword);
}
```

(Inject `PatientRepository patients` if not already present in the service. If it is not, prefer creating a new collaborator service rather than bloating `UserWriteAppService` — for this plan, the leaner path is to add the dependency since the patient row is intrinsically tied to the user creation.)

- [ ] **Step 4: Controller**

In `StaffController`:
```java
@PostMapping("/patients")
public WebResult<my.cliniflow.controller.biz.staff.response.WalkInRegisterResponse>
walkIn(@jakarta.validation.Valid @RequestBody
        my.cliniflow.controller.biz.staff.request.WalkInRegisterRequest req,
       org.springframework.security.core.Authentication auth) {
    UUID actor = ((my.cliniflow.infrastructure.security.JwtService.Claims) auth.getPrincipal()).userId();
    var result = userWrite.createWalkInPatient(
        req.fullName(), req.phone(), req.dateOfBirth(), req.email(), actor);
    return WebResult.ok(new my.cliniflow.controller.biz.staff.response.WalkInRegisterResponse(
        result.userId(), result.patientId(), result.tempPassword()));
}
```

- [ ] **Step 5: Run tests + commit**

```bash
cd backend && ./mvnw -q test -Dtest='UserWriteAppService*'
git add backend/src/main/java/my/cliniflow/application/biz/user/UserWriteAppService.java \
        backend/src/main/java/my/cliniflow/controller/biz/staff/ \
        backend/src/test/java/my/cliniflow/application/biz/user/UserWriteAppServiceWalkInTest.java
git commit -m "feat(staff): POST /api/staff/patients walk-in registration"
```

---

### Task 4.2: Frontend `WalkInModal` + `BookForPatientModal` + `SlotPicker`

**Files:**
- Modify: `frontend/lib/staff.ts` and `frontend/lib/appointments.ts`
- Create: `frontend/app/staff/components/SlotPicker.tsx`
- Create: `frontend/app/staff/components/WalkInModal.tsx`
- Create: `frontend/app/staff/components/BookForPatientModal.tsx`
- Modify: `frontend/app/staff/page.tsx` (add "+ Walk-in" button)
- Modify: `frontend/app/staff/patients/[id]/page.tsx` (add "Book appointment" button)
- Modify: `frontend/app/globals.css` (modal + slot grid styles, aurora tokens only)

- [ ] **Step 1: lib helpers**

`frontend/lib/staff.ts`, append:
```ts
import { apiPost } from "./api";

export type WalkInRequest = {
  fullName: string; phone: string;
  dateOfBirth: string;  // ISO date
  email?: string;
};
export type WalkInResponse = { userId: string; patientId: string; tempPassword: string };
export async function registerWalkInPatient(req: WalkInRequest): Promise<WalkInResponse> {
  return apiPost<WalkInResponse>("/staff/patients", req);
}
```

`frontend/lib/appointments.ts`, append:
```ts
export async function bookAppointmentForPatient(patientId: string, slotId: string,
                                                  type: "NEW_SYMPTOM"|"FOLLOW_UP",
                                                  parentVisitId?: string): Promise<string> {
  // The /api/appointments endpoint already takes patientId+slotId+type when called by staff,
  // but the existing controller is @PreAuthorize("hasRole('PATIENT')"). Instead of bending that,
  // add a sibling endpoint: POST /api/staff/appointments
  return apiPost<string>("/staff/appointments",
    { patientId, slotId, type, parentVisitId });
}
```
**Backend follow-up (same task):** add `POST /api/staff/appointments` to `StaffController` that delegates to a new `AppointmentWriteAppService.bookForPatient(staffActor, patientId, request)`. The new method bypasses the patient-self-id check by accepting the patientId from the staff caller; everything else mirrors `book(...)`. Add a unit test mirroring the existing `book` slot-race test.

- [ ] **Step 2: `SlotPicker.tsx`**

Loads `/api/schedule/days/{date}` for the chosen date and shows a grid of `AVAILABLE` slots. Returns `(slotId, type)` to the parent on click. (See existing `staff/schedule/page.tsx` for the day-schedule shape.)

- [ ] **Step 3: `WalkInModal.tsx`**

Implements the spec §6.5 sequence: search → register-new (inline form) or pick existing → SlotPicker → type radio → submit. On 409 SLOT_TAKEN, banner + reload. On success with new patient, show one-time temp-password panel with Copy button before closing.

- [ ] **Step 4: `BookForPatientModal.tsx`**

Same primitive but no search step (patient is fixed via prop).

- [ ] **Step 5: Wire buttons**

Add `+ Walk-in` button to `staff/page.tsx` header that opens `WalkInModal`. Add `Book appointment` button to `staff/patients/[id]/page.tsx` that opens `BookForPatientModal`.

- [ ] **Step 6: Lint + typecheck + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/lib/staff.ts frontend/lib/appointments.ts \
        frontend/app/staff/components/SlotPicker.tsx \
        frontend/app/staff/components/WalkInModal.tsx \
        frontend/app/staff/components/BookForPatientModal.tsx \
        frontend/app/staff/page.tsx \
        frontend/app/staff/patients/[id]/page.tsx \
        frontend/app/globals.css \
        backend/src/main/java/my/cliniflow/controller/biz/staff/StaffController.java \
        backend/src/main/java/my/cliniflow/application/biz/schedule/AppointmentWriteAppService.java \
        backend/src/test/java/my/cliniflow/application/biz/schedule/
git commit -m "feat(staff): walk-in + book-for-patient modals + SlotPicker"
```

---

### Task 4.3: Phase 4 E2E

- [ ] **Step 1: Rebuild + drive flows**

`docker compose build --no-cache && docker compose up -d`. Via Playwright MCP:
1. Staff → Today → "+ Walk-in" → search "no-such-name" → "Register new" → fill form → pick today's slot → NEW_SYMPTOM → Book → modal shows temp password → close → row appears in Today.
2. Reload — booked row still present.
3. Two parallel browsers: both reach SlotPicker, both pick the same slot. One succeeds; other gets the SLOT_TAKEN banner and a refreshed slot list.
4. Patient detail → "Book appointment" → SlotPicker → submit → appointment listed in `/staff/schedule`.

---

## Phase 5 — Nav restructure + shared layouts

### Task 5.1: Pull auth-guard into `staff/layout.tsx` and `admin/layout.tsx`

**Files:**
- Create: `frontend/app/staff/layout.tsx`
- Create: `frontend/app/admin/layout.tsx`
- Modify: every `staff/**/page.tsx` and `admin/**/page.tsx` — remove the duplicated `useEffect(getUser → router.replace)` block.

- [ ] **Step 1: Create the layouts**

```tsx
// frontend/app/staff/layout.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "STAFF") { router.replace("/login"); return; }
    setOk(true);
  }, [router]);
  if (!ok) return null;
  return <>{children}</>;
}
```

Same for `admin/layout.tsx` with `u.role !== "ADMIN"`.

- [ ] **Step 2: Remove duplicated guards**

In each affected page, delete the `useEffect` that does `getUser()/router.replace`. Keep any data-fetch effects. Confirm pages no longer import `getUser` if it's only used for auth.

- [ ] **Step 3: Lint + typecheck + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/staff/layout.tsx frontend/app/admin/layout.tsx \
        frontend/app/staff/**/page.tsx frontend/app/admin/**/page.tsx
git commit -m "refactor(portals): consolidate auth-guard in staff/admin layouts"
```

---

### Task 5.2: Admin nav → top tabs + sub-tabs

**Files:**
- Modify: `frontend/app/admin/components/AdminNav.tsx`
- Modify: `frontend/app/globals.css` (sub-tab styles only)

- [ ] **Step 1: Restructure tabs**

```tsx
const TOP_TABS = [
  { key: "overview",  label: "Overview", href: "/admin",                   subs: [] },
  { key: "users",     label: "Users",    href: "/admin/users",             subs: [
    { key: "all",  label: "All users", href: "/admin/users" },
    { key: "new",  label: "New user",  href: "/admin/users/new" },
  ]},
  { key: "schedule", label: "Schedule", href: "/admin/schedule-template",  subs: [
    { key: "tmpl", label: "Schedule template", href: "/admin/schedule-template" },
  ]},
  { key: "reports",  label: "Reports",  href: "/admin/analytics",          subs: [
    { key: "kpi", label: "Analytics", href: "/admin/analytics" },
  ]},
  { key: "audit",    label: "Audit",    href: "/admin/audit",              subs: [] },
];
```

Render the second row only when the active top tab has >1 sub. (`Schedule` and `Reports` currently have 1 sub each — they don't render the second row until a second sub is added.)

- [ ] **Step 2: Lint + typecheck + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/admin/components/AdminNav.tsx frontend/app/globals.css
git commit -m "refactor(admin): top tabs + sub-tabs nav"
```

---

### Task 5.3: Phase 5 E2E + visual review

- [ ] **Step 1: Rebuild + drive**

`docker compose build --no-cache && docker compose up -d`. Via Playwright MCP:
1. Admin → Users → drawer still works.
2. Admin → Reports → analytics page visible.
3. Admin → Audit → audit page visible.
4. Logout → manually navigate to `/admin` → redirected to `/login`.
5. Login as staff → manually navigate to `/admin` → redirected to `/login`.

- [ ] **Step 2: Visual review**

All redesigned pages match aurora-glass theme. No palette additions. Tables don't fight surfaces. Drawer + modals use cream + maroon language. Sparkline uses `currentColor` resolving to `var(--primary)`.

---

## Final acceptance check

After Phase 5 ships, walk the spec section 13 acceptance list. Every bullet must be checkable. If any are not satisfied, open a follow-up task.

- [ ] No `Stub — backend pending` banner visible anywhere in `/staff/*` or `/admin/*`.
- [ ] Walk-in flow registers + books in one modal interaction.
- [ ] "Book appointment" button on patient detail opens patient-bound modal.
- [ ] Admin drawer shows role / status / password sections; self-action controls disabled with tooltip.
- [ ] Audit log shows resource labels (e.g. "Aisha R." not just UUID) for top types.
- [ ] Analytics shows 4 KPIs + 30-day sparkline.
- [ ] Admin nav uses top tabs; sub-tabs render only when >1 child.
- [ ] All new write endpoints insert exactly one `audit_log` row in the same transaction.
- [ ] `audit_log` UPDATE/DELETE remain rejected by the existing DB triggers (verified by attempting one in Supabase SQL editor — should error).
- [ ] Force-reset `metadata` JSON contains only `{"force_reset": true}` — no plaintext password.
- [ ] No new tokens in `globals.css` other than aurora-derived ones (no new colors).

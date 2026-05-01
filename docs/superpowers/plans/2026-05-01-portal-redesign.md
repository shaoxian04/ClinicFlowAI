# Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-01-portal-redesign-design.md`

**Goal:** Redesign the patient (`/portal`) and doctor (`/doctor`) home pages into hackathon-judge-grade dashboards with hero cards, data viz (area chart, donut, timeline), and clearer top navigation — all in the existing aurora-glass dark/cyan theme.

**Architecture:** Add two read-only backend dashboard endpoints (`GET /api/doctor/dashboard`, `GET /api/patients/me/dashboard`) that aggregate existing repository data into one round-trip per page. Add three reusable inline-SVG chart primitives (`AreaChart`, `DonutChart`, `TimelineChart`) under `frontend/app/components/charts/`. Replace the doctor and patient page bodies with new module stacks. Update both nav bars (doctor relabels, patient adds 3 destinations + primary CTA).

**Tech Stack:** Spring Boot 3.3.4 / Java 21 / Maven · JPA + JdbcTemplate · Next.js 14 (app router) + TypeScript · framer-motion · existing aurora-glass theme tokens (`obsidian`, `ink-well`, `ink-rim`, `cyan`, `fog`, `fog-dim`, `crimson`). NO chart library — pure SVG.

**Branch:** `feat/appointment-booking-and-reminders` (continuation — same branch as the appointment + WhatsApp work).

---

## Conventions

- **TDD where it pays off:** backend services + extractors get unit/IT tests first. Frontend components are visual; typecheck + lint + Playwright screenshot is the gate.
- **Commit cadence:** one task = one commit, conventional-commits style.
- **Backend test runner:** `cd backend && ./mvnw test -Dtest=ClassName#method` for one test, `./mvnw test` for the suite.
- **Frontend lint/typecheck:** `cd frontend && npm run typecheck && npm run lint`.
- **DDD packages:** dashboard endpoints sit in `controller/biz/dashboard/`, app services in `application/biz/dashboard/`, helpers in `application/biz/visit/`.
- **Identity rule:** every per-patient endpoint derives `patientId` from JWT principal via `((JwtService.Claims) auth.getPrincipal()).userId()` then `PatientReadAppService.findByUserId(userId)`. Never trust caller-supplied identifiers.
- **Theme rule:** ONLY use existing palette tokens. NO `bg-gray-X`, `text-blue-X`, or any default Tailwind colors. Default Tailwind boilerplate is a hard fail.

---

## Phase plan

| Phase | Scope | Ships |
|---|---|---|
| 1 | Backend dashboard endpoints + ConditionMixExtractor | both `/api/...dashboard` endpoints live + IT-tested |
| 2 | Shared frontend chart primitives | `<AreaChart>`, `<DonutChart>`, `<TimelineChart>` reusable components |
| 3 | Doctor portal redesign | `/doctor` shows the new 5-module stack; nav relabeled |
| 4 | Patient portal redesign | `/portal` shows the new 5-module stack; nav has 4 tabs + CTA; `/portal/visits` exists |
| 5 | E2E + theme audit | Docker `--no-cache` rebuild + Playwright MCP screenshots both dashboards |

---

## Phase 1 — Backend dashboard endpoints

### Task 1.1: `ConditionMixExtractor` heuristic

**Files:**
- Create: `backend/src/main/java/my/cliniflow/application/biz/visit/ConditionMixExtractor.java`
- Create: `backend/src/test/java/my/cliniflow/application/biz/visit/ConditionMixExtractorTest.java`

- [ ] **Step 1: Write the failing test**

```java
// ConditionMixExtractorTest.java
package my.cliniflow.application.biz.visit;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ConditionMixExtractorTest {

    private final ConditionMixExtractor extractor = new ConditionMixExtractor();

    @Test
    void recognises_urti_keywords() {
        assertThat(extractor.classify("Patient reports cough, sore throat for 2 days"))
            .isEqualTo("URTI");
        assertThat(extractor.classify("URTI symptoms; runny nose, fever"))
            .isEqualTo("URTI");
    }

    @Test
    void recognises_headache() {
        assertThat(extractor.classify("Throbbing headache since morning"))
            .isEqualTo("Headache");
    }

    @Test
    void recognises_diabetes_followup() {
        assertThat(extractor.classify("Diabetes follow-up. HbA1c 7.2."))
            .isEqualTo("Diabetes f/u");
        assertThat(extractor.classify("DM follow up, blood sugar stable"))
            .isEqualTo("Diabetes f/u");
    }

    @Test
    void recognises_hypertension() {
        assertThat(extractor.classify("Hypertension review. BP 138/86."))
            .isEqualTo("Hypertension f/u");
        assertThat(extractor.classify("HTN follow-up, on amlodipine"))
            .isEqualTo("Hypertension f/u");
    }

    @Test
    void recognises_fever() {
        assertThat(extractor.classify("Fever 38.5C, no cough"))
            .isEqualTo("Fever");
    }

    @Test
    void unrecognised_text_is_other() {
        assertThat(extractor.classify("annual health check, asymptomatic"))
            .isEqualTo("Other");
        assertThat(extractor.classify(""))
            .isEqualTo("Other");
        assertThat(extractor.classify(null))
            .isEqualTo("Other");
    }
}
```

- [ ] **Step 2: Run test → FAIL (compile error: `ConditionMixExtractor` not found).**

```bash
cd backend && ./mvnw test -Dtest=ConditionMixExtractorTest
```

- [ ] **Step 3: Implement**

```java
// ConditionMixExtractor.java
package my.cliniflow.application.biz.visit;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Maps a SOAP {@code subjective} free-text blurb to one of a fixed set of
 * condition labels for the doctor dashboard's "Condition mix" donut.
 *
 * <p>MVP heuristic: case-insensitive keyword match in priority order. The
 * order matters — "URTI" must be checked before generic "fever" so that
 * a runny-nose-and-fever case lands in URTI not Fever.
 */
@Component
public class ConditionMixExtractor {

    private static final Map<String, List<String>> RULES = buildRules();

    private static Map<String, List<String>> buildRules() {
        Map<String, List<String>> m = new LinkedHashMap<>();
        m.put("URTI",            List.of("urti", "sore throat", "runny nose", "cough"));
        m.put("Diabetes f/u",    List.of("diabetes", " dm ", " dm,", " dm.", "hba1c", "blood sugar"));
        m.put("Hypertension f/u",List.of("hypertension", " htn ", " htn,", " htn."));
        m.put("Headache",        List.of("headache", "migraine"));
        m.put("Fever",           List.of("fever"));
        return m;
    }

    public String classify(String subjective) {
        if (subjective == null || subjective.isBlank()) return "Other";
        String s = " " + subjective.toLowerCase() + " ";
        for (var entry : RULES.entrySet()) {
            for (String kw : entry.getValue()) {
                if (s.contains(kw)) return entry.getKey();
            }
        }
        return "Other";
    }
}
```

- [ ] **Step 4: Run test → PASS (6/6).** Commit:

```bash
git add backend/src/main/java/my/cliniflow/application/biz/visit/ConditionMixExtractor.java \
        backend/src/test/java/my/cliniflow/application/biz/visit/ConditionMixExtractorTest.java
git commit -m "feat(visit): ConditionMixExtractor maps SOAP subjective → condition label"
```

---

### Task 1.2: Doctor dashboard endpoint

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/dashboard/response/DoctorDashboardResponse.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/dashboard/DoctorDashboardReadAppService.java`
- Create: `backend/src/main/java/my/cliniflow/controller/biz/dashboard/DoctorDashboardController.java`
- Create: `backend/src/test/java/my/cliniflow/controller/biz/dashboard/DoctorDashboardControllerIT.java`

- [ ] **Step 1: Response DTO**

```java
// DoctorDashboardResponse.java
package my.cliniflow.controller.biz.dashboard.response;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record DoctorDashboardResponse(
    Kpis kpis,
    List<TrendPoint> visitsTrend,
    TrendDelta trendDelta,
    List<ConditionMixSlice> conditionMix,
    List<RecentlyFinalized> recentlyFinalized
) {
    public record Kpis(
        long awaitingReview,
        long bookedToday,
        long finalizedThisWeek,
        Long avgTimeToFinalizeMinutes
    ) {}
    public record TrendPoint(LocalDate date, long count) {}
    public record TrendDelta(long current, long prior, double deltaPct) {}
    public record ConditionMixSlice(String label, long count, double pct) {}
    public record RecentlyFinalized(UUID visitId, String patientName, String chiefComplaint, OffsetDateTime finalizedAt) {}
}
```

- [ ] **Step 2: App service**

```java
// DoctorDashboardReadAppService.java
package my.cliniflow.application.biz.dashboard;

import my.cliniflow.application.biz.visit.ConditionMixExtractor;
import my.cliniflow.controller.biz.dashboard.response.DoctorDashboardResponse;
import my.cliniflow.controller.biz.dashboard.response.DoctorDashboardResponse.*;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Aggregates the doctor's dashboard data into one read.
 *
 * <p>All time arithmetic in {@code Asia/Kuala_Lumpur} so KPIs match what the
 * doctor sees on the wall clock.
 */
@Service
@Transactional(readOnly = true)
public class DoctorDashboardReadAppService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final JdbcTemplate jdbc;
    private final ConditionMixExtractor extractor;
    private final PatientRepository patients;
    private final UUID doctorPk;

    public DoctorDashboardReadAppService(
            JdbcTemplate jdbc,
            ConditionMixExtractor extractor,
            PatientRepository patients,
            @Value("${cliniflow.dev.seeded-doctor-pk}") String doctorPk) {
        this.jdbc = jdbc;
        this.extractor = extractor;
        this.patients = patients;
        this.doctorPk = UUID.fromString(doctorPk);
    }

    public DoctorDashboardResponse build() {
        OffsetDateTime now = OffsetDateTime.now();
        LocalDate today = now.atZoneSameInstant(KL).toLocalDate();
        OffsetDateTime dayStart = ZonedDateTime.of(today, java.time.LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime dayEnd   = ZonedDateTime.of(today.plusDays(1), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        LocalDate from14 = today.minusDays(13);
        OffsetDateTime from14Start = ZonedDateTime.of(from14, java.time.LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime prior14Start = ZonedDateTime.of(from14.minusDays(14), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        LocalDate weekStart = today.minusDays(today.getDayOfWeek().getValue() - 1L);
        OffsetDateTime weekStartTs = ZonedDateTime.of(weekStart, java.time.LocalTime.MIN, KL).toOffsetDateTime();

        long awaitingReview = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports WHERE is_finalized = false", Long.class);

        long bookedToday = jdbc.queryForObject(
            "SELECT COUNT(*) FROM appointments a JOIN appointment_slots s ON a.slot_id = s.id " +
            "WHERE s.doctor_id = ? AND a.status = 'BOOKED' AND s.start_at >= ? AND s.start_at < ?",
            Long.class, doctorPk, dayStart, dayEnd);

        long finalizedThisWeek = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports WHERE is_finalized = true AND finalized_at >= ?",
            Long.class, weekStartTs);

        Long avgMinutes = jdbc.queryForObject(
            "SELECT EXTRACT(EPOCH FROM AVG(finalized_at - gmt_create))/60.0 " +
            "FROM medical_reports WHERE is_finalized = true AND finalized_at >= ?",
            (rs, n) -> { double v = rs.getDouble(1); return rs.wasNull() ? null : Math.round(v); },
            from14Start);

        // 14-day trend: build a contiguous date list, fill from grouped query.
        Map<LocalDate, Long> byDate = new HashMap<>();
        jdbc.query(
            "SELECT CAST(finalized_at AT TIME ZONE 'Asia/Kuala_Lumpur' AS DATE) AS d, COUNT(*) " +
            "FROM medical_reports WHERE is_finalized = true AND finalized_at >= ? GROUP BY 1",
            ps -> ps.setObject(1, from14Start),
            rs -> { byDate.put(rs.getObject(1, LocalDate.class), rs.getLong(2)); });
        List<TrendPoint> trend = new ArrayList<>(14);
        for (int i = 0; i < 14; i++) {
            LocalDate d = from14.plusDays(i);
            trend.add(new TrendPoint(d, byDate.getOrDefault(d, 0L)));
        }

        long current14 = trend.stream().mapToLong(TrendPoint::count).sum();
        long prior14 = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports WHERE is_finalized = true AND finalized_at >= ? AND finalized_at < ?",
            Long.class, prior14Start, from14Start);
        double deltaPct = prior14 == 0 ? 0.0 : ((current14 - prior14) * 100.0) / prior14;

        // Condition mix — last 30 days finalized.
        OffsetDateTime from30 = ZonedDateTime.of(today.minusDays(29), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        List<String> subjectives = jdbc.queryForList(
            "SELECT subjective FROM medical_reports WHERE is_finalized = true AND finalized_at >= ?",
            String.class, from30);
        Map<String, Long> tally = subjectives.stream()
            .map(extractor::classify)
            .collect(Collectors.groupingBy(java.util.function.Function.identity(), Collectors.counting()));
        long total = subjectives.size();
        List<ConditionMixSlice> mix = tally.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(5)
            .map(e -> new ConditionMixSlice(e.getKey(), e.getValue(), total == 0 ? 0.0 : (e.getValue() * 100.0) / total))
            .toList();

        // Recently finalized — last 5.
        List<RecentlyFinalized> recent = jdbc.query(
            "SELECT mr.visit_id, p.full_name, mr.subjective, mr.finalized_at " +
            "FROM medical_reports mr " +
            "JOIN visits v ON mr.visit_id = v.id " +
            "JOIN patients p ON v.patient_id = p.id " +
            "WHERE mr.is_finalized = true ORDER BY mr.finalized_at DESC LIMIT 5",
            (rs, n) -> new RecentlyFinalized(
                rs.getObject(1, UUID.class),
                rs.getString(2),
                extractor.classify(rs.getString(3)),
                rs.getObject(4, OffsetDateTime.class)));

        return new DoctorDashboardResponse(
            new Kpis(awaitingReview, bookedToday, finalizedThisWeek, avgMinutes),
            trend,
            new TrendDelta(current14, prior14, deltaPct),
            mix,
            recent);
    }
}
```

- [ ] **Step 3: Controller**

```java
// DoctorDashboardController.java
package my.cliniflow.controller.biz.dashboard;

import my.cliniflow.application.biz.dashboard.DoctorDashboardReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.dashboard.response.DoctorDashboardResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctor/dashboard")
@PreAuthorize("hasRole('DOCTOR')")
public class DoctorDashboardController {

    private final DoctorDashboardReadAppService reads;

    public DoctorDashboardController(DoctorDashboardReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping
    public WebResult<DoctorDashboardResponse> get() {
        return WebResult.ok(reads.build());
    }
}
```

- [ ] **Step 4: IT**

```java
// DoctorDashboardControllerIT.java
package my.cliniflow.controller.biz.dashboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DoctorDashboardControllerIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;

    @Test
    void doctor_can_fetch_dashboard() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("doctor@demo.local", "password"));
        MvcResult login = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(login.getResponse().getContentAsString())
            .path("data").path("token").asText();

        mvc.perform(get("/api/doctor/dashboard")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.kpis").exists())
            .andExpect(jsonPath("$.data.visitsTrend").isArray())
            .andExpect(jsonPath("$.data.visitsTrend.length()").value(14))
            .andExpect(jsonPath("$.data.trendDelta").exists())
            .andExpect(jsonPath("$.data.conditionMix").isArray())
            .andExpect(jsonPath("$.data.recentlyFinalized").isArray());
    }

    @Test
    void patient_cannot_access() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("patient@demo.local", "password"));
        MvcResult login = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(login.getResponse().getContentAsString())
            .path("data").path("token").asText();

        mvc.perform(get("/api/doctor/dashboard")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 5: Run + commit**

```bash
cd backend && ./mvnw test -Dtest=DoctorDashboardControllerIT
git add backend/src/main/java/my/cliniflow/controller/biz/dashboard \
        backend/src/main/java/my/cliniflow/application/biz/dashboard/DoctorDashboardReadAppService.java \
        backend/src/test/java/my/cliniflow/controller/biz/dashboard
git commit -m "feat(dashboard): GET /api/doctor/dashboard returns KPIs + trend + mix + recent"
```

---

### Task 1.3: Patient dashboard endpoint

**Files:**
- Create: `backend/src/main/java/my/cliniflow/controller/biz/dashboard/response/PatientDashboardResponse.java`
- Create: `backend/src/main/java/my/cliniflow/application/biz/dashboard/PatientDashboardReadAppService.java`
- Modify: `backend/src/main/java/my/cliniflow/controller/biz/patient/PatientMeController.java` — add `GET /dashboard` sub-route.
- Create: `backend/src/test/java/my/cliniflow/controller/biz/patient/PatientDashboardIT.java`

- [ ] **Step 1: Response DTO**

```java
// PatientDashboardResponse.java
package my.cliniflow.controller.biz.dashboard.response;

import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;

import java.time.LocalDate;
import java.util.List;

public record PatientDashboardResponse(
    AppointmentDTO nextAppointment,
    Stats stats,
    List<TimelinePoint> timeline
) {
    public record Stats(
        long pastConsultations,
        long activeMedications,
        long allergies,
        LocalDate lastVisitDate
    ) {}
    public record TimelinePoint(LocalDate date, String kind, String summary) {}
}
```

- [ ] **Step 2: App service**

```java
// PatientDashboardReadAppService.java
package my.cliniflow.application.biz.dashboard;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.schedule.AppointmentReadAppService;
import my.cliniflow.application.biz.visit.ConditionMixExtractor;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.biz.dashboard.response.PatientDashboardResponse;
import my.cliniflow.controller.biz.dashboard.response.PatientDashboardResponse.*;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class PatientDashboardReadAppService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final JdbcTemplate jdbc;
    private final ConditionMixExtractor extractor;
    private final PatientReadAppService patientReads;
    private final AppointmentReadAppService apptReads;

    public PatientDashboardReadAppService(JdbcTemplate jdbc,
                                           ConditionMixExtractor extractor,
                                           PatientReadAppService patientReads,
                                           AppointmentReadAppService apptReads) {
        this.jdbc = jdbc;
        this.extractor = extractor;
        this.patientReads = patientReads;
        this.apptReads = apptReads;
    }

    public PatientDashboardResponse build(UUID userId) {
        UUID patientId = patientReads.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("patient profile not found: " + userId))
            .getId();

        LocalDate today = OffsetDateTime.now().atZoneSameInstant(KL).toLocalDate();
        OffsetDateTime sixMonthsAgo = ZonedDateTime.of(today.minusMonths(6), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime fourteenAgo = ZonedDateTime.of(today.minusDays(14), java.time.LocalTime.MIN, KL).toOffsetDateTime();

        AppointmentDTO next = apptReads.listMine(userId, AppointmentStatus.BOOKED).stream()
            .filter(a -> a.startAt() != null && a.startAt().isAfter(OffsetDateTime.now()))
            .min(Comparator.comparing(AppointmentDTO::startAt))
            .orElse(null);

        long pastConsultations = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports mr JOIN visits v ON mr.visit_id = v.id " +
            "WHERE v.patient_id = ? AND mr.is_finalized = true",
            Long.class, patientId);

        long activeMedications = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medications m JOIN visits v ON m.visit_id = v.id " +
            "WHERE v.patient_id = ? AND m.gmt_create >= ?",
            Long.class, patientId, fourteenAgo);

        long allergies = jdbc.query(
            "SELECT drug_allergies FROM patient_clinical_profiles WHERE patient_id = ?",
            ps -> ps.setObject(1, patientId),
            rs -> {
                if (!rs.next()) return 0L;
                String json = rs.getString(1);
                if (json == null || json.isBlank() || json.equals("[]")) return 0L;
                // Coarse: count comma-separated entries; jsonb arrays serialise as [..,..,..]
                int depth = 0, count = 1;
                boolean any = false;
                for (char c : json.toCharArray()) {
                    if (c == '[' || c == '{') depth++;
                    else if (c == ']' || c == '}') depth--;
                    else if (c == ',' && depth == 1) count++;
                    else if (!Character.isWhitespace(c) && c != '[' && c != ']') any = true;
                }
                return any ? (long) count : 0L;
            });

        LocalDate lastVisit = jdbc.query(
            "SELECT MAX(CAST(mr.finalized_at AT TIME ZONE 'Asia/Kuala_Lumpur' AS DATE)) " +
            "FROM medical_reports mr JOIN visits v ON mr.visit_id = v.id " +
            "WHERE v.patient_id = ? AND mr.is_finalized = true",
            ps -> ps.setObject(1, patientId),
            rs -> rs.next() ? rs.getObject(1, LocalDate.class) : null);

        // Timeline — finalized visits + upcoming bookings, last 6 months window.
        List<TimelinePoint> timeline = new ArrayList<>();
        jdbc.query(
            "SELECT CAST(mr.finalized_at AT TIME ZONE 'Asia/Kuala_Lumpur' AS DATE), mr.subjective " +
            "FROM medical_reports mr JOIN visits v ON mr.visit_id = v.id " +
            "WHERE v.patient_id = ? AND mr.is_finalized = true AND mr.finalized_at >= ? " +
            "ORDER BY mr.finalized_at",
            ps -> { ps.setObject(1, patientId); ps.setObject(2, sixMonthsAgo); },
            rs -> { timeline.add(new TimelinePoint(
                rs.getObject(1, LocalDate.class), "FINALIZED", extractor.classify(rs.getString(2)))); });
        apptReads.listMine(userId, AppointmentStatus.BOOKED).stream()
            .filter(a -> a.startAt() != null && a.startAt().isAfter(OffsetDateTime.now()))
            .forEach(a -> timeline.add(new TimelinePoint(
                a.startAt().atZoneSameInstant(KL).toLocalDate(), "UPCOMING", "Booked")));
        timeline.sort(Comparator.comparing(TimelinePoint::date));

        return new PatientDashboardResponse(
            next,
            new Stats(pastConsultations, activeMedications, allergies, lastVisit),
            timeline);
    }
}
```

- [ ] **Step 3: Wire into PatientMeController**

Read the existing file. Add an injected `PatientDashboardReadAppService dashboardReads` to the constructor + a new method:

```java
@GetMapping("/dashboard")
public WebResult<PatientDashboardResponse> dashboard(Authentication auth) {
    UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
    return WebResult.ok(dashboardReads.build(userId));
}
```

Imports needed at the top of the controller:
`import my.cliniflow.application.biz.dashboard.PatientDashboardReadAppService;`
`import my.cliniflow.controller.biz.dashboard.response.PatientDashboardResponse;`

- [ ] **Step 4: IT**

```java
// PatientDashboardIT.java
package my.cliniflow.controller.biz.patient;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PatientDashboardIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;

    @Test
    void patient_can_fetch_dashboard() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("patient@demo.local", "password"));
        MvcResult login = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(login.getResponse().getContentAsString())
            .path("data").path("token").asText();

        mvc.perform(get("/api/patients/me/dashboard")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.stats").exists())
            .andExpect(jsonPath("$.data.timeline").isArray());
    }

    @Test
    void doctor_cannot_access() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("doctor@demo.local", "password"));
        MvcResult login = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(login.getResponse().getContentAsString())
            .path("data").path("token").asText();

        mvc.perform(get("/api/patients/me/dashboard")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 5: Run + commit**

```bash
cd backend && ./mvnw test -Dtest='PatientDashboardIT,DoctorDashboardControllerIT'
git add backend/src/main/java/my/cliniflow/controller/biz/dashboard/response/PatientDashboardResponse.java \
        backend/src/main/java/my/cliniflow/application/biz/dashboard/PatientDashboardReadAppService.java \
        backend/src/main/java/my/cliniflow/controller/biz/patient/PatientMeController.java \
        backend/src/test/java/my/cliniflow/controller/biz/patient/PatientDashboardIT.java
git commit -m "feat(dashboard): GET /api/patients/me/dashboard returns next-appt + stats + timeline"
```

---

## Phase 2 — Shared frontend chart primitives

### Task 2.1: `<AreaChart>` (inline SVG)

**Files:**
- Create: `frontend/app/components/charts/AreaChart.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

type Point = { x: number; y: number; label?: string };

type Props = {
    points: Point[];
    width?: number;
    height?: number;
    /** "obsidian" stroke + faint cyan fill is the default. */
    stroke?: string;
    fill?: string;
    strokeWidth?: number;
    className?: string;
};

/**
 * Pure-SVG area chart. Pass normalised points (x,y in any range — auto-fit).
 * Designed for hero KPI strips; no axes, no labels — those go in the parent.
 */
export function AreaChart({
    points,
    width = 200,
    height = 60,
    stroke = "#2dd4bf",
    fill = "rgba(45,212,191,0.18)",
    strokeWidth = 1.6,
    className,
}: Props) {
    if (points.length === 0) {
        return <svg width={width} height={height} className={className} aria-hidden="true" />;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 4;
    const sx = (x: number) => pad + ((x - minX) / rangeX) * (width - 2 * pad);
    const sy = (y: number) => height - pad - ((y - minY) / rangeY) * (height - 2 * pad);

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${sx(maxX).toFixed(1)},${height} L${sx(minX).toFixed(1)},${height} Z`;

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
            <path d={areaPath} fill={fill} />
            <path d={linePath} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
        </svg>
    );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd frontend && npm run typecheck && npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/charts/AreaChart.tsx
git commit -m "feat(charts): AreaChart inline-SVG primitive"
```

---

### Task 2.2: `<DonutChart>` primitive

**Files:**
- Create: `frontend/app/components/charts/DonutChart.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

export type DonutSlice = { label: string; value: number; color: string };

type Props = {
    slices: DonutSlice[];
    size?: number;
    strokeWidth?: number;
    className?: string;
    /** Background ring color (the "empty" track). */
    trackColor?: string;
};

/**
 * Pure-SVG donut. Slices render in supplied order, starting at 12 o'clock,
 * walking clockwise. Total of {@code value}s defines the full circle.
 */
export function DonutChart({
    slices,
    size = 100,
    strokeWidth = 14,
    className,
    trackColor = "#1a2238",
}: Props) {
    const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
    const r = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * r;

    let offset = 0;
    const arcs = slices.map((s) => {
        const len = total === 0 ? 0 : (s.value / total) * circumference;
        const arc = {
            color: s.color,
            dasharray: `${len.toFixed(2)} ${(circumference - len).toFixed(2)}`,
            dashoffset: -offset,
        };
        offset += len;
        return arc;
    });

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
            {arcs.map((a, i) => (
                <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={a.dasharray}
                    strokeDashoffset={a.dashoffset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            ))}
        </svg>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/components/charts/DonutChart.tsx
git commit -m "feat(charts): DonutChart inline-SVG primitive"
```

---

### Task 2.3: `<TimelineChart>` primitive

**Files:**
- Create: `frontend/app/components/charts/TimelineChart.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

export type TimelineDot = {
    /** ISO date YYYY-MM-DD */
    date: string;
    /** Visual treatment — "filled" (cyan dot) for past, "ring" (cyan outline) for upcoming */
    kind: "filled" | "ring";
    /** Tooltip on hover */
    label?: string;
};

type Props = {
    dots: TimelineDot[];
    height?: number;
    className?: string;
};

/**
 * Horizontal timeline with date dots. Spans from the earliest dot to the latest;
 * dots position proportionally. "Today" is implicit — caller decides which dots
 * are filled vs ring.
 */
export function TimelineChart({ dots, height = 80, className }: Props) {
    if (dots.length === 0) {
        return <p className="font-sans text-xs text-fog-dim/60">No journey data yet.</p>;
    }
    const xs = dots.map((d) => new Date(d.date + "T00:00:00").getTime());
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const range = max - min || 1;
    const sx = (t: number) => 4 + ((t - min) / range) * 92;  // % units, 4-96 for padding

    return (
        <div className={className} style={{ position: "relative", height, padding: "20px 0" }}>
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    left: "4%",
                    right: "4%",
                    top: "50%",
                    height: 1,
                    background: "#1a2238",
                }}
            />
            {dots.map((d, i) => {
                const t = new Date(d.date + "T00:00:00").getTime();
                const left = `${sx(t).toFixed(2)}%`;
                const isRing = d.kind === "ring";
                const dot = (
                    <div
                        key={i}
                        title={d.label ?? d.date}
                        style={{
                            position: "absolute",
                            left,
                            top: `calc(50% - ${isRing ? 7 : 5}px)`,
                            width: isRing ? 14 : 10,
                            height: isRing ? 14 : 10,
                            borderRadius: "50%",
                            background: isRing ? "rgba(45,212,191,0.18)" : "#2dd4bf",
                            border: isRing ? "2px solid #2dd4bf" : "none",
                            transform: "translateX(-50%)",
                        }}
                    />
                );
                return dot;
            })}
            <div
                style={{
                    position: "absolute",
                    left: 4,
                    bottom: 0,
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 9,
                    color: "rgba(154,163,184,0.6)",
                    letterSpacing: "0.1em",
                }}
            >
                PAST
            </div>
            <div
                style={{
                    position: "absolute",
                    right: 4,
                    bottom: 0,
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 9,
                    color: "#2dd4bf",
                    letterSpacing: "0.1em",
                }}
            >
                UPCOMING ↑
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/components/charts/TimelineChart.tsx
git commit -m "feat(charts): TimelineChart inline horizontal timeline primitive"
```

---

## Phase 3 — Doctor portal redesign

### Task 3.1: Update DoctorNav labels

**Files:**
- Modify: `frontend/app/doctor/components/DoctorNav.tsx`

- [ ] **Step 1: Read the file** to confirm the existing `TABS` array shape.

- [ ] **Step 2: Update the TABS array**

Replace the `TABS` array with:

```tsx
const TABS: Tab[] = [
    { key: "today", label: "Dashboard", href: "/doctor" },
    { key: "bookings", label: "Today's schedule", href: "/doctor/today" },
    { key: "queue", label: "Awaiting review", href: "/doctor/queue" },
    { key: "finalized", label: "Finalized", href: "/doctor/finalized" },
    { key: "patients", label: "Patients", disabled: true },
];
```

- [ ] **Step 3: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/doctor/components/DoctorNav.tsx
git commit -m "feat(doctor): rename nav labels (Dashboard / Today's schedule / Awaiting review)"
```

---

### Task 3.2: Add `getDashboard()` to frontend API client

**Files:**
- Modify: `frontend/lib/appointments.ts` (already has the doctor today helper — co-located)

- [ ] **Step 1: Append to the file**

```ts
// New types for doctor dashboard
export type DoctorKpis = {
    awaitingReview: number;
    bookedToday: number;
    finalizedThisWeek: number;
    avgTimeToFinalizeMinutes: number | null;
};
export type TrendPoint = { date: string; count: number };
export type TrendDelta = { current: number; prior: number; deltaPct: number };
export type ConditionMixSlice = { label: string; count: number; pct: number };
export type RecentlyFinalized = { visitId: string; patientName: string; chiefComplaint: string; finalizedAt: string };
export type DoctorDashboard = {
    kpis: DoctorKpis;
    visitsTrend: TrendPoint[];
    trendDelta: TrendDelta;
    conditionMix: ConditionMixSlice[];
    recentlyFinalized: RecentlyFinalized[];
};

export async function getDoctorDashboard(): Promise<DoctorDashboard> {
    return apiGet<DoctorDashboard>("/doctor/dashboard");
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/lib/appointments.ts
git commit -m "feat(frontend): doctor dashboard API client + types"
```

---

### Task 3.3: `<NextUpCard>` (doctor)

**Files:**
- Create: `frontend/app/doctor/components/NextUpCard.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import Link from "next/link";
import type { Appointment } from "@/lib/appointments";

type Props = { next: Appointment | null };

export function NextUpCard({ next }: Props) {
    if (!next) {
        return (
            <div className="border border-ink-rim bg-ink-well rounded-sm p-6">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">Next up</p>
                <p className="font-display text-xl text-fog mt-3">No more appointments today</p>
                <p className="font-sans text-sm text-fog-dim mt-2">
                    The schedule is clear. Use the time to clear the review queue.
                </p>
            </div>
        );
    }
    const start = new Date(next.startAt);
    const minutesUntil = Math.round((start.getTime() - Date.now()) / 60000);
    const eyebrow = minutesUntil < 0 ? "STARTED" : `IN ${minutesUntil} MIN`;
    const time = start.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });

    return (
        <div
            className="rounded-sm p-6"
            style={{
                border: "1px solid rgba(45,212,191,0.4)",
                background: "linear-gradient(135deg, rgba(45,212,191,0.10) 0%, rgba(45,212,191,0.04) 100%)",
            }}
        >
            <div className="flex justify-between items-start">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Next up · {time}
                </p>
                <p className="font-mono text-xs text-cyan uppercase tracking-widest">{eyebrow}</p>
            </div>
            <p className="font-display text-2xl text-fog mt-3">{next.patientId.slice(0, 8)}</p>
            <p className="font-sans text-xs text-fog-dim mt-1">
                {next.type === "NEW_SYMPTOM" ? "NEW symptom" : "Follow-up"} · 30 min
            </p>
            <Link
                href={`/doctor/visits/${next.visitId}`}
                className="inline-block mt-4 px-4 py-2 rounded-sm bg-cyan text-obsidian font-sans text-sm font-semibold hover:bg-cyan/90"
            >
                Open chart →
            </Link>
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/doctor/components/NextUpCard.tsx
git commit -m "feat(doctor): NextUpCard hero component"
```

---

### Task 3.4: `<VisitsTrendChart>` wrapper

**Files:**
- Create: `frontend/app/doctor/components/VisitsTrendChart.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { AreaChart } from "@/components/charts/AreaChart";
import type { TrendPoint, TrendDelta } from "@/lib/appointments";

type Props = { trend: TrendPoint[]; delta: TrendDelta };

export function VisitsTrendChart({ trend, delta }: Props) {
    const points = trend.map((p, i) => ({ x: i, y: p.count }));
    const arrow = delta.deltaPct >= 0 ? "↑" : "↓";
    const sign = delta.deltaPct >= 0 ? "" : "-";
    const pctStr = `${sign}${Math.abs(Math.round(delta.deltaPct))}%`;

    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-3">
                Visits · last 14 days
            </p>
            <AreaChart points={points} width={400} height={74} className="w-full" />
            <div className="flex justify-between font-mono text-xs text-fog-dim mt-2">
                <span>
                    <strong className="text-fog">{delta.current}</strong> finalized
                </span>
                <span className="text-cyan">
                    {arrow} {pctStr} vs prior
                </span>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/doctor/components/VisitsTrendChart.tsx
git commit -m "feat(doctor): VisitsTrendChart hero-band chart"
```

---

### Task 3.5: `<TodayScheduleRail>`

**Files:**
- Create: `frontend/app/doctor/components/TodayScheduleRail.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import type { Appointment } from "@/lib/appointments";

type Props = { appointments: Appointment[] };

export function TodayScheduleRail({ appointments }: Props) {
    if (appointments.length === 0) {
        return (
            <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-2">
                    Today's schedule
                </p>
                <p className="font-sans text-sm text-fog-dim">Today's grid is clear.</p>
            </div>
        );
    }

    const now = Date.now();
    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-4">
                Today's schedule
            </p>
            <div className="relative pl-5 border-l border-ink-rim space-y-3">
                {appointments.map((a) => {
                    const start = new Date(a.startAt);
                    const isPast = start.getTime() < now;
                    const isCurrent = !isPast && start.getTime() - now < 30 * 60 * 1000;
                    return (
                        <div key={a.id} className="flex items-center gap-3">
                            <span
                                className={
                                    "absolute left-[-6px] w-3 h-3 rounded-full " +
                                    (isCurrent
                                        ? "bg-cyan ring-4 ring-cyan/20"
                                        : isPast
                                        ? "bg-ink-rim"
                                        : "bg-ink-rim")
                                }
                                aria-hidden="true"
                            />
                            <span
                                className={
                                    "font-sans text-sm " +
                                    (isCurrent ? "text-cyan" : isPast ? "text-fog-dim/60" : "text-fog")
                                }
                            >
                                {start.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}{" "}
                                — {a.patientId.slice(0, 8)}
                            </span>
                            <span className="ml-auto font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                                {a.type === "NEW_SYMPTOM" ? "NEW" : "F/U"}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/doctor/components/TodayScheduleRail.tsx
git commit -m "feat(doctor): TodayScheduleRail vertical timeline"
```

---

### Task 3.6: `<ConditionMixDonut>`

**Files:**
- Create: `frontend/app/doctor/components/ConditionMixDonut.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import type { ConditionMixSlice } from "@/lib/appointments";

const PALETTE = ["#2dd4bf", "#56a8b8", "#7ea0a8", "#9aa3b8", "#5a6679"];

type Props = { mix: ConditionMixSlice[] };

export function ConditionMixDonut({ mix }: Props) {
    const slices: DonutSlice[] = mix.map((m, i) => ({
        label: m.label,
        value: m.count,
        color: PALETTE[i % PALETTE.length],
    }));

    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest mb-4">
                Condition mix · 30 days
            </p>
            <div className="flex items-center gap-5">
                <DonutChart slices={slices} size={100} />
                <ul className="flex-1 space-y-1.5 font-sans text-sm" role="list">
                    {mix.length === 0 && (
                        <li className="text-fog-dim/60 text-xs">No finalized visits yet.</li>
                    )}
                    {mix.map((m, i) => (
                        <li key={m.label} className="flex justify-between">
                            <span className="text-fog">
                                <span style={{ color: PALETTE[i % PALETTE.length] }} aria-hidden="true">
                                    ▪
                                </span>{" "}
                                {m.label}
                            </span>
                            <span className="text-fog-dim">{Math.round(m.pct)}%</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/doctor/components/ConditionMixDonut.tsx
git commit -m "feat(doctor): ConditionMixDonut chart wrapper"
```

---

### Task 3.7: `<RecentlyFinalizedStrip>`

**Files:**
- Create: `frontend/app/doctor/components/RecentlyFinalizedStrip.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import Link from "next/link";
import type { RecentlyFinalized } from "@/lib/appointments";

type Props = { recent: RecentlyFinalized[] };

export function RecentlyFinalizedStrip({ recent }: Props) {
    if (recent.length === 0) {
        return null;
    }
    return (
        <section>
            <div className="flex justify-between items-baseline mb-3">
                <h2 className="font-display text-lg text-fog">Recently finalized</h2>
                <span className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Last {recent.length}
                </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
                {recent.map((r) => {
                    const finalized = new Date(r.finalizedAt);
                    return (
                        <Link
                            key={r.visitId}
                            href={`/doctor/visits/${r.visitId}`}
                            className="flex-shrink-0 w-44 border border-ink-rim bg-ink-well rounded-sm p-3 hover:border-cyan/60"
                        >
                            <div className="font-sans text-sm text-fog font-semibold">{r.patientName}</div>
                            <div className="font-sans text-xs text-fog-dim mt-1">{r.chiefComplaint}</div>
                            <div className="font-mono text-[10px] text-cyan uppercase tracking-widest mt-2">
                                {finalized.toLocaleDateString("en-MY", { day: "numeric", month: "short" })} ·{" "}
                                {finalized.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/doctor/components/RecentlyFinalizedStrip.tsx
git commit -m "feat(doctor): RecentlyFinalizedStrip horizontal carousel"
```

---

### Task 3.8: Doctor `/doctor/page.tsx` integration

**Files:**
- Modify: `frontend/app/doctor/page.tsx`

- [ ] **Step 1: Read existing file** to identify the existing layout structure (KPI strip + tab list).

- [ ] **Step 2: Replace the page body** with the new module stack. Skeleton:

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import DoctorNav from "./components/DoctorNav";
import { NextUpCard } from "./components/NextUpCard";
import { VisitsTrendChart } from "./components/VisitsTrendChart";
import { TodayScheduleRail } from "./components/TodayScheduleRail";
import { ConditionMixDonut } from "./components/ConditionMixDonut";
import { RecentlyFinalizedStrip } from "./components/RecentlyFinalizedStrip";
import { fadeUp, staggerChildren } from "@/design/motion";
import {
    getDoctorDashboard,
    getDoctorToday,
    type DoctorDashboard,
    type Appointment,
} from "@/lib/appointments";

export default function DoctorHome() {
    const [dashboard, setDashboard] = useState<DoctorDashboard | null>(null);
    const [today, setToday] = useState<Appointment[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getDoctorDashboard(), getDoctorToday()])
            .then(([d, t]) => {
                setDashboard(d);
                setToday(t);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"));
    }, []);

    const next = today.find((a) => a.status === "BOOKED" && new Date(a.startAt).getTime() > Date.now()) ?? null;

    return (
        <>
            <DoctorNav active="today" />
            <motion.main
                variants={staggerChildren}
                initial="initial"
                animate="animate"
                className="max-w-screen-xl mx-auto px-6 py-8 space-y-5"
            >
                <motion.section variants={fadeUp}>
                    <p className="font-mono text-xs text-cyan/80 uppercase tracking-widest">
                        {new Date().toLocaleDateString("en-MY", {
                            weekday: "long", day: "numeric", month: "long", year: "numeric",
                        })}
                    </p>
                    <h1 className="font-display text-3xl text-fog mt-1">
                        Today, <span className="text-cyan">Dr. Demo</span>.
                    </h1>
                    <p className="font-sans text-sm text-fog-dim mt-2">
                        <strong className="text-fog">{dashboard?.kpis.awaitingReview ?? "—"}</strong> drafts to
                        review · <strong className="text-fog">{dashboard?.kpis.bookedToday ?? "—"}</strong>{" "}
                        bookings on the schedule
                    </p>
                </motion.section>

                {error && (
                    <p className="font-sans text-sm text-crimson" role="alert">
                        {error}
                    </p>
                )}

                <motion.section variants={fadeUp} className="grid grid-cols-1 md:grid-cols-9 gap-4">
                    <div className="md:col-span-5">
                        <NextUpCard next={next} />
                    </div>
                    <div className="md:col-span-4">
                        {dashboard && (
                            <VisitsTrendChart trend={dashboard.visitsTrend} delta={dashboard.trendDelta} />
                        )}
                    </div>
                </motion.section>

                <motion.section variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <KpiTile label="Awaiting review" value={dashboard?.kpis.awaitingReview} accent />
                    <KpiTile label="Today's bookings" value={dashboard?.kpis.bookedToday} />
                    <KpiTile label="Finalized this week" value={dashboard?.kpis.finalizedThisWeek} />
                    <KpiTile
                        label="Avg time-to-finalize"
                        value={dashboard?.kpis.avgTimeToFinalizeMinutes != null
                            ? `${dashboard.kpis.avgTimeToFinalizeMinutes} min`
                            : "—"}
                    />
                </motion.section>

                <motion.section variants={fadeUp} className="grid grid-cols-1 md:grid-cols-9 gap-4">
                    <div className="md:col-span-5">
                        <TodayScheduleRail appointments={today.filter((a) => a.status === "BOOKED")} />
                    </div>
                    <div className="md:col-span-4">
                        {dashboard && <ConditionMixDonut mix={dashboard.conditionMix} />}
                    </div>
                </motion.section>

                {dashboard && (
                    <motion.section variants={fadeUp}>
                        <RecentlyFinalizedStrip recent={dashboard.recentlyFinalized} />
                    </motion.section>
                )}
            </motion.main>
        </>
    );
}

function KpiTile({ label, value, accent }: { label: string; value: number | string | undefined; accent?: boolean }) {
    return (
        <div className="border border-ink-rim rounded-sm p-3">
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">{label}</p>
            <p
                className={"font-display text-2xl mt-1 " + (accent ? "text-cyan" : "text-fog")}
            >
                {value ?? "—"}
            </p>
        </div>
    );
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/doctor/page.tsx
git commit -m "feat(doctor): redesigned dashboard with hero band + KPIs + schedule + donut + recent"
```

---

## Phase 4 — Patient portal redesign

### Task 4.1: Update `<PortalNav>` (4 tabs + CTA)

**Files:**
- Modify: `frontend/app/components/PortalNav.tsx`

- [ ] **Step 1: Replace the file body**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/design/cn";

const TABS: { label: string; href: string }[] = [
    { label: "Home", href: "/portal" },
    { label: "Appointments", href: "/portal/appointments" },
    { label: "Visit history", href: "/portal/visits" },
    { label: "Profile", href: "/portal/profile" },
];

export function PortalNav({ active }: { active?: string } = {}) {
    const pathname = usePathname();

    return (
        <nav
            className="sticky top-14 z-40 bg-ink-well/70 backdrop-blur-sm border-b border-ink-rim"
            aria-label="Patient portal navigation"
        >
            <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-11 gap-6">
                <span className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Your portal
                </span>
                <ul className="flex items-center gap-0" role="list">
                    {TABS.map((t) => {
                        const isActive =
                            active != null
                                ? active === t.href.replace("/portal", "").replace("/", "") ||
                                  (active === "home" && t.href === "/portal")
                                : pathname === t.href || pathname?.startsWith(t.href + "/");
                        return (
                            <li key={t.href}>
                                <Link
                                    href={t.href}
                                    className={cn(
                                        "inline-flex items-center h-11 px-3 font-sans text-xs transition-colors duration-150 border-b-2",
                                        isActive
                                            ? "text-cyan border-cyan"
                                            : "text-fog-dim/70 border-transparent hover:text-fog hover:border-ink-rim"
                                    )}
                                >
                                    {t.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
                <Link
                    href="/previsit/new"
                    className="inline-flex items-center px-3 py-1.5 rounded-sm bg-cyan text-obsidian font-sans text-xs font-semibold hover:bg-cyan/90"
                >
                    Start pre-visit chat →
                </Link>
            </div>
        </nav>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/components/PortalNav.tsx
git commit -m "feat(portal): nav adds Appointments / Visit history / Profile tabs + primary CTA"
```

---

### Task 4.2: Patient dashboard API client

**Files:**
- Modify: `frontend/lib/patient-me.ts`

- [ ] **Step 1: Append**

```ts
import type { Appointment } from "./appointments";

export type PatientDashboardStats = {
    pastConsultations: number;
    activeMedications: number;
    allergies: number;
    lastVisitDate: string | null;
};
export type TimelinePoint = { date: string; kind: "FINALIZED" | "UPCOMING"; summary: string };
export type PatientDashboard = {
    nextAppointment: Appointment | null;
    stats: PatientDashboardStats;
    timeline: TimelinePoint[];
};

export async function getPatientDashboard(): Promise<PatientDashboard> {
    return apiGet<PatientDashboard>("/patients/me/dashboard");
}
```

(Add `apiGet` to the existing import line if not present.)

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/lib/patient-me.ts
git commit -m "feat(frontend): patient dashboard API client + types"
```

---

### Task 4.3: `<NextAppointmentHero>`

**Files:**
- Create: `frontend/app/portal/components/NextAppointmentHero.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import Link from "next/link";
import type { Appointment } from "@/lib/appointments";

type Props = { next: Appointment | null };

export function NextAppointmentHero({ next }: Props) {
    if (!next) {
        return (
            <div className="border border-ink-rim bg-ink-well rounded-sm p-6">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Your next appointment
                </p>
                <p className="font-display text-2xl text-fog mt-3">No upcoming appointments</p>
                <p className="font-sans text-sm text-fog-dim mt-2">
                    Start a pre-visit chat first, then book a slot when you're ready.
                </p>
                <Link
                    href="/previsit/new"
                    className="inline-block mt-4 px-4 py-2 rounded-sm bg-cyan text-obsidian font-sans text-sm font-semibold hover:bg-cyan/90"
                >
                    Start pre-visit chat →
                </Link>
            </div>
        );
    }
    const start = new Date(next.startAt);
    const days = Math.max(0, Math.round((start.getTime() - Date.now()) / 86400000));
    const eyebrow = days === 0 ? "TODAY" : days === 1 ? "TOMORROW" : `IN ${days} DAYS`;
    const date = start.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
    const time = start.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
    const cancellable = next.status === "BOOKED" && start.getTime() - Date.now() > 2 * 3600 * 1000;

    return (
        <div
            className="rounded-sm p-6"
            style={{
                border: "1px solid rgba(45,212,191,0.4)",
                background: "linear-gradient(135deg, rgba(45,212,191,0.10) 0%, rgba(45,212,191,0.04) 100%)",
            }}
        >
            <div className="flex justify-between items-start">
                <p className="font-mono text-xs text-fog-dim/60 uppercase tracking-widest">
                    Your next appointment
                </p>
                <p className="font-mono text-xs text-cyan uppercase tracking-widest">{eyebrow}</p>
            </div>
            <p className="font-display text-2xl text-fog mt-3">
                {date} · <span className="text-cyan">{time}</span>
            </p>
            <p className="font-sans text-sm text-fog-dim mt-1">
                with <strong className="text-fog">Dr. Demo</strong> · 30 min ·{" "}
                {next.type === "NEW_SYMPTOM" ? "NEW symptom" : "Follow-up"}
            </p>
            <div className="flex gap-2 mt-5">
                <Link
                    href={`/portal/appointments/${next.id}`}
                    className="px-4 py-2 rounded-sm bg-cyan text-obsidian font-sans text-sm font-semibold hover:bg-cyan/90"
                >
                    View details →
                </Link>
                {cancellable && (
                    <Link
                        href={`/portal/appointments/${next.id}`}
                        className="px-4 py-2 rounded-sm border border-ink-rim text-fog-dim font-sans text-sm hover:text-fog"
                    >
                        Cancel
                    </Link>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/portal/components/NextAppointmentHero.tsx
git commit -m "feat(portal): NextAppointmentHero card with countdown + CTAs"
```

---

### Task 4.4: `<QuickActionsRow>`

**Files:**
- Create: `frontend/app/portal/components/QuickActionsRow.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import Link from "next/link";

const ACTIONS = [
    { eyebrow: "Start", label: "Pre-visit chat", href: "/previsit/new", desc: "5-minute symptom intake" },
    { eyebrow: "Book", label: "Appointment", href: "/portal/book", desc: "Pick a 14-day slot" },
    { eyebrow: "Update", label: "Phone & consent", href: "/portal/profile", desc: "WhatsApp reminders" },
];

export function QuickActionsRow() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ACTIONS.map((a) => (
                <Link
                    key={a.href}
                    href={a.href}
                    className="border border-ink-rim bg-ink-well rounded-sm p-4 hover:border-cyan/60"
                >
                    <p className="font-mono text-[10px] text-cyan/80 uppercase tracking-widest mb-1">
                        {a.eyebrow}
                    </p>
                    <p className="font-sans text-sm text-fog">
                        {a.label} <span className="text-cyan">→</span>
                    </p>
                    <p className="font-sans text-xs text-fog-dim mt-1">{a.desc}</p>
                </Link>
            ))}
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/portal/components/QuickActionsRow.tsx
git commit -m "feat(portal): QuickActionsRow primary CTA tiles"
```

---

### Task 4.5: `<HealthSnapshotStrip>`

**Files:**
- Create: `frontend/app/portal/components/HealthSnapshotStrip.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import type { PatientDashboardStats } from "@/lib/patient-me";

type Props = { stats: PatientDashboardStats | null };

export function HealthSnapshotStrip({ stats }: Props) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Tile label="Past consultations" value={stats?.pastConsultations} accent />
            <Tile label="Active meds" value={stats?.activeMedications} accent />
            <Tile label="Allergies" value={stats?.allergies} />
            <Tile label="Last visit" value={stats?.lastVisitDate ? formatDate(stats.lastVisitDate) : "—"} small />
        </div>
    );
}

function Tile({
    label,
    value,
    accent,
    small,
}: {
    label: string;
    value: number | string | undefined | null;
    accent?: boolean;
    small?: boolean;
}) {
    return (
        <div className="border border-ink-rim rounded-sm p-3">
            <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">{label}</p>
            <p
                className={
                    "font-display mt-1 " +
                    (small ? "text-base text-fog" : accent ? "text-2xl text-cyan" : "text-2xl text-fog")
                }
            >
                {value ?? "—"}
            </p>
        </div>
    );
}

function formatDate(iso: string): string {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
    });
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/portal/components/HealthSnapshotStrip.tsx
git commit -m "feat(portal): HealthSnapshotStrip 4-tile overview"
```

---

### Task 4.6: `<VisitTimelineChart>` wrapper

**Files:**
- Create: `frontend/app/portal/components/VisitTimelineChart.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { TimelineChart, type TimelineDot } from "@/components/charts/TimelineChart";
import type { TimelinePoint } from "@/lib/patient-me";

type Props = { timeline: TimelinePoint[] };

export function VisitTimelineChart({ timeline }: Props) {
    const dots: TimelineDot[] = timeline.map((p) => ({
        date: p.date,
        kind: p.kind === "UPCOMING" ? "ring" : "filled",
        label: `${p.date} — ${p.summary}`,
    }));
    const finalized = timeline.filter((p) => p.kind === "FINALIZED").length;
    const upcoming = timeline.filter((p) => p.kind === "UPCOMING").length;

    return (
        <div className="border border-ink-rim bg-ink-well rounded-sm p-5">
            <div className="flex justify-between items-baseline mb-3">
                <h2 className="font-sans text-sm font-semibold text-fog">Your journey</h2>
                <p className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                    {finalized} visits · {upcoming} upcoming
                </p>
            </div>
            <TimelineChart dots={dots} />
        </div>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/portal/components/VisitTimelineChart.tsx
git commit -m "feat(portal): VisitTimelineChart wrapper"
```

---

### Task 4.7: New `/portal/visits/page.tsx`

**Files:**
- Create: `frontend/app/portal/visits/page.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp, staggerChildren } from "@/design/motion";
import { apiGet } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { useRouter } from "next/navigation";

type VisitSummary = {
    visitId: string;
    finalizedAt: string | null;
    summaryEnPreview: string;
    medicationCount: number;
    doctorName?: string | null;
};

export default function VisitHistoryPage() {
    const router = useRouter();
    const [visits, setVisits] = useState<VisitSummary[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") {
            router.replace("/login");
            return;
        }
        apiGet<VisitSummary[]>("/patient/visits")
            .then(setVisits)
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load visits"));
    }, [router]);

    return (
        <motion.main
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="max-w-3xl mx-auto px-6 py-10"
        >
            <motion.section variants={fadeUp}>
                <p className="font-mono text-xs text-cyan/80 uppercase tracking-widest">Visit history</p>
                <h1 className="font-display text-3xl text-fog mt-1">All your consultations</h1>
                <p className="font-sans text-sm text-fog-dim mt-2">
                    Every finalized visit your doctor has signed off, newest first.
                </p>
            </motion.section>

            {error && (
                <motion.p variants={fadeUp} className="font-sans text-sm text-crimson mt-6" role="alert">
                    {error}
                </motion.p>
            )}

            <motion.section variants={fadeUp} className="mt-8 space-y-3">
                {visits.length === 0 && !error && (
                    <p className="font-sans text-sm text-fog-dim/60">No visits yet.</p>
                )}
                {visits.map((v) => (
                    <Link
                        key={v.visitId}
                        href={`/portal/visits/${v.visitId}`}
                        className="block border border-ink-rim bg-ink-well rounded-sm p-4 hover:border-cyan/60"
                    >
                        <div className="flex justify-between items-baseline">
                            <p className="font-display text-base text-fog">
                                {v.finalizedAt
                                    ? new Date(v.finalizedAt).toLocaleDateString("en-MY", {
                                          day: "numeric",
                                          month: "long",
                                          year: "numeric",
                                      })
                                    : "Pending"}
                            </p>
                            <span className="font-mono text-[10px] text-fog-dim/60 uppercase tracking-widest">
                                {v.medicationCount} med{v.medicationCount === 1 ? "" : "s"}
                            </span>
                        </div>
                        <p className="font-sans text-sm text-fog-dim mt-1 line-clamp-2">
                            {v.summaryEnPreview || "Summary will appear once the doctor finalizes this visit."}
                        </p>
                    </Link>
                ))}
            </motion.section>
        </motion.main>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/portal/visits/page.tsx
git commit -m "feat(portal): /portal/visits dedicated visit-history page"
```

---

### Task 4.8: Patient `/portal/page.tsx` integration

**Files:**
- Modify: `frontend/app/portal/page.tsx`

- [ ] **Step 1: Replace the page body** with the new module stack:

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

import { fadeUp, staggerChildren } from "@/design/motion";
import { getUser } from "@/lib/auth";
import { getPatientDashboard, type PatientDashboard } from "@/lib/patient-me";
import { NextAppointmentHero } from "./components/NextAppointmentHero";
import { QuickActionsRow } from "./components/QuickActionsRow";
import { HealthSnapshotStrip } from "./components/HealthSnapshotStrip";
import { VisitTimelineChart } from "./components/VisitTimelineChart";
import { apiGet } from "@/lib/api";
import { VisitCard } from "./components/VisitCard";

type VisitSummary = {
    visitId: string;
    finalizedAt: string | null;
    summaryEnPreview: string;
    medicationCount: number;
    doctorName?: string | null;
};

export default function PortalHome() {
    const router = useRouter();
    const [dashboard, setDashboard] = useState<PatientDashboard | null>(null);
    const [visits, setVisits] = useState<VisitSummary[]>([]);
    const [firstName, setFirstName] = useState("there");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = getUser();
        if (!user || user.role !== "PATIENT") {
            router.replace("/login");
            return;
        }
        const name = (user.email ?? "there").split("@")[0];
        setFirstName(name.charAt(0).toUpperCase() + name.slice(1));
        Promise.all([getPatientDashboard(), apiGet<VisitSummary[]>("/patient/visits")])
            .then(([d, v]) => {
                setDashboard(d);
                setVisits(v.slice(0, 3));
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"));
    }, [router]);

    return (
        <motion.main
            variants={staggerChildren}
            initial="initial"
            animate="animate"
            className="max-w-3xl mx-auto px-6 py-10 space-y-5"
        >
            <motion.section variants={fadeUp}>
                <p className="font-mono text-xs text-cyan/80 uppercase tracking-widest">Patient portal</p>
                <h1 className="font-display text-3xl text-fog mt-1">
                    Welcome back, <span className="text-cyan">{firstName}</span>.
                </h1>
                {dashboard?.nextAppointment && (
                    <p className="font-sans text-sm text-fog-dim mt-2">
                        Your next visit is in{" "}
                        <strong className="text-fog">
                            {Math.max(
                                0,
                                Math.round(
                                    (new Date(dashboard.nextAppointment.startAt).getTime() - Date.now()) /
                                        86400000
                                )
                            )}{" "}
                            days
                        </strong>
                        . Here's what's on deck.
                    </p>
                )}
            </motion.section>

            {error && (
                <p className="font-sans text-sm text-crimson" role="alert">
                    {error}
                </p>
            )}

            <motion.section variants={fadeUp}>
                <NextAppointmentHero next={dashboard?.nextAppointment ?? null} />
            </motion.section>

            <motion.section variants={fadeUp}>
                <QuickActionsRow />
            </motion.section>

            <motion.section variants={fadeUp}>
                <HealthSnapshotStrip stats={dashboard?.stats ?? null} />
            </motion.section>

            <motion.section variants={fadeUp}>
                <VisitTimelineChart timeline={dashboard?.timeline ?? []} />
            </motion.section>

            <motion.section variants={fadeUp}>
                <div className="flex justify-between items-baseline mb-3">
                    <h2 className="font-display text-lg text-fog">Previous consultations</h2>
                    <a href="/portal/visits" className="font-sans text-sm text-cyan hover:underline">
                        View all →
                    </a>
                </div>
                {visits.length === 0 ? (
                    <p className="font-sans text-sm text-fog-dim/60">No consultations yet.</p>
                ) : (
                    <div className="space-y-3">
                        {visits.map((v) => (
                            <VisitCard key={v.visitId} visit={v} />
                        ))}
                    </div>
                )}
            </motion.section>
        </motion.main>
    );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/app/portal/page.tsx
git commit -m "feat(portal): redesigned dashboard with hero + actions + snapshot + timeline"
```

---

## Phase 5 — E2E + theme audit

### Task 5.1: Docker rebuild + Playwright verification

**No code changes** — verification only.

- [ ] **Step 1: Backend smoke**

```bash
cd backend && ./mvnw test
```
Expected: ≥ 168 tests pass (165 + 3 new from Phase 1).

- [ ] **Step 2: Docker `--no-cache` rebuild**

```bash
cd .. && docker compose down -v && docker compose build --no-cache && docker compose up -d
until curl -s http://localhost/api/auth/login -X POST -H 'content-type: application/json' -d '{}' | grep -q "code"; do sleep 3; done
```

- [ ] **Step 3: Playwright MCP — doctor dashboard**

Navigate to `http://localhost/login`, log in as `doctor@demo.local / password`. Take full-page screenshot of `/doctor` to `docs/screenshots/portal-redesign-doctor.png`. Verify visible: NextUp card, visits trend chart, KPI strip, schedule rail, condition mix donut, awaiting-review queue, recently-finalized strip.

- [ ] **Step 4: Playwright MCP — patient dashboard**

Logout, log in as `patient@demo.local / password`. Take full-page screenshot of `/portal` to `docs/screenshots/portal-redesign-patient.png`. Verify visible: NextAppointment hero, quick actions row, health snapshot, visit timeline, previous consultations.

- [ ] **Step 5: Theme audit**

Inspect both screenshots. Confirm:
- Backgrounds are `obsidian` / `ink-well` only — no white, no Tailwind gray.
- Accents are `cyan` only — no purple, blue, indigo.
- Typography matches the existing pages (font-display for H1/H2, font-mono for eyebrows, font-sans for body).
- No tab labels appear with their old names ("Visits", "Today", etc.).

- [ ] **Step 6: Commit screenshots**

```bash
git add docs/screenshots/portal-redesign-doctor.png docs/screenshots/portal-redesign-patient.png
git commit -m "docs(screenshots): portal redesign E2E captures"
```

---

## Self-review

**Spec coverage check:**
- §4 Doctor portal modules → Tasks 3.3–3.8 (✓ all 5 modules + integration)
- §4 Doctor nav rename → Task 3.1 (✓)
- §5 Patient portal modules → Tasks 4.3–4.8 (✓ all 5 modules + integration)
- §5 Patient nav additions + CTA → Task 4.1 (✓)
- §5 New `/portal/visits` page → Task 4.7 (✓)
- §6 Components inventory → Tasks 2.1, 2.2, 2.3, 3.3-3.7, 4.3-4.6 (✓)
- §7 Backend endpoints → Tasks 1.2, 1.3 (✓)
- §7 ConditionMixExtractor → Task 1.1 (✓)
- §10 Testing strategy → Phase 1 ITs + Phase 5 E2E (✓)
- §12 Acceptance criteria → covered by Phase 5 verification steps (✓)

No gaps. Plan complete.

---

## Implementation handoff

Plan saved to `docs/superpowers/plans/2026-05-01-portal-redesign.md`.

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task with two-stage review
2. **Inline Execution** — batch in this session

Which approach?

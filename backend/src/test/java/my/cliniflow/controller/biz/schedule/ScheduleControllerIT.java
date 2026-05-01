package my.cliniflow.controller.biz.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for {@link ScheduleController} (staff schedule-management
 * flows). Each test runs in its own rolled-back transaction.
 *
 * <p>Seeded constants:
 * <ul>
 *   <li>{@code SEEDED_DOCTOR_ID} = {@code doctors.id} = {@code ...0020}</li>
 *   <li>{@code SEEDED_DOCTOR_USER_ID} = {@code users.id} for the doctor = {@code ...0001}</li>
 *   <li>{@code SEEDED_STAFF_USER_ID}  = {@code users.id} for staff = {@code ...0003} (data.sql)</li>
 *   <li>{@code SEEDED_PATIENT_ID}     = {@code patients.id} = {@code ...0010}</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ScheduleControllerIT {

    private static final UUID SEEDED_DOCTOR_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000020");

    private static final UUID SEEDED_DOCTOR_USER_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000001");

    private static final UUID SEEDED_PATIENT_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;

    /** JWT token for the seeded STAFF user, refreshed before each test. */
    private String staffToken;

    @BeforeEach
    void loginAsStaff() throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of(
                    "email", "staff@demo.local",
                    "password", "password"))))
            .andExpect(status().isOk())
            .andReturn();
        staffToken = om.readTree(result.getResponse().getContentAsString())
            .path("data").path("token").asText();
        assertNotNull(staffToken, "staff login must return a JWT");
    }

    // -----------------------------------------------------------------------
    // Scenario 1: GET /api/schedule/days/{date} returns slots + appointments
    // -----------------------------------------------------------------------

    @Test
    void day_view_returns_slots_and_booked_appointments() throws Exception {
        LocalDate date = LocalDate.now().plusDays(10);
        OffsetDateTime dayStart = date.atStartOfDay().atOffset(ZoneOffset.ofHours(8));
        OffsetDateTime s1 = dayStart.plusHours(9);
        OffsetDateTime e1 = s1.plusMinutes(30);
        OffsetDateTime s2 = dayStart.plusHours(10);
        OffsetDateTime e2 = s2.plusMinutes(30);

        UUID slotAvailable = insertSlot(s1, e1, "AVAILABLE");
        UUID slotBooked    = insertSlot(s2, e2, "BOOKED");

        // Insert a SCHEDULED visit so the appointment FK is satisfied
        UUID visitId = insertVisit(SEEDED_PATIENT_ID);

        // Insert a BOOKED appointment referencing the booked slot
        insertAppointment(slotBooked, SEEDED_PATIENT_ID, visitId, "BOOKED");

        mvc.perform(get("/api/schedule/days/" + date)
                .header("Authorization", "Bearer " + staffToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.slots.length()").value(2))
            .andExpect(jsonPath("$.data.appointments.length()").value(1));
    }

    // -----------------------------------------------------------------------
    // Scenario 2: POST /days/{date}/closures creates DAY_CLOSED override
    // -----------------------------------------------------------------------

    @Test
    void close_day_creates_override_and_returns_id() throws Exception {
        LocalDate date = LocalDate.now().plusDays(30);

        long before = jdbc.queryForObject(
            "SELECT COUNT(*) FROM schedule_day_overrides", Long.class);

        MvcResult result = mvc.perform(post("/api/schedule/days/" + date + "/closures")
                .header("Authorization", "Bearer " + staffToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("date", date.toString(), "reason", "Public holiday"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data").isNotEmpty())
            .andReturn();

        // Returned data must be a valid UUID
        String returnedId = om.readTree(result.getResponse().getContentAsString())
            .path("data").asText();
        assertNotNull(UUID.fromString(returnedId), "returned id must be a valid UUID");

        // Flush JPA first-level cache so the JdbcTemplate count sees the new row
        em.flush();
        long after = jdbc.queryForObject(
            "SELECT COUNT(*) FROM schedule_day_overrides", Long.class);
        assertEquals(before + 1, after, "one override row must have been inserted");
    }

    // -----------------------------------------------------------------------
    // Scenario 3: POST /days/{date}/closures rejects when booking exists → 409
    // -----------------------------------------------------------------------

    @Test
    void close_day_with_active_booking_returns_409() throws Exception {
        LocalDate date = LocalDate.now().plusDays(31);
        OffsetDateTime s = date.atStartOfDay().atOffset(ZoneOffset.ofHours(8)).plusHours(9);
        OffsetDateTime e = s.plusMinutes(30);

        UUID slotId  = insertSlot(s, e, "BOOKED");
        UUID visitId = insertVisit(SEEDED_PATIENT_ID);
        insertAppointment(slotId, SEEDED_PATIENT_ID, visitId, "BOOKED");

        mvc.perform(post("/api/schedule/days/" + date + "/closures")
                .header("Authorization", "Bearer " + staffToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("date", date.toString(), "reason", "Test"))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value(40900));
    }

    // -----------------------------------------------------------------------
    // Scenario 4: DELETE /overrides/{id} removes the override
    // -----------------------------------------------------------------------

    @Test
    void delete_override_removes_the_row() throws Exception {
        LocalDate date = LocalDate.now().plusDays(40);
        UUID overrideId = insertDayClosedOverride(date);

        long before = jdbc.queryForObject(
            "SELECT COUNT(*) FROM schedule_day_overrides WHERE id = ?", Long.class, overrideId);
        assertEquals(1L, before, "override row must exist before DELETE");

        mvc.perform(delete("/api/schedule/overrides/" + overrideId)
                .header("Authorization", "Bearer " + staffToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));

        // Flush JPA first-level cache so the JdbcTemplate count reflects the delete
        em.flush();
        long after = jdbc.queryForObject(
            "SELECT COUNT(*) FROM schedule_day_overrides WHERE id = ?", Long.class, overrideId);
        assertEquals(0L, after, "override row must be gone after DELETE");
    }

    // -----------------------------------------------------------------------
    // Scenario 5: POST /appointments/{id}/no-show marks BOOKED → NO_SHOW
    // -----------------------------------------------------------------------

    @Test
    void no_show_transitions_booked_appointment_to_no_show() throws Exception {
        LocalDate date = LocalDate.now().plusDays(5);
        OffsetDateTime s = date.atStartOfDay().atOffset(ZoneOffset.ofHours(8)).plusHours(11);
        OffsetDateTime e = s.plusMinutes(30);

        UUID slotId  = insertSlot(s, e, "BOOKED");
        UUID visitId = insertVisit(SEEDED_PATIENT_ID);
        UUID apptId  = insertAppointment(slotId, SEEDED_PATIENT_ID, visitId, "BOOKED");

        mvc.perform(post("/api/schedule/appointments/" + apptId + "/no-show")
                .header("Authorization", "Bearer " + staffToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));

        // Flush JPA first-level cache so the JdbcTemplate query sees the updated status
        em.flush();
        em.clear();
        String status = jdbc.queryForObject(
            "SELECT status FROM appointments WHERE id = ?", String.class, apptId);
        assertEquals("NO_SHOW", status, "appointment status must be NO_SHOW after marking");
    }

    // -----------------------------------------------------------------------
    // Scenario 6: PATIENT cannot access staff schedule endpoints → 403
    // -----------------------------------------------------------------------

    @Test
    void patient_cannot_access_day_view_returns_403() throws Exception {
        // Login as the seeded patient
        MvcResult result = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of(
                    "email", "patient@demo.local",
                    "password", "password"))))
            .andExpect(status().isOk())
            .andReturn();
        String patientToken = om.readTree(result.getResponse().getContentAsString())
            .path("data").path("token").asText();

        LocalDate date = LocalDate.now().plusDays(10);
        mvc.perform(get("/api/schedule/days/" + date)
                .header("Authorization", "Bearer " + patientToken))
            .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private UUID insertSlot(OffsetDateTime startAt, OffsetDateTime endAt, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO appointment_slots (id, doctor_id, start_at, end_at, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            id, SEEDED_DOCTOR_ID, startAt, endAt, status);
        return id;
    }

    private UUID insertVisit(UUID patientId) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO visits (id, patient_id, doctor_id, status)
            VALUES (?, ?, ?, 'SCHEDULED')
            """,
            id, patientId, SEEDED_DOCTOR_USER_ID);
        return id;
    }

    private UUID insertAppointment(UUID slotId, UUID patientId, UUID visitId, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO appointments (id, slot_id, patient_id, visit_id, appointment_type, status)
            VALUES (?, ?, ?, ?, 'NEW_SYMPTOM', ?)
            """,
            id, slotId, patientId, visitId, status);
        return id;
    }

    /**
     * Inserts a DAY_CLOSED override directly via JDBC (bypasses domain service
     * conflict-check — used for the delete scenario where we need a row to
     * exist without any appointment fixtures).
     */
    private UUID insertDayClosedOverride(LocalDate date) {
        UUID staffUserId = UUID.fromString("00000000-0000-0000-0000-000000000003");
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO schedule_day_overrides
                (id, doctor_id, override_date, override_type, reason, created_by)
            VALUES (?, ?, ?, 'DAY_CLOSED', 'IT test override', ?)
            """,
            id, SEEDED_DOCTOR_ID, date, staffUserId);
        return id;
    }
}

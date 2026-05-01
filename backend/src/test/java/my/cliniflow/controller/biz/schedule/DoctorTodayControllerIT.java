package my.cliniflow.controller.biz.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
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

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for {@link DoctorTodayController} (doctor's today view).
 * Each test runs in its own rolled-back transaction.
 *
 * <p>Seeded constants:
 * <ul>
 *   <li>{@code SEEDED_DOCTOR_ID} = {@code doctors.id} = {@code ...0020}</li>
 *   <li>{@code SEEDED_DOCTOR_USER_ID} = {@code users.id} for the doctor = {@code ...0001}</li>
 *   <li>{@code SEEDED_PATIENT_ID} = {@code patients.id} = {@code ...0010}</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DoctorTodayControllerIT {

    // doctors(id) row seeded in data.sql
    private static final UUID SEEDED_DOCTOR_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000020");

    // users(id) for the doctor — visits.doctor_id FK references users(id)
    private static final UUID SEEDED_DOCTOR_USER_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000001");

    private static final UUID SEEDED_PATIENT_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;

    /** JWT token for the seeded DOCTOR user, refreshed before each test. */
    private String doctorToken;

    @BeforeEach
    void loginAsDoctor() throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of(
                    "email", "doctor@demo.local",
                    "password", "password"))))
            .andExpect(status().isOk())
            .andReturn();
        doctorToken = om.readTree(result.getResponse().getContentAsString())
            .path("data").path("token").asText();
        assertNotNull(doctorToken, "doctor login must return a JWT");
    }

    // -----------------------------------------------------------------------
    // Scenario 1: Doctor sees BOOKED appointments for today, sorted by start
    // -----------------------------------------------------------------------

    @Test
    void today_returns_booked_appointments_sorted_by_start() throws Exception {
        // Insert two slots for today: 09:00 and 14:00 (KL = UTC+8)
        LocalDate today = LocalDate.now();
        OffsetDateTime morning = today.atTime(9, 0).atOffset(ZoneOffset.ofHours(8));
        OffsetDateTime afternoon = today.atTime(14, 0).atOffset(ZoneOffset.ofHours(8));

        UUID slot1 = insertSlot(morning, morning.plusMinutes(30), "BOOKED");
        UUID slot2 = insertSlot(afternoon, afternoon.plusMinutes(30), "BOOKED");

        UUID visit1 = insertVisit(SEEDED_PATIENT_ID);
        UUID visit2 = insertVisit(SEEDED_PATIENT_ID);

        insertAppointment(slot1, SEEDED_PATIENT_ID, visit1, "BOOKED");
        insertAppointment(slot2, SEEDED_PATIENT_ID, visit2, "BOOKED");

        MvcResult result = mvc.perform(get("/api/doctor/appointments/today")
                .header("Authorization", "Bearer " + doctorToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data").isArray())
            .andExpect(jsonPath("$.data.length()").value(2))
            .andReturn();

        // First entry must be earlier than the second (sorted by startAt ascending)
        var tree = om.readTree(result.getResponse().getContentAsString());
        String startAt0 = tree.path("data").get(0).path("startAt").asText();
        String startAt1 = tree.path("data").get(1).path("startAt").asText();
        assertFalse(startAt0.isEmpty(), "first appointment must have a startAt");
        assertFalse(startAt1.isEmpty(), "second appointment must have a startAt");
        assertTrue(startAt0.compareTo(startAt1) < 0,
            "appointments must be sorted by startAt ascending; got " + startAt0 + " vs " + startAt1);
    }

    // -----------------------------------------------------------------------
    // Scenario 2: Today view only includes BOOKED status (not CANCELLED etc.)
    // -----------------------------------------------------------------------

    @Test
    void today_excludes_non_booked_appointments() throws Exception {
        LocalDate today = LocalDate.now();
        OffsetDateTime start = today.atTime(10, 0).atOffset(ZoneOffset.ofHours(8));

        UUID slot = insertSlot(start, start.plusMinutes(30), "BOOKED");
        UUID visit = insertVisit(SEEDED_PATIENT_ID);
        insertAppointment(slot, SEEDED_PATIENT_ID, visit, "CANCELLED");

        mvc.perform(get("/api/doctor/appointments/today")
                .header("Authorization", "Bearer " + doctorToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data").isArray())
            .andExpect(jsonPath("$.data.length()").value(0));
    }

    // -----------------------------------------------------------------------
    // Scenario 3: PATIENT cannot access this endpoint → 403
    // -----------------------------------------------------------------------

    @Test
    void patient_cannot_access_today_returns_403() throws Exception {
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

        mvc.perform(get("/api/doctor/appointments/today")
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
}

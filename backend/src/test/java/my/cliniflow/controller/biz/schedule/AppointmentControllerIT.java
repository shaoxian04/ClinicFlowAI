package my.cliniflow.controller.biz.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.PatientSelfRegisterRequest;
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
 * Integration tests for {@link AppointmentController} (patient-facing booking
 * flows). Each test runs in its own transaction that is rolled back after the
 * method returns, so rows inserted via JdbcTemplate are always cleaned up.
 *
 * <p>Seeded constants:
 * <ul>
 *   <li>{@code SEEDED_DOCTOR_ID} = {@code doctors.id} = {@code ...0020}</li>
 *   <li>{@code SEEDED_DOCTOR_USER_ID} = {@code users.id} for the doctor = {@code ...0001}</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AppointmentControllerIT {

    // doctors(id) row seeded in data.sql
    private static final UUID SEEDED_DOCTOR_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000020");

    // users(id) for the doctor — visits.doctor_id FK references users(id)
    private static final UUID SEEDED_DOCTOR_USER_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;

    // -----------------------------------------------------------------------
    // Scenario 1: Patient books an available slot → 200 + audit row
    // -----------------------------------------------------------------------

    @Test
    void book_available_slot_returns_appointment_id_and_writes_audit() throws Exception {
        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).plusHours(48);
        OffsetDateTime end   = start.plusMinutes(30);
        UUID slotId = createSlot(start, end);

        RegisteredPatient p = registerPatientAndGetToken();
        UUID visitId = createVisit(p.patientId());

        long auditBefore = jdbc.queryForObject(
            "SELECT COUNT(*) FROM audit_log WHERE action='CREATE' AND resource_type='APPOINTMENT'",
            Long.class);

        String body = om.writeValueAsString(Map.of(
            "slotId", slotId.toString(),
            "type", "NEW_SYMPTOM",
            "visitId", visitId.toString()
        ));

        MvcResult result = mvc.perform(post("/api/appointments")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data").isNotEmpty())
            .andReturn();

        // Returned data should be a valid UUID
        String returnedId = om.readTree(result.getResponse().getContentAsString())
            .path("data").asText();
        assertNotNull(UUID.fromString(returnedId), "returned data must be a valid UUID");

        long auditAfter = jdbc.queryForObject(
            "SELECT COUNT(*) FROM audit_log WHERE action='CREATE' AND resource_type='APPOINTMENT'",
            Long.class);
        assertEquals(auditBefore + 1, auditAfter, "audit_log must have exactly one new APPOINTMENT CREATE row");
    }

    // -----------------------------------------------------------------------
    // Scenario 2: Second patient tries the same slot → 409 Conflict
    // -----------------------------------------------------------------------

    @Test
    void booking_already_booked_slot_returns_409() throws Exception {
        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).plusHours(48).plusMinutes(1);
        OffsetDateTime end   = start.plusMinutes(30);
        UUID slotId = createSlot(start, end);

        // Patient A books successfully
        RegisteredPatient patA = registerPatientAndGetToken();
        UUID visitA = createVisit(patA.patientId());

        String bodyA = om.writeValueAsString(Map.of(
            "slotId", slotId.toString(),
            "type", "NEW_SYMPTOM",
            "visitId", visitA.toString()
        ));
        mvc.perform(post("/api/appointments")
                .header("Authorization", "Bearer " + patA.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(bodyA))
            .andExpect(status().isOk());

        // Patient B tries the same slot — should see 409
        RegisteredPatient patB = registerPatientAndGetToken();
        UUID visitB = createVisit(patB.patientId());

        String bodyB = om.writeValueAsString(Map.of(
            "slotId", slotId.toString(),
            "type", "NEW_SYMPTOM",
            "visitId", visitB.toString()
        ));
        mvc.perform(post("/api/appointments")
                .header("Authorization", "Bearer " + patB.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(bodyB))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value(40900));
    }

    // -----------------------------------------------------------------------
    // Scenario 3: Cross-patient cancel → 403
    // -----------------------------------------------------------------------

    @Test
    void cancel_another_patients_appointment_returns_403() throws Exception {
        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).plusHours(48).plusMinutes(2);
        OffsetDateTime end   = start.plusMinutes(30);
        UUID slotId = createSlot(start, end);

        // Patient A books
        RegisteredPatient patA = registerPatientAndGetToken();
        UUID visitA = createVisit(patA.patientId());

        String bodyA = om.writeValueAsString(Map.of(
            "slotId", slotId.toString(),
            "type", "NEW_SYMPTOM",
            "visitId", visitA.toString()
        ));
        MvcResult bookResult = mvc.perform(post("/api/appointments")
                .header("Authorization", "Bearer " + patA.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(bodyA))
            .andExpect(status().isOk())
            .andReturn();

        UUID apptId = UUID.fromString(
            om.readTree(bookResult.getResponse().getContentAsString()).path("data").asText());

        // Patient B tries to cancel Patient A's appointment
        RegisteredPatient patB = registerPatientAndGetToken();
        mvc.perform(delete("/api/appointments/" + apptId)
                .header("Authorization", "Bearer " + patB.token()))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value(40300));
    }

    // -----------------------------------------------------------------------
    // Scenario 4: Cancel within 2h lead-time → 409
    // -----------------------------------------------------------------------

    @Test
    void cancel_within_lead_time_returns_409() throws Exception {
        // Slot starts in 30 minutes — well within the default 2h cancel lead time
        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(30);
        OffsetDateTime end   = start.plusMinutes(30);
        UUID slotId = createSlot(start, end);

        RegisteredPatient pat = registerPatientAndGetToken();
        UUID visitId = createVisit(pat.patientId());

        // Booking should succeed (no lead-time check on book)
        String bookBody = om.writeValueAsString(Map.of(
            "slotId", slotId.toString(),
            "type", "NEW_SYMPTOM",
            "visitId", visitId.toString()
        ));
        MvcResult bookResult = mvc.perform(post("/api/appointments")
                .header("Authorization", "Bearer " + pat.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(bookBody))
            .andExpect(status().isOk())
            .andReturn();

        UUID apptId = UUID.fromString(
            om.readTree(bookResult.getResponse().getContentAsString()).path("data").asText());

        // Cancel attempt should fail because slot is within 2h lead time
        // CancelWindowPassedException → 409 via GlobalExceptionConfiguration
        mvc.perform(delete("/api/appointments/" + apptId)
                .header("Authorization", "Bearer " + pat.token()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value(40900));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Inserts an AVAILABLE slot row into appointment_slots. Returns the new slot id. */
    private UUID createSlot(OffsetDateTime startAt, OffsetDateTime endAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO appointment_slots (id, doctor_id, start_at, end_at, status)
            VALUES (?, ?, ?, ?, 'AVAILABLE')
            """,
            id, SEEDED_DOCTOR_ID, startAt, endAt);
        return id;
    }

    /**
     * Inserts a SCHEDULED visit row whose patient_id = {@code patientId} and
     * doctor_id = {@link #SEEDED_DOCTOR_USER_ID} (visits.doctor_id FK references
     * users(id), not doctors(id)).
     */
    private UUID createVisit(UUID patientId) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO visits (id, patient_id, doctor_id, status)
            VALUES (?, ?, ?, 'SCHEDULED')
            """,
            id, patientId, SEEDED_DOCTOR_USER_ID);
        return id;
    }

    /**
     * Self-registers a patient via {@code POST /api/auth/register/patient} and
     * returns the token, patientId and userId from the response.
     */
    private RegisteredPatient registerPatientAndGetToken() throws Exception {
        String email = "it-patient-" + UUID.randomUUID() + "@example.com";
        PatientSelfRegisterRequest req = new PatientSelfRegisterRequest(
            email, "Strong-Pwd-12345",
            "IT Patient", LocalDate.of(1990, 6, 15),
            "OTHER", "+60123456789",
            "en", null, "v1", null);

        MvcResult result = mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(req)))
            .andExpect(status().isOk())
            .andReturn();

        var data = om.readTree(result.getResponse().getContentAsString()).path("data");
        String token     = data.path("token").asText();
        UUID   patientId = UUID.fromString(data.path("patientId").asText());
        UUID   userId    = UUID.fromString(data.path("userId").asText());
        return new RegisteredPatient(token, patientId, userId);
    }

    record RegisteredPatient(String token, UUID patientId, UUID userId) {}
}

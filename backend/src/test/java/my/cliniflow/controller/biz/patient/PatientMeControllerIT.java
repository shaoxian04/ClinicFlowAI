package my.cliniflow.controller.biz.patient;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for {@link PatientMeController} (patient self-service
 * phone + WhatsApp consent flows). Each test runs in its own rolled-back
 * transaction.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PatientMeControllerIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;

    // -----------------------------------------------------------------------
    // Scenario 1: PUT consent=true with no phone → 400
    // -----------------------------------------------------------------------

    @Test
    void grant_consent_without_phone_returns_400() throws Exception {
        // Register without a phone number
        RegisteredPatient p = registerPatientAndGetToken(null);

        mvc.perform(put("/api/patients/me/whatsapp-consent")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("consent", true))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(40000));
    }

    // -----------------------------------------------------------------------
    // Scenario 2: PUT phone, then PUT consent=true → 200 + audit row
    // -----------------------------------------------------------------------

    @Test
    void set_phone_then_grant_consent_succeeds_and_writes_audit() throws Exception {
        RegisteredPatient p = registerPatientAndGetToken(null);

        // Set phone first
        mvc.perform(put("/api/patients/me/phone")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("phone", "+60123456789"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));

        long auditBefore = jdbc.queryForObject(
            "SELECT COUNT(*) FROM audit_log WHERE action='UPDATE' AND resource_type='WHATSAPP_CONSENT_GRANT'",
            Long.class);

        // Grant consent
        mvc.perform(put("/api/patients/me/whatsapp-consent")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("consent", true))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));

        // Flush JPA state to the JDBC view before asserting
        em.flush();

        // Assert DB state: whatsapp_consent_at must be non-null
        int rowsWithConsent = jdbc.queryForObject(
            "SELECT COUNT(*) FROM patients WHERE user_id = ? AND whatsapp_consent_at IS NOT NULL",
            Integer.class, p.userId());
        assertThat(rowsWithConsent).isEqualTo(1);

        long auditAfter = jdbc.queryForObject(
            "SELECT COUNT(*) FROM audit_log WHERE action='UPDATE' AND resource_type='WHATSAPP_CONSENT_GRANT'",
            Long.class);
        assertThat(auditAfter).isEqualTo(auditBefore + 1);
    }

    // -----------------------------------------------------------------------
    // Scenario 3: PUT phone=null while consent on → 400
    // -----------------------------------------------------------------------

    @Test
    void clear_phone_while_consent_active_returns_400() throws Exception {
        RegisteredPatient p = registerPatientAndGetToken(null);

        // Set phone and grant consent
        mvc.perform(put("/api/patients/me/phone")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("phone", "+60123456789"))))
            .andExpect(status().isOk());

        mvc.perform(put("/api/patients/me/whatsapp-consent")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("consent", true))))
            .andExpect(status().isOk());

        // Try to clear phone while consent is active
        mvc.perform(put("/api/patients/me/phone")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\": null}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value(40000));
    }

    // -----------------------------------------------------------------------
    // Scenario 4: Withdraw consent, then clear phone → 200
    // -----------------------------------------------------------------------

    @Test
    void withdraw_consent_then_clear_phone_succeeds() throws Exception {
        RegisteredPatient p = registerPatientAndGetToken(null);

        // Set phone and grant consent
        mvc.perform(put("/api/patients/me/phone")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("phone", "+60123456789"))))
            .andExpect(status().isOk());

        mvc.perform(put("/api/patients/me/whatsapp-consent")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("consent", true))))
            .andExpect(status().isOk());

        // Withdraw consent
        mvc.perform(put("/api/patients/me/whatsapp-consent")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("consent", false))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));

        // Clear phone — should succeed now
        mvc.perform(put("/api/patients/me/phone")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"phone\": null}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));

        // Flush JPA state to the JDBC view before asserting
        em.flush();

        // Assert DB: phone is null — COUNT(*) WHERE phone IS NULL = 1
        int rowsPhoneNull = jdbc.queryForObject(
            "SELECT COUNT(*) FROM patients WHERE user_id = ? AND phone IS NULL",
            Integer.class, p.userId());
        assertThat(rowsPhoneNull).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // Scenario 5: STAFF cannot access these endpoints → 403
    // -----------------------------------------------------------------------

    @Test
    void staff_cannot_access_patient_me_endpoints() throws Exception {
        String staffToken = loginAndGetToken("staff@demo.local", "password");

        mvc.perform(put("/api/patients/me/phone")
                .header("Authorization", "Bearer " + staffToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("phone", "+60123456789"))))
            .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // Scenario 6: GET /api/patients/me returns phone + consent state
    // -----------------------------------------------------------------------

    @Test
    void get_me_returns_phone_and_consent_state() throws Exception {
        // Register with phone and consent
        String email = "it-me-get-" + UUID.randomUUID() + "@example.com";
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("email", email);
        body.put("password", "Strong-Pwd-12345");
        body.put("fullName", "IT Me Get Patient");
        body.put("dateOfBirth", "1990-06-01");
        body.put("gender", "OTHER");
        body.put("preferredLanguage", "en");
        body.put("nationalId", null);
        body.put("consentVersion", "v1");
        body.put("clinicalBaseline", null);
        body.put("phone", "+60123456789");
        body.put("whatsAppConsent", true);

        MvcResult regResult = mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body)))
            .andExpect(status().isOk())
            .andReturn();

        String token = om.readTree(regResult.getResponse().getContentAsString())
            .path("data").path("token").asText();

        mvc.perform(get("/api/patients/me")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.phone").value("+60123456789"))
            .andExpect(jsonPath("$.data.whatsappConsent").value(true));
    }

    // -----------------------------------------------------------------------
    // Scenario 7: Invalid phone format rejected by bean validation → 400
    // -----------------------------------------------------------------------

    @Test
    void invalid_phone_format_rejected_by_validation() throws Exception {
        RegisteredPatient p = registerPatientAndGetToken("+60123456789");

        mvc.perform(put("/api/patients/me/phone")
                .header("Authorization", "Bearer " + p.token())
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("phone", "123abc"))))
            .andExpect(status().isBadRequest());
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Self-registers a patient. Pass {@code null} for phone to register without one.
     */
    private RegisteredPatient registerPatientAndGetToken(String phone) throws Exception {
        String email = "it-me-" + UUID.randomUUID() + "@example.com";
        // Build request body manually to handle null phone (record constructor validates non-null phone pattern)
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("email", email);
        body.put("password", "Strong-Pwd-12345");
        body.put("fullName", "IT Me Patient");
        body.put("dateOfBirth", "1992-03-15");
        body.put("gender", "OTHER");
        body.put("preferredLanguage", "en");
        body.put("nationalId", null);
        body.put("consentVersion", "v1");
        body.put("clinicalBaseline", null);
        body.put("phone", phone); // may be null

        MvcResult result = mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body)))
            .andExpect(status().isOk())
            .andReturn();

        var data = om.readTree(result.getResponse().getContentAsString()).path("data");
        String token  = data.path("token").asText();
        UUID   userId = UUID.fromString(data.path("userId").asText());
        return new RegisteredPatient(token, userId);
    }

    private String loginAndGetToken(String email, String password) throws Exception {
        MvcResult result = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(Map.of("email", email, "password", password))))
            .andExpect(status().isOk())
            .andReturn();
        return om.readTree(result.getResponse().getContentAsString())
            .path("data").path("token").asText();
    }

    record RegisteredPatient(String token, UUID userId) {}
}

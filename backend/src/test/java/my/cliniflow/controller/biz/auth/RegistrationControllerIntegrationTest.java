package my.cliniflow.controller.biz.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import my.cliniflow.controller.biz.auth.request.PatientSelfRegisterRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RegistrationControllerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;

    @Test
    void register_patient_returns_token_and_creates_user() throws Exception {
        Map<String, Object> baseline = Map.of(
            "drugAllergies", List.of(Map.of("name", "penicillin", "severity", "MODERATE")),
            "weightKg", 60.0
        );
        PatientSelfRegisterRequest req = new PatientSelfRegisterRequest(
            "self-register@example.com",
            "Strong-Pwd-12345",
            "Self Register",
            LocalDate.of(1990, 5, 1),
            "FEMALE",
            "+60123334444",
            "en",
            "850501-10-1234",
            "v1",
            baseline,
            null,
            null
        );
        String body = om.writeValueAsString(req);
        mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.token").isNotEmpty())
            .andExpect(jsonPath("$.data.role").value("PATIENT"))
            .andExpect(jsonPath("$.data.email").value("self-register@example.com"));
    }

    @Test
    void register_duplicate_national_id_returns_conflict() throws Exception {
        // First registration succeeds
        PatientSelfRegisterRequest a = new PatientSelfRegisterRequest(
            "dup-1@example.com", "Strong-Pwd-12345", "Dup One",
            LocalDate.of(1990, 5, 1), "FEMALE", "+60123334444",
            "en", "990505-08-1234", "v1", null, null, null);
        mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(a)))
            .andExpect(status().isOk());

        // Second with same NRIC fails
        PatientSelfRegisterRequest b = new PatientSelfRegisterRequest(
            "dup-2@example.com", "Strong-Pwd-12345", "Dup Two",
            LocalDate.of(1985, 1, 1), "MALE", "+60123334445",
            "en", "990505-08-1234", "v1", null, null, null);
        mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(b)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value(40900));
    }

    @Test
    void register_invalid_email_rejected() throws Exception {
        PatientSelfRegisterRequest req = new PatientSelfRegisterRequest(
            "not-an-email",
            "Strong-Pwd-12345",
            "Bad Email",
            null, null, null, null, null, "v1", null, null, null
        );
        mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(req)))
            .andExpect(status().is4xxClientError());
    }

    @Test
    void register_with_whatsapp_consent_grants_consent() throws Exception {
        String email = "wa-consent-" + UUID.randomUUID() + "@example.com";
        Map<String, Object> body = new HashMap<>();
        body.put("email", email);
        body.put("password", "Strong-Pwd-12345");
        body.put("fullName", "WA Consenter");
        body.put("dateOfBirth", "1990-01-01");
        body.put("gender", "FEMALE");
        body.put("phone", "+60123334444");
        body.put("preferredLanguage", "en");
        body.put("consentVersion", "v1");
        body.put("whatsAppConsent", true);
        body.put("whatsAppConsentVersion", "wa-v1");

        mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON)
                .content(om.writeValueAsString(body)))
            .andExpect(status().isOk());

        // Flush JPA first-level cache so JDBC can see the updated row.
        em.flush();

        // Assert the patient row's whatsapp_consent_at is non-null
        Long count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM patients WHERE email=? AND whatsapp_consent_at IS NOT NULL",
            Long.class, email);
        assertThat(count).isEqualTo(1);
    }
}

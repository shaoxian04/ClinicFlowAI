package my.cliniflow.controller.biz.previsit;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import my.cliniflow.controller.biz.auth.request.PatientSelfRegisterRequest;
import my.cliniflow.controller.biz.previsit.request.PreVisitTurnRequest;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PreVisitControllerIntegrationTest {

    private static final UUID SEEDED_PAT_DEMO_ID =
        UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired VisitRepository visits;
    @Autowired PatientRepository patientsRepo;
    @Autowired UserRepository usersRepo;
    @MockBean AgentServiceClient agent;

    @Test
    void full_two_turn_happy_path() throws Exception {
        String loginBody = om.writeValueAsString(new LoginRequest("patient@demo.local", "password"));
        MvcResult login = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(loginBody))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(login.getResponse().getContentAsString())
            .path("data").path("token").asText();

        when(agent.callPreVisitTurn(any(), any(), any())).thenReturn(
            new AgentServiceClient.PreVisitTurnResult(
                "How long have you had this?",
                Map.of("chief_complaint", "headache"),
                false
            )
        );

        MvcResult start = mvc.perform(post("/api/previsit/sessions")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.visitId").isNotEmpty())
            .andReturn();
        String visitId = om.readTree(start.getResponse().getContentAsString())
            .path("data").path("visitId").asText();

        String turnBody = om.writeValueAsString(new PreVisitTurnRequest("I have a headache"));
        mvc.perform(post("/api/previsit/sessions/" + visitId + "/turn")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(turnBody))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.assistantMessage").value("How long have you had this?"))
            .andExpect(jsonPath("$.data.done").value(false))
            .andExpect(jsonPath("$.data.structured.fields.chief_complaint").value("headache"));
    }

    /**
     * REGRESSION: a freshly-registered patient must get a visit row whose
     * patient_id is THEIR OWN patient row, not the seeded Pat Demo UUID
     * (00000000-0000-0000-0000-000000000010). Pre-fix, every patient's session
     * was created against Pat Demo's chart — a cross-patient PHI leak.
     */
    @Test
    void session_uses_authenticated_patient_id_not_seeded_demo() throws Exception {
        String email = "regression-" + UUID.randomUUID() + "@example.com";
        PatientSelfRegisterRequest reg = new PatientSelfRegisterRequest(
            email, "Strong-Pwd-12345", "Regression Tester",
            LocalDate.of(1990, 1, 1), "FEMALE", "+60123334444",
            "en", null, "v1", null);
        MvcResult regResult = mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(reg)))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(regResult.getResponse().getContentAsString())
            .path("data").path("token").asText();
        UUID expectedPatientId = UUID.fromString(om.readTree(regResult.getResponse().getContentAsString())
            .path("data").path("patientId").asText());

        MvcResult start = mvc.perform(post("/api/previsit/sessions")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andReturn();
        UUID visitId = UUID.fromString(om.readTree(start.getResponse().getContentAsString())
            .path("data").path("visitId").asText());

        UUID actualPatientId = visits.findById(visitId).orElseThrow().getPatientId();
        assertEquals(expectedPatientId, actualPatientId,
            "visit must be created against authenticated patient");
        assertNotEquals(SEEDED_PAT_DEMO_ID, actualPatientId,
            "visit must NOT be created against the seeded Pat Demo UUID");
    }

    /**
     * REGRESSION: posting a turn to another patient's visit must be rejected
     * with FORBIDDEN — defends against a malicious authenticated patient
     * guessing or scraping someone else's visit_id.
     */
    @Test
    void turn_on_another_patients_visit_is_forbidden() throws Exception {
        // Patient A: register + start a session, capture their visit_id.
        String emailA = "owner-" + UUID.randomUUID() + "@example.com";
        PatientSelfRegisterRequest regA = new PatientSelfRegisterRequest(
            emailA, "Strong-Pwd-12345", "Owner A",
            LocalDate.of(1990, 1, 1), "FEMALE", "+60123334444",
            "en", null, "v1", null);
        MvcResult regAResult = mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(regA)))
            .andExpect(status().isOk()).andReturn();
        String tokenA = om.readTree(regAResult.getResponse().getContentAsString())
            .path("data").path("token").asText();
        MvcResult startA = mvc.perform(post("/api/previsit/sessions")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk()).andReturn();
        String visitIdA = om.readTree(startA.getResponse().getContentAsString())
            .path("data").path("visitId").asText();

        // Patient B: register, log in, attempt to post a turn to A's visit.
        String emailB = "intruder-" + UUID.randomUUID() + "@example.com";
        PatientSelfRegisterRequest regB = new PatientSelfRegisterRequest(
            emailB, "Strong-Pwd-12345", "Intruder B",
            LocalDate.of(1991, 2, 2), "MALE", "+60123335555",
            "en", null, "v1", null);
        MvcResult regBResult = mvc.perform(post("/api/auth/register/patient")
                .contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsString(regB)))
            .andExpect(status().isOk()).andReturn();
        String tokenB = om.readTree(regBResult.getResponse().getContentAsString())
            .path("data").path("token").asText();

        String turnBody = om.writeValueAsString(new PreVisitTurnRequest("hijack attempt"));
        mvc.perform(post("/api/previsit/sessions/" + visitIdA + "/turn")
                .header("Authorization", "Bearer " + tokenB)
                .contentType(MediaType.APPLICATION_JSON).content(turnBody))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value(40300));
    }
}

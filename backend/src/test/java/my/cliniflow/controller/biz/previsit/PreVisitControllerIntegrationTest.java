package my.cliniflow.controller.biz.previsit;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import my.cliniflow.controller.biz.previsit.request.PreVisitTurnRequest;
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

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PreVisitControllerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @MockBean AgentServiceClient agent;

    @Test
    void full_two_turn_happy_path() throws Exception {
        // Log in as seeded patient (V2 seed must have run)
        String loginBody = om.writeValueAsString(new LoginRequest("patient@demo.local", "password"));
        MvcResult login = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(loginBody))
            .andExpect(status().isOk()).andReturn();
        String token = om.readTree(login.getResponse().getContentAsString())
            .path("data").path("token").asText();

        // Stub agent reply
        when(agent.callPreVisitTurn(any())).thenReturn(
            new AgentServiceClient.PreVisitTurnResult(
                "How long have you had this?",
                Map.of("chief_complaint", "headache"),
                false
            )
        );

        // Start session
        MvcResult start = mvc.perform(post("/api/previsit/sessions")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.visitId").isNotEmpty())
            .andReturn();
        String visitId = om.readTree(start.getResponse().getContentAsString())
            .path("data").path("visitId").asText();

        // First turn
        String turnBody = om.writeValueAsString(new PreVisitTurnRequest("I have a headache"));
        mvc.perform(post("/api/previsit/sessions/" + visitId + "/turn")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(turnBody))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.assistantMessage").value("How long have you had this?"))
            .andExpect(jsonPath("$.data.done").value(false))
            .andExpect(jsonPath("$.data.structured.fields.chief_complaint").value("headache"));
    }
}

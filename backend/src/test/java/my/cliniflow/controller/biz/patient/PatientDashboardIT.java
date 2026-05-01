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

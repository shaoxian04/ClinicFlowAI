package my.cliniflow.controller.biz.staff;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class StaffControllerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;

    private String staffToken;
    private String patientToken;

    @BeforeEach
    void seed() throws Exception {
        UserModel staff = new UserModel();
        staff.setEmail("staff-it@example.com");
        staff.setPasswordHash(encoder.encode("staffpw123"));
        staff.setRole(Role.STAFF);
        staff.setFullName("IT Staff");
        users.save(staff);

        staffToken = login("staff-it@example.com", "staffpw123");
        patientToken = login("patient@demo.local", "password");
    }

    private String login(String email, String password) throws Exception {
        String body = om.writeValueAsString(new LoginRequest(email, password));
        MvcResult res = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andReturn();
        return om.readTree(res.getResponse().getContentAsString())
            .path("data").path("token").asText();
    }

    @Test
    void today_returns_200_with_waitingList_for_staff() throws Exception {
        mvc.perform(get("/api/staff/today")
                .header("Authorization", "Bearer " + staffToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.waitingList").isArray());
    }

    @Test
    void today_returns_403_for_patient() throws Exception {
        mvc.perform(get("/api/staff/today")
                .header("Authorization", "Bearer " + patientToken))
            .andExpect(status().isForbidden());
    }

    @Test
    void today_returns_401_without_token() throws Exception {
        mvc.perform(get("/api/staff/today"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void checkin_nonexistent_appointment_returns_404() throws Exception {
        String body = om.writeValueAsString(Map.of("appointmentId", UUID.randomUUID().toString()));
        mvc.perform(post("/api/staff/checkin")
                .header("Authorization", "Bearer " + staffToken)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value(40400));
    }

    @Test
    void checkin_missing_appointmentId_returns_400() throws Exception {
        mvc.perform(post("/api/staff/checkin")
                .header("Authorization", "Bearer " + staffToken)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void checkin_returns_403_for_patient() throws Exception {
        String body = om.writeValueAsString(Map.of("appointmentId", UUID.randomUUID().toString()));
        mvc.perform(post("/api/staff/checkin")
                .header("Authorization", "Bearer " + patientToken)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
    }
}

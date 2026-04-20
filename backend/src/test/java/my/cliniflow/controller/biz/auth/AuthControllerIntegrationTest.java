package my.cliniflow.controller.biz.auth;

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
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthControllerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper om;

    @BeforeEach
    void seed() {
        UserModel u = new UserModel();
        u.setEmail("login-test@example.com");
        u.setPasswordHash(encoder.encode("pw123456"));
        u.setRole(Role.PATIENT);
        u.setFullName("Login Test");
        users.save(u);
    }

    @Test
    void login_happy_path_returns_token() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("login-test@example.com", "pw123456"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.token").isNotEmpty())
            .andExpect(jsonPath("$.data.role").value("PATIENT"));
    }

    @Test
    void login_wrong_password_returns_error_envelope() throws Exception {
        String body = om.writeValueAsString(new LoginRequest("login-test@example.com", "wrong"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(40100));
    }
}

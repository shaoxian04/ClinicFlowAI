package my.cliniflow.controller.biz.clinic;

import jakarta.annotation.PostConstruct;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@TestPropertySource(properties = {
        "cliniflow.clinic.name=Test Clinic",
        "cliniflow.clinic.address-line1=Line A",
        "cliniflow.clinic.address-line2=Line B",
        "cliniflow.clinic.phone=+60 3-1111 2222",
        "cliniflow.clinic.email=test@clinic.local",
        "cliniflow.clinic.registration-number=REG-1"
})
class ClinicControllerTest {

    @Autowired private WebApplicationContext webContext;
    private MockMvc mvc;

    @PostConstruct
    void setup() {
        this.mvc = MockMvcBuilders.webAppContextSetup(webContext).build();
    }

    @Test
    void returns_clinic_info_without_auth() throws Exception {
        mvc.perform(get("/api/clinic"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.data.name").value("Test Clinic"))
           .andExpect(jsonPath("$.data.addressLine1").value("Line A"))
           .andExpect(jsonPath("$.data.email").value("test@clinic.local"))
           .andExpect(jsonPath("$.data.registrationNumber").value("REG-1"));
    }
}

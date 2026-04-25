package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.patient.PatientSeedDemoAppService;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse.Labeled;
import my.cliniflow.controller.biz.patient.response.SeedDemoResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PatientControllerTest {

    @Autowired MockMvc mvc;
    @MockBean PatientReadAppService reads;
    @MockBean PatientSeedDemoAppService seed;

    @Test
    @WithMockUser(roles = "DOCTOR")
    void getContext_returns_mapped_dto() throws Exception {
        UUID pid = UUID.randomUUID();
        when(reads.getContext(any())).thenReturn(new PatientContextResponse(
            List.of(new Labeled("penicillin", "Penicillin")),
            List.of(), List.of(), List.of()
        ));
        mvc.perform(get("/api/patients/" + pid + "/context").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.allergies[0].label").value("Penicillin"));
    }

    @Test
    @WithMockUser(roles = "DOCTOR")
    void seedDemoAll_returns_403_when_flag_off() throws Exception {
        when(seed.seedAll()).thenThrow(new my.cliniflow.controller.base.BusinessException(
            my.cliniflow.controller.base.ResultCode.FORBIDDEN,
            "demo seeding disabled in this environment"
        ));
        mvc.perform(post("/api/patients/context/seed-demo-all"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value(40300));
    }

    @Test
    @WithMockUser(roles = "DOCTOR")
    void seedDemoAll_returns_count_when_flag_on() throws Exception {
        when(seed.seedAll()).thenReturn(7);
        mvc.perform(post("/api/patients/context/seed-demo-all"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.patientsSeeded").value(7));
    }
}

package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse.Labeled;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PatientControllerTest {

    @Autowired MockMvc mvc;
    @MockBean PatientReadAppService reads;

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
            .andExpect(jsonPath("$.allergies[0].label").value("Penicillin"));
    }
}

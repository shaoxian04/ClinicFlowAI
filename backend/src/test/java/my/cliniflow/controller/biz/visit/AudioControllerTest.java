package my.cliniflow.controller.biz.visit;

import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AudioControllerTest {

    @Autowired MockMvc mvc;
    @MockBean AgentServiceClient agentClient;

    @Test
    @WithMockUser(roles = "DOCTOR")
    void audio_returns_transcript_from_agent() throws Exception {
        when(agentClient.callStt(any(), any(), any()))
            .thenReturn(new AgentServiceClient.SttResult("chest pain noted"));

        UUID visitId = UUID.randomUUID();
        MockMultipartFile audioFile = new MockMultipartFile(
            "audio", "recording.webm", "audio/webm", "fake audio bytes".getBytes()
        );

        mvc.perform(
            multipart("/api/visits/{id}/audio", visitId)
                .file(audioFile)
                .contentType(MediaType.MULTIPART_FORM_DATA)
        )
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").value(0))
        .andExpect(jsonPath("$.data.transcript").value("chest pain noted"));
    }

    @Test
    void audio_without_auth_returns_401() throws Exception {
        MockMultipartFile audioFile = new MockMultipartFile(
            "audio", "recording.webm", "audio/webm", "bytes".getBytes()
        );
        mvc.perform(
            multipart("/api/visits/{id}/audio", UUID.randomUUID()).file(audioFile)
        )
        .andExpect(status().isUnauthorized());
    }
}

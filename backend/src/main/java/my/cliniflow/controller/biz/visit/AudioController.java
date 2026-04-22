package my.cliniflow.controller.biz.visit;

import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.response.AudioTranscriptResponse;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/api/visits/{visitId}")
public class AudioController {

    private static final Logger log = LoggerFactory.getLogger(AudioController.class);

    private final AgentServiceClient agentClient;

    public AudioController(AgentServiceClient agentClient) {
        this.agentClient = agentClient;
    }

    @PostMapping("/audio")
    public WebResult<AudioTranscriptResponse> transcribeAudio(
        @PathVariable UUID visitId,
        @RequestParam("audio") MultipartFile audio
    ) {
        log.info("[AUDIO] POST /audio visitId={} size={} contentType={}", visitId, audio.getSize(), audio.getContentType());
        if (audio.isEmpty()) {
            throw new IllegalArgumentException("audio file must not be empty");
        }
        byte[] bytes;
        try {
            bytes = audio.getBytes();
        } catch (IOException e) {
            throw new IllegalArgumentException("Could not read uploaded audio");
        }
        String contentType = audio.getContentType() != null ? audio.getContentType() : "audio/webm";
        String filename = audio.getOriginalFilename() != null ? audio.getOriginalFilename() : "recording.webm";
        AgentServiceClient.SttResult result = agentClient.callStt(bytes, contentType, filename);
        return WebResult.ok(new AudioTranscriptResponse(result.text()));
    }
}

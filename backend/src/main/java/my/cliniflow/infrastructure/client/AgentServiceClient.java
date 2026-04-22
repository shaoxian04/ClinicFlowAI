package my.cliniflow.infrastructure.client;

import com.fasterxml.jackson.annotation.JsonInclude;
import my.cliniflow.controller.base.UpstreamException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class AgentServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AgentServiceClient.class);

    private final WebClient client;

    public AgentServiceClient(
        @Value("${cliniflow.agent.base-url}") String baseUrl,
        @Value("${cliniflow.agent.service-token}") String serviceToken
    ) {
        this.client = WebClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader("X-Service-Token", serviceToken)
            .defaultHeader("Content-Type", "application/json")
            .build();
    }

    public PreVisitTurnResult callPreVisitTurn(UUID visitId, UUID patientId, String userInput) {
        PreVisitTurnSyncRequest req = new PreVisitTurnSyncRequest(
            visitId.toString(),
            patientId.toString(),
            userInput == null ? "" : userInput
        );
        log.info("[AGENT] POST /agents/pre-visit/turn-sync visitId={} patientId={} userInputLen={}",
            visitId, patientId, req.userInput().length());
        try {
            PreVisitTurnSyncResponse resp = withCorrelation(client.post().uri("/agents/pre-visit/turn-sync"))
                .bodyValue(req)
                .retrieve()
                .bodyToMono(PreVisitTurnSyncResponse.class)
                .block();
            if (resp == null) {
                log.warn("[AGENT] /agents/pre-visit/turn-sync returned null body for visitId={}", visitId);
                return new PreVisitTurnResult("", Map.of(), false);
            }
            log.info("[AGENT] /agents/pre-visit/turn-sync OK visitId={} msgLen={} done={}",
                visitId,
                resp.assistantMessage() == null ? 0 : resp.assistantMessage().length(),
                resp.done());
            return new PreVisitTurnResult(
                resp.assistantMessage() == null ? "" : resp.assistantMessage(),
                resp.fields() == null ? Map.of() : resp.fields(),
                resp.done()
            );
        } catch (WebClientResponseException e) {
            log.error("[AGENT] /agents/pre-visit/turn-sync HTTP {} visitId={} body={}",
                e.getRawStatusCode(), visitId, e.getResponseBodyAsString());
            throw new UpstreamException("agent", e.getRawStatusCode(), e.getResponseBodyAsString(), e);
        } catch (Exception e) {
            log.error("[AGENT] /agents/pre-visit/turn-sync FAILED visitId={} error={}", visitId, e.toString(), e);
            throw new UpstreamException("agent", 0, e.toString(), e);
        }
    }

    private WebClient.RequestBodySpec withCorrelation(WebClient.RequestBodySpec spec) {
        String cid = MDC.get("correlationId");
        if (cid != null) {
            spec = (WebClient.RequestBodySpec) spec.header("X-Correlation-ID", cid);
        }
        return spec;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PreVisitTurnSyncRequest(
        @com.fasterxml.jackson.annotation.JsonProperty("visit_id") String visitId,
        @com.fasterxml.jackson.annotation.JsonProperty("patient_id") String patientId,
        @com.fasterxml.jackson.annotation.JsonProperty("user_input") String userInput
    ) {}

    public record PreVisitTurnSyncResponse(
        @com.fasterxml.jackson.annotation.JsonProperty("assistant_message") String assistantMessage,
        Map<String, Object> fields,
        boolean done
    ) {}

    public record PreVisitTurnResult(
        String assistantMessage,
        Map<String, Object> fields,
        boolean done
    ) {}

    public SoapResult callVisitGenerate(UUID visitId, UUID patientId, UUID doctorId, String transcript) {
        VisitGenerateSyncRequest req = new VisitGenerateSyncRequest(
            visitId.toString(),
            patientId != null ? patientId.toString() : null,
            doctorId != null ? doctorId.toString() : null,
            transcript == null ? "" : transcript
        );
        log.info("[AGENT] POST /agents/report/generate-sync visitId={} patientId={} doctorId={} transcriptLen={}",
            visitId, patientId, doctorId, req.transcript() == null ? 0 : req.transcript().length());
        try {
            SyncSoapResponse resp = withCorrelation(client.post().uri("/agents/report/generate-sync"))
                .bodyValue(req)
                .retrieve()
                .bodyToMono(SyncSoapResponse.class)
                .block();
            if (resp == null) {
                log.warn("[AGENT] /agents/report/generate-sync returned null body for visitId={}", visitId);
                return new SoapResult("", "", "", "");
            }
            log.info("[AGENT] /agents/report/generate-sync OK visitId={} sLen={} oLen={} aLen={} pLen={}",
                visitId,
                resp.subjective() == null ? 0 : resp.subjective().length(),
                resp.objective() == null ? 0 : resp.objective().length(),
                resp.assessment() == null ? 0 : resp.assessment().length(),
                resp.plan() == null ? 0 : resp.plan().length());
            return new SoapResult(nz(resp.subjective()), nz(resp.objective()), nz(resp.assessment()), nz(resp.plan()));
        } catch (WebClientResponseException e) {
            log.error("[AGENT] /agents/report/generate-sync HTTP {} visitId={} body={}",
                e.getRawStatusCode(), visitId, e.getResponseBodyAsString());
            throw new UpstreamException("agent", e.getRawStatusCode(), e.getResponseBodyAsString(), e);
        } catch (Exception e) {
            log.error("[AGENT] /agents/report/generate-sync FAILED visitId={} error={}", visitId, e.toString(), e);
            throw new UpstreamException("agent", 0, e.toString(), e);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record VisitGenerateSyncRequest(
        @com.fasterxml.jackson.annotation.JsonProperty("visit_id") String visitId,
        @com.fasterxml.jackson.annotation.JsonProperty("patient_id") String patientId,
        @com.fasterxml.jackson.annotation.JsonProperty("doctor_id") String doctorId,
        String transcript
    ) {}

    public record SyncSoapResponse(String subjective, String objective, String assessment, String plan) {}

    public record SoapResult(String subjective, String objective, String assessment, String plan) {}

    public PostVisitResult callPostVisitSummarize(
        UUID visitId,
        String subjective, String objective, String assessment, String plan,
        List<MedicationView> medications
    ) {
        PostVisitSummarizeRequest req = new PostVisitSummarizeRequest(
            visitId.toString(),
            new SoapBody(nz(subjective), nz(objective), nz(assessment), nz(plan)),
            medications == null ? List.of() : medications
        );
        PostVisitSummarizeResponse resp = withCorrelation(client.post().uri("/agents/post-visit/summarize"))
            .bodyValue(req)
            .retrieve()
            .bodyToMono(PostVisitSummarizeResponse.class)
            .block();
        if (resp == null) return new PostVisitResult("", "");
        return new PostVisitResult(nz(resp.summaryEn()), nz(resp.summaryMs()));
    }

    private static String nz(String s) { return s == null ? "" : s; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PostVisitSummarizeRequest(String visitId, SoapBody soap, List<MedicationView> medications) {}

    public record SoapBody(String subjective, String objective, String assessment, String plan) {}

    public record MedicationView(String name, String dosage, String frequency) {}

    public record PostVisitSummarizeResponse(String visitId, String summaryEn, String summaryMs) {}

    public record PostVisitResult(String summaryEn, String summaryMs) {}

    // ── Report agent: streaming calls (returned as Flux<String> of SSE lines) ──

    public reactor.core.publisher.Flux<String> reportGenerateStream(
        UUID visitId, UUID patientId, UUID doctorId, String specialty, String transcript
    ) {
        Map<String, Object> body = new HashMap<>();
        body.put("visit_id", visitId.toString());
        body.put("patient_id", patientId.toString());
        body.put("doctor_id", doctorId.toString());
        body.put("specialty", specialty);
        body.put("transcript", transcript == null ? "" : transcript);
        log.info("[AGENT] POST /agents/report/generate visitId={} transcriptLen={}",
            visitId, transcript == null ? 0 : transcript.length());
        return client.post().uri("/agents/report/generate")
            .bodyValue(body)
            .accept(org.springframework.http.MediaType.TEXT_EVENT_STREAM)
            .retrieve()
            .bodyToFlux(String.class)
            .doOnError(e -> log.error("[AGENT] /generate stream error visit={} err={}", visitId, e.toString()));
    }

    public reactor.core.publisher.Flux<String> reportClarifyStream(
        UUID visitId, UUID patientId, UUID doctorId, String answer
    ) {
        log.info("[AGENT] POST /agents/report/clarify visitId={} answerLen={}",
            visitId, answer == null ? 0 : answer.length());
        return client.post().uri("/agents/report/clarify")
            .bodyValue(Map.of(
                "visit_id", visitId.toString(),
                "patient_id", patientId.toString(),
                "doctor_id", doctorId.toString(),
                "answer", answer == null ? "" : answer
            ))
            .accept(org.springframework.http.MediaType.TEXT_EVENT_STREAM)
            .retrieve()
            .bodyToFlux(String.class)
            .doOnError(e -> log.error("[AGENT] /clarify stream error visit={} err={}", visitId, e.toString()));
    }

    public reactor.core.publisher.Flux<String> reportEditStream(
        UUID visitId, UUID patientId, UUID doctorId, String edit, Object currentDraft
    ) {
        Map<String, Object> body = new HashMap<>();
        body.put("visit_id", visitId.toString());
        body.put("patient_id", patientId.toString());
        body.put("doctor_id", doctorId.toString());
        body.put("edit", edit == null ? "" : edit);
        if (currentDraft != null) body.put("current_draft", currentDraft);
        log.info("[AGENT] POST /agents/report/edit visitId={} editLen={} hasCurrentDraft={}",
            visitId, edit == null ? 0 : edit.length(), currentDraft != null);
        return client.post().uri("/agents/report/edit")
            .bodyValue(body)
            .accept(org.springframework.http.MediaType.TEXT_EVENT_STREAM)
            .retrieve()
            .bodyToFlux(String.class)
            .doOnError(e -> log.error("[AGENT] /edit stream error visit={} err={}", visitId, e.toString()));
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    public Map<String, Object> reportFinalize(UUID visitId) {
        log.info("[AGENT] POST /agents/report/finalize visitId={}", visitId);
        try {
            Map<String, Object> resp = (Map<String, Object>) withCorrelation(
                client.post().uri("/agents/report/finalize")
            )
                .bodyValue(Map.of("visit_id", visitId.toString()))
                .retrieve()
                .bodyToMono(Map.class)
                .block();
            if (resp == null) throw new UpstreamException("agent", 0, "empty finalize response", null);
            log.info("[AGENT] /finalize OK visitId={} keys={}", visitId, resp.keySet());
            return resp;
        } catch (WebClientResponseException e) {
            log.error("[AGENT] /finalize HTTP {} visit={} body={}", e.getRawStatusCode(), visitId, e.getResponseBodyAsString());
            throw new UpstreamException("agent", e.getRawStatusCode(), e.getResponseBodyAsString(), e);
        } catch (UpstreamException e) {
            throw e;
        } catch (Exception e) {
            log.error("[AGENT] /finalize FAILED visit={} err={}", visitId, e.toString(), e);
            throw new UpstreamException("agent", 0, e.toString(), e);
        }
    }

    public ChatTurnsDto getReportChat(UUID visitId) {
        log.info("[AGENT] GET /agents/report/chat visitId={}", visitId);
        try {
            ChatTurnsDto resp = client.get()
                .uri(uri -> uri.path("/agents/report/chat")
                    .queryParam("visit_id", visitId.toString())
                    .queryParam("agent_type", "report")
                    .build())
                .retrieve()
                .bodyToMono(ChatTurnsDto.class)
                .block();
            if (resp == null) return new ChatTurnsDto(List.of());
            log.info("[AGENT] /chat OK visitId={} turns={}", visitId, resp.turns().size());
            return resp;
        } catch (WebClientResponseException e) {
            log.error("[AGENT] /chat HTTP {} visit={} body={}", e.getRawStatusCode(), visitId, e.getResponseBodyAsString());
            throw new UpstreamException("agent", e.getRawStatusCode(), e.getResponseBodyAsString(), e);
        } catch (Exception e) {
            log.error("[AGENT] /chat FAILED visit={} err={}", visitId, e.toString(), e);
            throw new UpstreamException("agent", 0, e.toString(), e);
        }
    }

    public record ChatTurnsDto(List<ChatTurnDto> turns) {}

    public record ChatTurnDto(
        @com.fasterxml.jackson.annotation.JsonProperty("turn_index") int turnIndex,
        String role,
        String content,
        @com.fasterxml.jackson.annotation.JsonProperty("tool_call_name") String toolCallName,
        @com.fasterxml.jackson.annotation.JsonProperty("created_at") String createdAt
    ) {}
}

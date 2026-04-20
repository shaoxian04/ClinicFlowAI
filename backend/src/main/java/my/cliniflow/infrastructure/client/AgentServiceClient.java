package my.cliniflow.infrastructure.client;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
public class AgentServiceClient {

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

    public PreVisitTurnResult callPreVisitTurn(Map<String, Object> structured) {
        return withCorrelation(client.post().uri("/agents/pre-visit/turn"))
            .bodyValue(new PreVisitTurnRequest(structured))
            .retrieve()
            .bodyToMono(PreVisitTurnResult.class)
            .block();
    }

    private WebClient.RequestBodySpec withCorrelation(WebClient.RequestBodySpec spec) {
        String cid = MDC.get("correlationId");
        if (cid != null) {
            spec = (WebClient.RequestBodySpec) spec.header("X-Correlation-ID", cid);
        }
        return spec;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PreVisitTurnRequest(Map<String, Object> structured) {}

    public record PreVisitTurnResult(
        String assistantMessage,
        Map<String, Object> fields,
        boolean done
    ) {}

    public SoapResult callVisitGenerate(UUID visitId, Map<String, Object> preVisit, String transcript) {
        VisitGenerateRequest req = new VisitGenerateRequest(visitId.toString(), transcript == null ? "" : transcript, preVisit == null ? Map.of() : preVisit);
        VisitGenerateResponse resp = withCorrelation(client.post().uri("/agents/visit/generate"))
            .bodyValue(req)
            .retrieve()
            .bodyToMono(VisitGenerateResponse.class)
            .block();
        if (resp == null || resp.report() == null) {
            return new SoapResult("", "", "", "");
        }
        SoapReport r = resp.report();
        return new SoapResult(r.subjective(), r.objective(), r.assessment(), r.plan());
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record VisitGenerateRequest(String visitId, String transcript, Map<String, Object> preVisit) {}

    public record VisitGenerateResponse(String visitId, SoapReport report, boolean isAiDraft) {}

    public record SoapReport(String subjective, String objective, String assessment, String plan) {}

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
}

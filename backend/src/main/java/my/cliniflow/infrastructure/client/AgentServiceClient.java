package my.cliniflow.infrastructure.client;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

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
}

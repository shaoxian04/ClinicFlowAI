package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.VisitReadAppService;
import my.cliniflow.controller.biz.visit.request.ReportClarifyRequest;
import my.cliniflow.controller.biz.visit.request.ReportEditRequest;
import my.cliniflow.controller.biz.visit.request.ReportFinalizeRequest;
import my.cliniflow.controller.biz.visit.request.ReportGenerateRequest;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/visits/{visitId}/report")
public class ReportController {

    private final WebClient agentClient;
    private final String serviceToken;
    private final VisitReadAppService visitReads;

    public ReportController(
        WebClient.Builder builder,
        @Value("${cliniflow.agent.base-url}") String agentBaseUrl,
        @Value("${cliniflow.agent.service-token}") String serviceToken,
        VisitReadAppService visitReads
    ) {
        this.agentClient = builder.baseUrl(agentBaseUrl).build();
        this.serviceToken = serviceToken;
        this.visitReads = visitReads;
    }

    private record AgentCtx(UUID doctorId, UUID patientId) {}

    private AgentCtx resolveCtx(UUID visitId, Authentication auth) {
        UUID callerId = ((JwtService.Claims) auth.getPrincipal()).userId();
        VisitReadAppService.DoctorAndPatient dp = visitReads.findDoctorAndPatient(visitId);
        UUID doctorId = dp.doctorId() != null ? dp.doctorId() : callerId;
        return new AgentCtx(doctorId, dp.patientId());
    }

    @PostMapping(value = "/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> generate(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportGenerateRequest req,
        Authentication auth
    ) {
        AgentCtx ctx = resolveCtx(visitId, auth);
        Map<String, Object> body = new HashMap<>();
        body.put("visit_id", visitId.toString());
        body.put("patient_id", ctx.patientId().toString());
        body.put("doctor_id", ctx.doctorId().toString());
        body.put("specialty", req.specialty());
        body.put("transcript", req.transcript());
        return agentClient.post()
            .uri("/agents/report/generate")
            .header("X-Service-Token", serviceToken)
            .bodyValue(body)
            .retrieve()
            .bodyToFlux(String.class);
    }

    @PostMapping(value = "/clarify", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> clarify(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportClarifyRequest req,
        Authentication auth
    ) {
        AgentCtx ctx = resolveCtx(visitId, auth);
        return agentClient.post()
            .uri("/agents/report/clarify")
            .header("X-Service-Token", serviceToken)
            .bodyValue(Map.of(
                "visit_id", visitId.toString(),
                "patient_id", ctx.patientId().toString(),
                "doctor_id", ctx.doctorId().toString(),
                "answer", req.answer()
            ))
            .retrieve()
            .bodyToFlux(String.class);
    }

    @PostMapping(value = "/edit", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> edit(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportEditRequest req,
        Authentication auth
    ) {
        AgentCtx ctx = resolveCtx(visitId, auth);
        return agentClient.post()
            .uri("/agents/report/edit")
            .header("X-Service-Token", serviceToken)
            .bodyValue(Map.of(
                "visit_id", visitId.toString(),
                "patient_id", ctx.patientId().toString(),
                "doctor_id", ctx.doctorId().toString(),
                "edit", req.edit()
            ))
            .retrieve()
            .bodyToFlux(String.class);
    }

    @PostMapping("/finalize")
    @SuppressWarnings({"rawtypes", "unchecked"})
    public ResponseEntity<Map<String, Object>> finalizeReport(
        @PathVariable UUID visitId,
        @Valid @RequestBody(required = false) ReportFinalizeRequest req
    ) {
        Map<String, Object> result = (Map<String, Object>) agentClient.post()
            .uri("/agents/report/finalize")
            .header("X-Service-Token", serviceToken)
            .bodyValue(Map.of("visit_id", visitId.toString()))
            .retrieve()
            .bodyToMono(Map.class)
            .block();
        return ResponseEntity.ok(result);
    }
}

package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.base.UpstreamException;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicReference;

/**
 * Consumes the agent's SSE stream (each element a raw "event: X\ndata: {...}"
 * block, already parsed by WebClient into one line per SSE payload — the
 * raw line-based parsing is on us).
 *
 * Reduces events into a single {@link AggregateResult}. Rules in spec §4.4.
 */
@Service
public class ReportAggregatorService {

    private static final Logger log = LoggerFactory.getLogger(ReportAggregatorService.class);

    private final ObjectMapper mapper;

    public ReportAggregatorService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public record AggregateResult(
        String status,                  // "complete" | "clarification_pending"
        MedicalReportDto report,        // nullable (e.g. pre-first-draft clarification)
        Clarification clarification     // nullable
    ) {}

    public record Clarification(String field, String prompt, String context) {}

    /**
     * Reduce an SSE stream to a single aggregate. On agent.error, throws
     * UpstreamException (maps to 502 via GlobalExceptionConfiguration).
     *
     * Input stream format: each element is a full SSE frame (Spring's WebClient
     * bodyToFlux(String.class) with TEXT_EVENT_STREAM splits on "\n\n" and
     * strips the "data: " prefix of the last non-empty data line per frame).
     * Tolerate both raw ("event: X\ndata: Y") frames and already-extracted
     * data payloads.
     */
    /**
     * Aggregate from a typed ServerSentEvent flux (the real Spring WebClient
     * path). This is what production calls — Spring strips SSE framing when
     * you bodyToFlux(String.class), losing the event name. Use this overload
     * so we get both event() and data().
     */
    public Mono<AggregateResult> aggregateSse(Flux<ServerSentEvent<String>> stream) {
        Flux<String> frames = stream.map(sse -> {
            String event = sse.event() == null ? "unknown" : sse.event();
            String data = sse.data() == null ? "" : sse.data();
            return "event: " + event + "\ndata: " + data + "\n\n";
        });
        return aggregate(frames);
    }

    public Mono<AggregateResult> aggregate(Flux<String> stream) {
        AtomicReference<MedicalReportDto> latestReport = new AtomicReference<>();
        AtomicReference<Clarification> pending = new AtomicReference<>();
        AtomicReference<String> status = new AtomicReference<>("complete");
        AtomicReference<Throwable> errorHolder = new AtomicReference<>();

        return stream
            .doOnNext(frame -> handleFrame(frame, latestReport, pending, status, errorHolder))
            .then(Mono.defer(() -> {
                if (errorHolder.get() != null) {
                    return Mono.error(errorHolder.get());
                }
                return Mono.just(new AggregateResult(status.get(), latestReport.get(), pending.get()));
            }));
    }

    private void handleFrame(
        String frame,
        AtomicReference<MedicalReportDto> latestReport,
        AtomicReference<Clarification> pending,
        AtomicReference<String> status,
        AtomicReference<Throwable> errorHolder
    ) {
        ParsedFrame pf = parseFrame(frame);
        if (pf == null) return;

        log.debug("[REVIEW] agg event={} dataLen={}", pf.event, pf.data == null ? 0 : pf.data.length());
        try {
            switch (pf.event) {
                case "tool.call" -> {
                    JsonNode node = mapper.readTree(pf.data);
                    String name = node.path("name").asText("");
                    JsonNode args = node.path("args");
                    if ("update_soap_draft".equals(name) && args.has("report")) {
                        MedicalReportDto dto = mapper.treeToValue(args.get("report"), MedicalReportDto.class);
                        latestReport.set(dto);
                        log.info("[REVIEW] captured update_soap_draft chiefComplaint={}",
                            dto.subjective() == null ? "null" : dto.subjective().chiefComplaint());
                    } else if ("ask_doctor_clarification".equals(name)) {
                        pending.set(new Clarification(
                            args.path("field").asText(""),
                            args.path("prompt").asText(""),
                            args.path("context").asText("")
                        ));
                    }
                }
                case "clarification.needed" -> {
                    JsonNode node = mapper.readTree(pf.data);
                    pending.set(new Clarification(
                        node.path("field").asText(""),
                        node.path("prompt").asText(""),
                        node.path("context").asText("")
                    ));
                    status.set("clarification_pending");
                    log.info("[REVIEW] clarification pending field={}", node.path("field").asText(""));
                }
                case "turn.complete" -> {
                    if (pending.get() == null) status.set("complete");
                }
                case "agent.error" -> {
                    String msg = "agent.error";
                    try { msg = mapper.readTree(pf.data).path("message").asText(msg); } catch (Exception ignore) {}
                    errorHolder.set(new UpstreamException("agent", 500, msg, null));
                    log.error("[REVIEW] agent.error surfaced msg={}", msg);
                }
                default -> { /* turn.start, reasoning.delta, message.delta, tool.result — no-op */ }
            }
        } catch (Exception e) {
            log.warn("[REVIEW] frame parse error event={} err={}", pf.event, e.toString());
        }
    }

    private static ParsedFrame parseFrame(String frame) {
        if (frame == null || frame.isBlank()) return null;
        String event = null, data = null;
        for (String line : frame.split("\n")) {
            if (line.startsWith("event:")) event = line.substring(6).trim();
            else if (line.startsWith("data:")) {
                String part = line.substring(5).trim();
                data = data == null ? part : data + part;
            }
        }
        // Tolerate bare JSON data without "event:" prefix — try to infer
        if (event == null && data != null && data.startsWith("{")) {
            // default to unknown; handler will no-op
            event = "unknown";
        }
        if (event == null) return null;
        return new ParsedFrame(event, data);
    }

    private record ParsedFrame(String event, String data) {}
}

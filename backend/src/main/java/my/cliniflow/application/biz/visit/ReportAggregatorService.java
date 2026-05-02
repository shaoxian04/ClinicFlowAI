package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Consumes the agent's SSE stream and reduces events into a single
 * {@link AggregateResult}. Rules in spec §4.4.
 */
public interface ReportAggregatorService {

    record AggregateResult(
        String status,                  // "complete" | "clarification_pending"
        MedicalReportDto report,        // nullable (e.g. pre-first-draft clarification)
        Clarification clarification     // nullable
    ) {}

    record Clarification(String field, String prompt, String context) {}

    Mono<AggregateResult> aggregateSse(Flux<ServerSentEvent<String>> stream);

    Mono<AggregateResult> aggregate(Flux<String> stream);
}

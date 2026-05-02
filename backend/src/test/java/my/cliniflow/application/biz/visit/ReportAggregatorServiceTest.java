package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;

import static org.assertj.core.api.Assertions.assertThat;

class ReportAggregatorServiceTest {

    private final ReportAggregatorService svc = new ReportAggregatorServiceImpl(new ObjectMapper());

    @Test
    void reducesUpdateSoapDraftAndTurnCompleteIntoCompleteStatus() {
        Flux<String> stream = Flux.just(
            "event: turn.start\ndata: {\"turn_index\": 1}\n\n",
            "event: tool.call\ndata: {\"name\": \"update_soap_draft\", \"args\": {\"report\": " +
                "{\"subjective\": {\"chief_complaint\": \"cough\", \"history_of_present_illness\": \"3d\", \"associated_symptoms\": [], \"relevant_history\": []}," +
                " \"objective\": {\"vital_signs\": {}}, \"assessment\": {\"primary_diagnosis\": \"bronchitis\", \"differential_diagnoses\": [], \"icd10_codes\": []}," +
                " \"plan\": {\"medications\": [], \"investigations\": [], \"lifestyle_advice\": [], \"follow_up\": {\"needed\": false}, \"red_flags\": []}}}}\n\n",
            "event: turn.complete\ndata: {\"turn_index\": 3}\n\n"
        );
        ReportAggregatorService.AggregateResult result = svc.aggregate(stream).block();
        assertThat(result).isNotNull();
        assertThat(result.status()).isEqualTo("complete");
        assertThat(result.report()).isNotNull();
        assertThat(result.report().subjective().chiefComplaint()).isEqualTo("cough");
        assertThat(result.clarification()).isNull();
    }

    @Test
    void reducesClarificationIntoClarificationPending() {
        Flux<String> stream = Flux.just(
            "event: tool.call\ndata: {\"name\": \"ask_doctor_clarification\", \"args\": " +
                "{\"field\": \"subjective.chief_complaint\", \"prompt\": \"What's the CC?\", \"context\": \"unclear\"}}\n\n",
            "event: clarification.needed\ndata: {\"field\": \"subjective.chief_complaint\", \"prompt\": \"What's the CC?\", \"context\": \"unclear\"}\n\n"
        );
        ReportAggregatorService.AggregateResult result = svc.aggregate(stream).block();
        assertThat(result.status()).isEqualTo("clarification_pending");
        assertThat(result.report()).isNull();
        assertThat(result.clarification()).isNotNull();
        assertThat(result.clarification().field()).isEqualTo("subjective.chief_complaint");
    }

    @Test
    void agentErrorEventThrowsUpstreamException() {
        Flux<String> stream = Flux.just(
            "event: agent.error\ndata: {\"message\": \"step limit exceeded\"}\n\n"
        );
        org.junit.jupiter.api.Assertions.assertThrows(
            my.cliniflow.controller.base.UpstreamException.class,
            () -> svc.aggregate(stream).block()
        );
    }
}

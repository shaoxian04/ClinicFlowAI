package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record VisitDetailResponse(
    UUID visitId,
    UUID patientId,
    String patientName,
    VisitStatus status,
    Map<String, Object> preVisitStructured,
    Soap soap,
    OffsetDateTime createdAt,
    OffsetDateTime finalizedAt
) {
    public record Soap(
        String subjective,
        String objective,
        String assessment,
        String plan,
        boolean finalized,
        String aiDraftHash
    ) {}
}
